import type { ProjectInput } from "./types";
import { PARAGUAY_DEPARTMENTS } from "./departments";
import { isValidYmd } from "./dates";

/** Tope de las columnas Decimal(14,2) de montos: más que eso, Postgres falla con "numeric overflow". */
export const MAX_MONTO_GS = 999_999_999_999;

const TYPES = ["civil", "electrico", "vial", "otro"];
const STATUSES = ["planificado", "en_curso", "pausado", "finalizado"];
const SECTORS = ["privado", "publico"];

export class ValidationError extends Error {}

/**
 * Monto de un movimiento de Ejecución (data.monto de un ProjectItem
 * change_order): guaraníes enteros, ni negativo ni texto. Antes se aceptaba
 * cualquier cosa: "-500000" en un Gasto bajaba el Ejecutado y "abc" se
 * ignoraba sin aviso al sumar. Devuelve el data con el monto redondeado.
 */
export function normalizeMovimientoData(data: unknown): { data: Record<string, unknown> } | { error: string } {
  if (data === undefined || data === null) return { data: {} };
  if (typeof data !== "object" || Array.isArray(data)) return { error: "Datos del movimiento inválidos." };
  const d = { ...(data as Record<string, unknown>) };
  if (d.monto === undefined || d.monto === null || d.monto === "") return { data: d };
  const monto = Number(d.monto);
  if (!Number.isFinite(monto)) return { error: "El monto tiene que ser un número." };
  // Una orden de cambio puede achicar el alcance (negativa); no suma al Ejecutado.
  if (monto < 0 && d.tipo !== "Orden de cambio") return { error: "El monto no puede ser negativo." };
  if (Math.abs(monto) > MAX_MONTO_GS) return { error: "El monto es demasiado grande: revisá que no sobren ceros." };
  d.monto = Math.round(monto);
  return { data: d };
}

/**
 * Un enlace que se va a mostrar en un href: solo http(s). Un "javascript:..."
 * guardado en un registro se ejecutaría al hacerle clic.
 */
export function esUrlSegura(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

export const ERROR_ENLACE = "El enlace tiene que empezar con http:// o https://";

/** data.url de un registro (documentos, fotos): vacío está bien; si viene, tiene que ser http(s). */
export function enlaceInvalido(data: unknown): boolean {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const url = (data as Record<string, unknown>).url;
  if (url === undefined || url === null || url === "") return false;
  return typeof url !== "string" || !esUrlSegura(url);
}

/** Valida y normaliza el body entrante (create o update completo). Lanza ValidationError con mensaje legible. */
export function parseProjectInput(body: unknown): ProjectInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("Cuerpo de la solicitud inválido.");
  }
  const b = body as Record<string, unknown>;

  const name = String(b.name ?? "").trim();
  if (!name) throw new ValidationError("El nombre del proyecto es obligatorio.");

  const reference = String(b.reference ?? "").trim().slice(0, 120) || null;
  // Sitio: igual que `code`, si el pedido no lo trae no se toca (undefined);
  // vacío (null) sí lo desasigna.
  const sitioNombre = "sitioNombre" in b ? String(b.sitioNombre ?? "").trim().slice(0, 120) || null : undefined;
  // Código para emparejar con Residente de Obra. Si el pedido no lo trae, no
  // se toca (undefined) — así un formulario viejo no borra el ya cargado.
  let code: string | null | undefined;
  if ("code" in b) {
    code = String(b.code ?? "").trim() || null;
    if (code && !/^[A-Za-z0-9._\/-]{1,40}$/.test(code)) {
      throw new ValidationError("El código de obra solo puede tener letras, números, punto, guion, barra o guion bajo (hasta 40).");
    }
  }

  const type = String(b.type ?? "");
  if (!TYPES.includes(type)) throw new ValidationError(`Tipo inválido: "${type}".`);

  const customType = type === "otro" ? String(b.customType ?? "").trim() : "";
  if (type === "otro" && !customType) throw new ValidationError("Especificá el rubro cuando el tipo es \"Otro\".");

  const status = String(b.status ?? "planificado");
  if (!STATUSES.includes(status)) throw new ValidationError(`Estado inválido: "${status}".`);

  const manager = String(b.manager ?? "").trim();
  if (!manager) throw new ValidationError("El responsable es obligatorio.");

  const city = String(b.city ?? "").trim() || null;
  const departmentRaw = String(b.department ?? "").trim();
  if (departmentRaw && !(PARAGUAY_DEPARTMENTS as readonly string[]).includes(departmentRaw)) {
    throw new ValidationError(`Departamento inválido: "${departmentRaw}".`);
  }
  const department = departmentRaw || null;
  const coordinatesRaw = String(b.coordinates ?? "").trim();
  const coordinates = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(coordinatesRaw) ? coordinatesRaw : null;

  const start = String(b.start ?? "");
  const end = String(b.end ?? "");
  if (!isValidYmd(start)) throw new ValidationError("Fecha de inicio inválida.");
  if (!isValidYmd(end)) throw new ValidationError("Fecha de fin inválida.");
  if (end < start) throw new ValidationError("La fecha de fin no puede ser anterior a la de inicio.");

  const budget = Number(b.budget);
  const spent = Number(b.spent);
  const progress = Number(b.progress);
  if (!Number.isFinite(budget) || budget < 0) throw new ValidationError("Presupuesto inválido.");
  if (budget > MAX_MONTO_GS) throw new ValidationError("El presupuesto es demasiado grande: revisá que no sobren ceros.");
  if (!Number.isFinite(spent) || spent < 0) throw new ValidationError("Ejecutado inválido.");
  if (spent > MAX_MONTO_GS) throw new ValidationError("El ejecutado es demasiado grande: revisá que no sobren ceros.");
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new ValidationError("El avance debe estar entre 0 y 100.");
  }

  const sectorRaw = b.sector ? String(b.sector) : "";
  if (sectorRaw && !SECTORS.includes(sectorRaw)) throw new ValidationError(`Sector inválido: "${sectorRaw}".`);
  const sector = sectorRaw ? (sectorRaw as ProjectInput["sector"]) : null;
  const sectorData =
    sector && b.sectorData && typeof b.sectorData === "object" ? (b.sectorData as Record<string, any>) : null;

  return {
    name,
    reference,
    code,
    sitioNombre,
    type: type as ProjectInput["type"],
    customType: type === "otro" ? customType : null,
    status: status as ProjectInput["status"],
    manager,
    city,
    department,
    coordinates,
    start,
    end,
    budget,
    spent,
    progress: Math.round(progress),
    sector,
    sectorData,
  };
}
