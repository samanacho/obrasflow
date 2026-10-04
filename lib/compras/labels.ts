// Textos y formatos del módulo Compras que usan las pantallas (cliente).
// lib/compras/core.ts es solo de servidor: lo que la interfaz necesita de
// ahí se copia acá (y los tipos se importan con `import type`).

import { fmtGs as fmtGsLocal } from "../agent/format";

export { fmtGs } from "../agent/format";

/** Mismo texto que ESTADO_LABEL de core.ts. */
export const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Esperando aprobación",
  aprobado: "Aprobado · por pagar",
  rechazado: "Rechazado",
  pagado: "Pagado",
  anulado: "Anulado",
};

/** Tono del estado (clases of-chip-* de app/styles/compras.css). */
export const ESTADO_TONO: Record<string, "warn" | "accent" | "ok" | "crit" | "muted"> = {
  pendiente: "warn",
  aprobado: "accent",
  pagado: "ok",
  rechazado: "crit",
  anulado: "muted",
};

export const MEDIOS_PAGO = ["Efectivo", "Transferencia", "Cheque", "Tarjeta", "Crédito"] as const;
export const TIPOS_COMPROBANTE = ["Factura", "Nota de remisión", "Recibo"] as const;

/** 1500000 -> "1.500.000" (para prellenar campos de monto en guaraníes). */
export function fmtMiles(n: number): string {
  return fmtGsLocal(n).replace("Gs. ", "");
}

/** Cantidad con coma decimal y punto de miles: 1500 -> "1.500", 2.5 -> "2,5". */
export function fmtCant(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  const [ent, dec] = Math.abs(v).toFixed(3).replace(/\.?0+$/, "").split(".");
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${v < 0 ? "-" : ""}${miles}${dec ? `,${dec}` : ""}`;
}

/** "50" + "bolsa" -> "50 bolsa"; sin unidad, solo el número. */
export function fmtCantUnidad(n: number, unidad: string | null | undefined): string {
  return `${fmtCant(n)}${unidad ? ` ${unidad}` : ""}`;
}

/**
 * Número escrito a mano o copiado de una planilla, en formato de Paraguay o
 * internacional: "1.234.567" -> 1234567, "12,5" -> 12.5, "1.234,50" -> 1234.5,
 * "1,234.50" -> 1234.5, "Gs. 45.000" -> 45000. Devuelve null si no es un número.
 */
export function parseNumero(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw ?? "").trim();
  if (!s) return null;
  s = s.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // El separador que aparece último es el decimal.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = (s.match(/,/g)!.length > 1 ? s.replace(/,/g, "") : s.replace(",", "."));
  } else if (lastDot >= 0) {
    // "45.000" o "1.234.567" = miles (costumbre local); "12.5" = decimal.
    const dots = s.match(/\./g)!.length;
    if (dots > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Hoy en Paraguay como "YYYY-MM-DD" (para los campos de fecha). */
export function hoyPy(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
}
