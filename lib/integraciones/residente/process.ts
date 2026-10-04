import type { IntegrationEvent, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createProjectItem } from "@/lib/items";
import { logChanges } from "@/lib/history";
import { ITEM_KINDS } from "@/lib/itemKinds";
import { getApiConfig, getParte } from "./client";
import { esHttp, msActualizado, normalizeParte } from "./normalize";
import { KNOWN_EVENTS, SOURCE, SOURCE_LABEL, type ResidenteEvent, type ResidenteFoto, type ResidenteParte } from "./types";

// Servidor únicamente. Aplica en la base los partes de Residente de Obra.
// Lo usan las dos vías de entrada, con el mismo código:
//   - el importador de archivos (app/api/projects/[id]/residente/importar)
//   - el webhook (dormido hasta que ellos lo tengan), que guarda cada evento
//     en IntegrationEvent y lo procesa acá. Nunca tira error: el resultado
//     queda en la propia fila (status + error).

/** Qué pasó (o pasaría, en la vista previa) con cada parte. */
export type ParteOutcome = "nuevo" | "actualizado" | "sin_cambios" | "error";

export interface ParteResultado {
  id: string;
  fecha: string;
  autor: string | null;
  /** Una línea con lo principal del parte, para mostrar. */
  resumen: string;
  outcome: ParteOutcome;
  error?: string;
}

/** Valida lo mínimo indispensable del cuerpo. Devuelve un mensaje si no sirve. */
export function checkEvent(body: unknown): { ok: true; event: ResidenteEvent } | { ok: false; error: string } {
  const e = body as Partial<ResidenteEvent> | null;
  if (!e || typeof e !== "object") return { ok: false, error: "Cuerpo inválido." };
  if (typeof e.id !== "string" || !e.id) return { ok: false, error: "Falta el id del evento." };
  if (typeof e.event !== "string" || !e.event) return { ok: false, error: "Falta el tipo de evento." };
  return { ok: true, event: e as ResidenteEvent };
}

/** Links de fotos del parte (solo http/https). */
export function fotosDelParte(p: ResidenteParte): ResidenteFoto[] {
  if (!Array.isArray(p.fotos)) return [];
  return p.fotos
    .map((f) => (typeof f === "string" ? { url: f } : f))
    .filter((f) => f && esHttp(f.url))
    .map((f) => ({ url: f.url.trim(), descripcion: f.descripcion ?? null }));
}

const autorDe = (p: ResidenteParte) => p.autor?.trim() || p.cerrado_por?.trim() || null;
const observacionesDe = (p: ResidenteParte) => p.observaciones?.trim() || p.trabajo?.trim() || null;

/** Texto legible del parte para el campo "Detalle" del Parte Diario de ObrasFlow. */
export function parteToNotas(p: ResidenteParte): string {
  const lines: string[] = [];
  const obs = observacionesDe(p);
  if (obs) lines.push(obs);
  if (p.dotacion?.length) {
    lines.push("Subcontratistas: " + p.dotacion.map((d) => `${d.subcontratista} (${d.cantidad})`).join(", "));
  }
  if (p.avance?.length) {
    lines.push("Avance: " + p.avance.map((a) => `${a.item}: ${a.cantidad}${a.unidad ? " " + a.unidad : ""}`).join("; "));
  }
  if (typeof p.fotos === "number" && p.fotos > 0) lines.push(`${p.fotos} foto${p.fotos === 1 ? "" : "s"} en Residente de Obra`);
  return lines.join("\n");
}

/** Título del registro: hay un parte por día y por persona, así que lleva el autor. */
export function parteTitle(p: ResidenteParte): string {
  const autor = autorDe(p);
  return `Parte diario de obra · ${p.fecha}` + (autor ? ` · ${autor}` : "");
}

function resumenDe(p: ResidenteParte): string {
  const base = observacionesDe(p) ?? (p.avance?.length ? "Avance: " + p.avance.map((a) => a.item).join(", ") : "");
  const una = base.replace(/\s+/g, " ").trim();
  return una.length > 120 ? una.slice(0, 117) + "…" : una;
}

