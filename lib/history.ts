import type { Prisma, PrismaClient, Project } from "@prisma/client";
import { fmtGs } from "./agent/format";

// Servidor únicamente (usa Prisma). Historial de cambios de una obra
// (model ProjectChange): acá se arma el texto legible de cada cambio y se
// guarda. Todavía no hay usuarios con contraseña, así que se anota DESDE
// DÓNDE se hizo el cambio (app o WhatsApp), no la persona.

export const APP_SOURCE = "Desde la app";

/** "WhatsApp · Nombre" si el registro lo cargó el agente de WhatsApp, "Residente de Obra" si vino de esa app; si no, "Desde la app". */
export function sourceFromData(data: unknown): string {
  const p = (data as { procesadoPor?: unknown } | null | undefined)?.procesadoPor;
  return typeof p === "string" && (p.startsWith("WhatsApp") || p.startsWith("Residente de Obra")) ? p : APP_SOURCE;
}

export type HistoryAction = "campo" | "registro_agregado" | "registro_editado" | "registro_borrado" | "archivo";

export interface ChangeEntry {
  action: HistoryAction;
  field?: string | null;
  before?: string | null;
  after?: string | null;
  detail?: string | null;
}

export interface FieldDiff {
  field: string;
  before: string | null;
  after: string | null;
}

export const STATUS_LABEL: Record<string, string> = {
  planificado: "Planificado",
  en_curso: "En curso",
  pausado: "Pausado",
  finalizado: "Finalizado",
};

const TYPE_LABEL: Record<string, string> = {
  civil: "Civil",
  electrico: "Eléctrico",
  vial: "Vial",
};

type ProjectLike = Pick<
  Project,
  | "name"
  | "reference"
  | "type"
  | "customType"
  | "status"
  | "manager"
  | "city"
  | "department"
  | "start"
  | "end"
  | "budget"
  | "progress"
  | "coordinates"
  | "sitioId"
>;

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function fmtDate(v: unknown): string | null {
  if (!v) return null;
  const ymd = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${d}/${m}/${y}` : ymd;
}

function typeLabel(p: ProjectLike): string {
  if (p.type === "otro") return text(p.customType) ?? "Otro";
  return TYPE_LABEL[p.type] ?? String(p.type);
}

/** Campos de la obra que se anotan en el historial, con cómo mostrarlos. */
const FIELDS: { field: string; show: (p: ProjectLike) => string | null }[] = [
  { field: "Nombre", show: (p) => text(p.name) },
  { field: "Referencia", show: (p) => text(p.reference) },
  { field: "Rubro", show: (p) => typeLabel(p) },
  { field: "Estado", show: (p) => STATUS_LABEL[p.status] ?? text(p.status) },
  { field: "Responsable", show: (p) => text(p.manager) },
  { field: "Ciudad", show: (p) => text(p.city) },
  { field: "Departamento", show: (p) => text(p.department) },
  { field: "Inicio", show: (p) => fmtDate(p.start) },
  { field: "Fin", show: (p) => fmtDate(p.end) },
  { field: "Presupuesto", show: (p) => fmtGs(Number(p.budget)) },
  { field: "Avance", show: (p) => `${Number(p.progress) || 0} %` },
  { field: "Ubicación", show: (p) => (text(p.coordinates) ? "cargada" : "sin ubicación") },
  // El id del Sitio no le dice nada a nadie: se muestra si tiene o no.
  { field: "Sitio", show: (p) => (p.sitioId ? "asignado a un sitio" : "sin sitio") },
];

/** Compara dos versiones de una obra y devuelve solo lo que cambió, en texto legible. */
export function diffProject(before: ProjectLike, after: ProjectLike): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const { field, show } of FIELDS) {
    const b = show(before);
    const a = show(after);
    // Ubicación: moverse de un punto a otro también es un cambio aunque
    // las dos se muestren como "cargada".
    if (field === "Ubicación" && b === a && text(before.coordinates) !== text(after.coordinates)) {
      out.push({ field, before: "cargada", after: "cargada (se movió)" });
      continue;
    }
    // Sitio: cambiar de un sitio a otro.
    if (field === "Sitio" && b === a && before.sitioId !== after.sitioId) {
      out.push({ field, before: b, after: "cambiado a otro sitio" });
      continue;
    }
    if (b !== a) out.push({ field, before: b, after: a });
  }
  return out;
}

/**
 * Guarda cambios en el historial. Nunca tira error: el historial no puede
 * frenar un guardado. OJO: conviene llamarla con `prisma` DESPUÉS de que el
 * guardado terminó, no con el `tx` de una transacción — en Postgres un
 * error dentro de la transacción (ej. la tabla todavía no existe porque
 * falta `prisma db push`) la deja inutilizable y el guardado entero se
 * cae, aunque acá se atrape el error.
 */
export async function logChanges(
  db: PrismaClient | Prisma.TransactionClient,
  projectId: string,
  entries: ChangeEntry[],
  source: string
): Promise<void> {
  if (!entries.length) return;
  try {
    await db.projectChange.createMany({
      data: entries.map((e) => ({
        projectId,
        action: e.action,
        field: e.field ?? null,
        before: e.before ?? null,
        after: e.after ?? null,
        detail: e.detail ?? null,
        source,
      })),
    });
  } catch (err) {
    console.error("No se pudo anotar el historial de cambios:", err);
  }
}
