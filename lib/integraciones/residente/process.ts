import type { IntegrationEvent, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createProjectItem } from "@/lib/items";
import { getApiConfig, getParte } from "./client";
import { KNOWN_EVENTS, SOURCE, SOURCE_LABEL, type ResidenteEvent, type ResidenteParte } from "./types";

// Servidor únicamente. Aplica un evento de Residente de Obra ya guardado en
// IntegrationEvent. Nunca tira error: el resultado queda en la propia fila
// (status + error), así se puede ver qué pasó y reprocesar.

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Valida lo mínimo indispensable del cuerpo. Devuelve un mensaje si no sirve. */
export function checkEvent(body: unknown): { ok: true; event: ResidenteEvent } | { ok: false; error: string } {
  const e = body as Partial<ResidenteEvent> | null;
  if (!e || typeof e !== "object") return { ok: false, error: "Cuerpo inválido." };
  if (typeof e.id !== "string" || !e.id) return { ok: false, error: "Falta el id del evento." };
  if (typeof e.event !== "string" || !e.event) return { ok: false, error: "Falta el tipo de evento." };
  return { ok: true, event: e as ResidenteEvent };
}

/** Texto legible del parte para el campo "Detalle" del Parte Diario de ObrasFlow. */
export function parteToNotas(p: ResidenteParte): string {
  const lines: string[] = [];
  if (p.trabajo) lines.push(p.trabajo.trim());
  if (p.dotacion?.length) {
    lines.push("Subcontratistas: " + p.dotacion.map((d) => `${d.subcontratista} (${d.cantidad})`).join(", "));
  }
  if (p.avance?.length) {
    lines.push("Avance: " + p.avance.map((a) => `${a.item}: ${a.cantidad}${a.unidad ? " " + a.unidad : ""}`).join("; "));
  }
  if (p.fotos) lines.push(`${p.fotos} foto${p.fotos === 1 ? "" : "s"} en Residente de Obra`);
  return lines.join("\n");
}

function parteToItemData(p: ResidenteParte): Prisma.InputJsonValue {
  return {
    fecha: p.fecha,
    tipo: "Dato",
    clima: p.clima ?? "",
    personal: p.personal === null || p.personal === undefined ? "" : String(p.personal),
    notas: parteToNotas(p),
    // Marca de origen: la ficha muestra la etiqueta y no deja editarlo.
    origen: SOURCE,
    // Solo enlaces http(s): se muestra como link en la ficha.
    urlExterna: typeof p.url === "string" && /^https?:\/\//i.test(p.url) ? p.url : null,
    procesadoPor: SOURCE_LABEL + (p.cerrado_por ? ` · ${p.cerrado_por}` : ""),
    // El parte tal cual llegó, por si después queremos mostrar más datos.
    residente: p as unknown as Prisma.InputJsonValue,
  };
}

type Result = Pick<IntegrationEvent, "status" | "error" | "projectId">;

async function apply(ev: ResidenteEvent): Promise<Result> {
  if (!(KNOWN_EVENTS as readonly string[]).includes(ev.event)) {
    return { status: "ignorado", error: `Evento no manejado: ${ev.event}`, projectId: null };
  }

  const codigo = ev.data?.obra?.codigo?.trim();
  if (!codigo) return { status: "error", error: "El evento no trae el código de la obra.", projectId: null };

  const project = await prisma.project.findUnique({ where: { code: codigo }, select: { id: true } });
  if (!project) {
    return { status: "sin_obra", error: `No hay ninguna obra con el código "${codigo}" en ObrasFlow.`, projectId: null };
  }

  // Si el evento trae solo el id, el detalle se pide a su API (cuando exista).
  let parte = ev.data.parte;
  if (!parte && ev.data.parte_id) {
    if (!getApiConfig()) {
      return { status: "error", error: "El evento trae solo el id del parte y la API de Residente de Obra no está configurada.", projectId: project.id };
    }
    parte = await getParte(codigo, ev.data.parte_id);
  }
  if (!parte?.id || !FECHA.test(parte.fecha ?? "")) {
    return { status: "error", error: "El parte no trae id o fecha válida (AAAA-MM-DD).", projectId: project.id };
  }

  const title = `Parte diario de obra · ${parte.fecha}`;
  const data = parteToItemData(parte);
  const existing = await prisma.projectItem.findUnique({
    where: { externalSource_externalId: { externalSource: SOURCE, externalId: parte.id } },
    select: { id: true },
  });
  if (existing) {
    // Mismo parte reenviado (o reabierto y vuelto a cerrar): se actualiza, no se duplica.
    await prisma.projectItem.update({ where: { id: existing.id }, data: { title, data, projectId: project.id } });
  } else {
    await createProjectItem({
      projectId: project.id,
      kind: "daily_log",
      title,
      status: "Resuelto",
      data,
      externalSource: SOURCE,
      externalId: parte.id,
    });
  }
  return { status: "procesado", error: null, projectId: project.id };
}

/** Procesa una fila de IntegrationEvent y guarda el resultado en ella. */
export async function processEvent(row: IntegrationEvent): Promise<Result> {
  let result: Result;
  try {
    const check = checkEvent(row.payload);
    result = check.ok ? await apply(check.event) : { status: "error", error: check.error, projectId: null };
  } catch (err) {
    console.error("Residente de Obra: error al procesar el evento", row.id, err);
    result = { status: "error", error: err instanceof Error ? err.message : String(err), projectId: null };
  }
  await prisma.integrationEvent.update({
    where: { id: row.id },
    data: { ...result, processedAt: new Date() },
  });
  return result;
}

/**
 * Reprocesa los eventos que quedaron "sin_obra" o con "error" (ej. después
 * de cargar el código de la obra). Devuelve cuántos se aplicaron.
 */
export async function reprocessPending(limit = 100): Promise<{ total: number; procesados: number }> {
  const rows = await prisma.integrationEvent.findMany({
    where: { source: SOURCE, status: { in: ["sin_obra", "error"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let procesados = 0;
  for (const row of rows) {
    if ((await processEvent(row)).status === "procesado") procesados++;
  }
  return { total: rows.length, procesados };
}