function parteToItemData(p: ResidenteParte): Prisma.InputJsonValue {
  const autor = autorDe(p);
  const fotos = fotosDelParte(p);
  return {
    fecha: p.fecha,
    tipo: "Dato",
    clima: p.clima ?? "",
    personal: p.personal === null || p.personal === undefined ? "" : String(p.personal),
    notas: parteToNotas(p),
    // Marca de origen: la ficha muestra la etiqueta y no deja editarlo.
    origen: SOURCE,
    // Solo enlaces http(s): se muestra como link en la ficha.
    urlExterna: typeof p.url === "string" && esHttp(p.url) ? p.url : null,
    procesadoPor: SOURCE_LABEL + (autor ? ` · ${autor}` : ""),
    autor,
    // Última edición en Residente: al reimportar, solo se pisa con uno más nuevo.
    actualizadoAt: p.actualizado_at ?? null,
    // Links a las fotos (se abren dentro de Residente de Obra, con su usuario).
    fotos: fotos as unknown as Prisma.InputJsonValue,
    // El parte tal cual se leyó, por si después queremos mostrar más datos.
    residente: JSON.parse(JSON.stringify(p)) as Prisma.InputJsonValue,
  };
}

/** JSON con las claves ordenadas (Postgres no guarda el orden de las claves). */
function estable(v: unknown): string {
  const ordenar = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(ordenar)
      : x && typeof x === "object"
        ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, ordenar((x as Record<string, unknown>)[k])]))
        : x;
  return JSON.stringify(ordenar(JSON.parse(JSON.stringify(v ?? null))));
}

interface Existente {
  id: string;
  projectId: string;
  title: string;
  data: Prisma.JsonValue;
}

/**
 * Decide qué hacer con un parte que ya teníamos. Regla de Residente de Obra:
 * un parte se edita hasta las 06:00 del día siguiente y los cargados sin
 * señal llegan días después → nos quedamos con el MÁS NUEVO. Si los dos
 * traen "última modificación", se pisa solo si el que llega es más nuevo.
 * Si falta en alguno, se compara el contenido.
 */
function decidir(existente: Existente | undefined, projectId: string, title: string, data: Prisma.InputJsonValue, p: ResidenteParte): ParteOutcome {
  if (!existente) return "nuevo";
  const guardado = msActualizado((existente.data as Record<string, unknown> | null)?.actualizadoAt);
  const llega = msActualizado(p.actualizado_at);
  if (guardado !== null && llega !== null) return llega > guardado ? "actualizado" : "sin_cambios";
  const igual = existente.projectId === projectId && existente.title === title && estable(existente.data) === estable(data);
  return igual ? "sin_cambios" : "actualizado";
}

/**
 * Aplica (o, con dryRun, solo calcula) una lista de partes en una obra.
 * Mismo parte importado dos veces → se actualiza o queda igual, nunca se
 * duplica (índice único externalSource + externalId). Nunca tira error:
 * cada parte devuelve su resultado.
 */
