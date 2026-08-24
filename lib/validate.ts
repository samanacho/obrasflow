import type { ProjectInput } from "./types";

const TYPES = ["civil", "electrico", "vial", "otro"];
const STATUSES = ["planificado", "en_curso", "pausado", "finalizado"];

export class ValidationError extends Error {}

/** Valida y normaliza el body entrante (create o update completo). Lanza ValidationError con mensaje legible. */
export function parseProjectInput(body: unknown): ProjectInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Cuerpo de la solicitud inválido.");
  }
  const b = body as Record<string, unknown>;

  const name = String(b.name ?? "").trim();
  if (!name) throw new ValidationError("El nombre del proyecto es obligatorio.");

  const type = String(b.type ?? "");
  if (!TYPES.includes(type)) throw new ValidationError(`Tipo inválido: "${type}".`);

  const status = String(b.status ?? "planificado");
  if (!STATUSES.includes(status)) throw new ValidationError(`Estado inválido: "${status}".`);

  const manager = String(b.manager ?? "").trim();
  if (!manager) throw new ValidationError("El responsable es obligatorio.");

  const start = String(b.start ?? "");
  const end = String(b.end ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new ValidationError("Fecha de inicio inválida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new ValidationError("Fecha de fin inválida.");

  const budget = Number(b.budget);
  const spent = Number(b.spent);
  const progress = Number(b.progress);
  if (!Number.isFinite(budget) || budget < 0) throw new ValidationError("Presupuesto inválido.");
  if (!Number.isFinite(spent) || spent < 0) throw new ValidationError("Ejecutado inválido.");
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new ValidationError("El avance debe estar entre 0 y 100.");
  }

  return {
    name,
    type: type as ProjectInput["type"],
    status: status as ProjectInput["status"],
    manager,
    start,
    end,
    budget,
    spent,
    progress: Math.round(progress),
  };
}