export async function importPartes(projectId: string, partes: ResidenteParte[], opts: { dryRun?: boolean } = {}): Promise<ParteResultado[]> {
  // Lo que ya teníamos, en pocas consultas (no una por parte).
  const existentes = new Map<string, Existente>();
  const ids = [...new Set(partes.map((p) => p.id))];
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await prisma.projectItem.findMany({
      where: { externalSource: SOURCE, externalId: { in: ids.slice(i, i + 500) } },
      select: { id: true, projectId: true, title: true, data: true, externalId: true },
    });
    for (const r of rows) if (r.externalId) existentes.set(r.externalId, r);
  }

  const cfg = ITEM_KINDS.daily_log;
  const out: ParteResultado[] = [];
  for (const p of partes) {
    const base = { id: p.id, fecha: p.fecha, autor: autorDe(p), resumen: resumenDe(p) };
    try {
      const title = parteTitle(p);
      const data = parteToItemData(p);
      const existente = existentes.get(p.id);
      const outcome = decidir(existente, projectId, title, data, p);
      if (!opts.dryRun) {
        if (outcome === "nuevo") {
          const creado = await createProjectItem({
            projectId,
            kind: "daily_log",
            title,
            status: "Resuelto",
            data,
            externalSource: SOURCE,
            externalId: p.id,
          });
          existentes.set(p.id, { id: creado.id, projectId, title, data: data as Prisma.JsonValue });
        } else if (outcome === "actualizado" && existente) {
          // Mismo parte, versión más nueva (o reabierto y vuelto a cerrar): se actualiza, no se duplica.
          await prisma.projectItem.update({ where: { id: existente.id }, data: { title, data, projectId } });
          existentes.set(p.id, { ...existente, projectId, title, data: data as Prisma.JsonValue });
          await logChanges(
            prisma,
            projectId,
            [{ action: "registro_editado", detail: `${cfg.icon} ${cfg.singular}: "${title}" (versión más nueva de Residente de Obra)` }],
            SOURCE_LABEL + (base.autor ? ` · ${base.autor}` : "")
          );
        }
      }
      out.push({ ...base, outcome });
    } catch (err) {
      console.error("Residente de Obra: no se pudo guardar el parte", p.id, err);
      out.push({ ...base, outcome: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

/**
 * Pone el avance de la obra que calcula Residente de Obra (ponderando sus
 * ítems). Desde ahí la obra queda con "avance según Residente de Obra" y en
 * la app no se edita a mano. Se anota en el historial de cambios.
 */
export async function applyObraAvance(projectId: string, pct: number, at?: string | null): Promise<{ antes: number; despues: number }> {
  const despues = Math.max(0, Math.min(100, Math.round(pct)));
  const before = await prisma.project.findUnique({ where: { id: projectId }, select: { progress: true, progressSource: true } });
  if (!before) throw new Error("Obra no encontrada.");
  if (before.progress === despues && before.progressSource === SOURCE) return { antes: before.progress, despues };
  await prisma.project.update({ where: { id: projectId }, data: { progress: despues, progressSource: SOURCE } });
  let detalle = "Según Residente de Obra";
  if (at) {
    const d = new Date(at);
    if (!Number.isNaN(d.getTime())) detalle += `, al ${d.toLocaleDateString("es-PY", { timeZone: "America/Asuncion" })}`;
  }
  if (before.progressSource !== SOURCE) detalle += ". Desde ahora el avance de esta obra lo marca Residente de Obra";
  await logChanges(
    prisma,
    projectId,
    [{ action: "campo", field: "Avance", before: `${before.progress} %`, after: `${despues} %`, detail: detalle }],
    SOURCE_LABEL
  );
  return { antes: before.progress, despues };
}

/**
 * Fecha (ms) del avance más nuevo que ya se importó en esta obra, o null.
 * No hay un campo para eso en Project: se toma de los archivos importados
 * (IntegrationEvent "import.archivo", payload.avance.at). Sirve para no
 * pisar el avance con el de un archivo más viejo.
 */
export async function ultimoAvanceImportado(projectId: string): Promise<number | null> {
  const rows = await prisma.integrationEvent.findMany({
    where: { source: SOURCE, event: "import.archivo", projectId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { payload: true },
  });
  let max: number | null = null;
  for (const r of rows) {
    const p = r.payload as { avance?: { at?: unknown; aplicado?: unknown } | null } | null;
    if (p?.avance?.aplicado === false) continue;
    const ms = msActualizado(p?.avance?.at);
    if (ms !== null && (max === null || ms > max)) max = ms;
  }
  return max;
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
  let crudo: unknown = ev.data.parte;
  if (!crudo && ev.data.parte_id) {
    if (!getApiConfig()) {
      return { status: "error", error: "El evento trae solo el id del parte y la API de Residente de Obra no está configurada.", projectId: project.id };
    }
    crudo = await getParte(codigo, ev.data.parte_id);
  }
  const avisos: string[] = [];
  const parte = normalizeParte(crudo, avisos);
  if (!parte) return { status: "error", error: avisos.join(" ") || "El parte no trae id o fecha válida.", projectId: project.id };

  const [r] = await importPartes(project.id, [parte]);
  if (r.outcome === "error") return { status: "error", error: r.error ?? "No se pudo guardar el parte.", projectId: project.id };
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
 * Reprocesa los eventos del webhook que quedaron "sin_obra" o con "error"
 * (ej. después de cargar el código de la obra). Devuelve cuántos se
 * aplicaron. Los archivos importados (event "import.archivo") no se tocan.
 */
export async function reprocessPending(limit = 100): Promise<{ total: number; procesados: number }> {
  const rows = await prisma.integrationEvent.findMany({
    where: { source: SOURCE, status: { in: ["sin_obra", "error"] }, event: { not: "import.archivo" } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let procesados = 0;
  for (const row of rows) {
    if ((await processEvent(row)).status === "procesado") procesados++;
  }
  return { total: rows.length, procesados };
}
