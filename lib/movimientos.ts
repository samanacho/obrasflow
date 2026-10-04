// Datos puros (sin dependencias de servidor) del módulo "Movimientos" —
// se importa tanto desde lib/itemKinds.ts (que a su vez se usa en
// componentes cliente) como desde lib/spent.ts (servidor). Por eso NO
// puede importar nada de "./prisma" acá: el cálculo real vive aparte, en
// lib/spent.ts, para no arrastrar el cliente de Prisma al bundle del navegador.

/**
 * Tipos de movimiento. `effect` determina cómo impacta cada uno en
 * `Project.spent` (Ejecutado) — ver lib/spent.ts:
 *  - "add": plata efectivamente pagada/desembolsada — suma al ejecutado.
 *  - "subtract": devolución/reintegro — resta del ejecutado.
 *  - "none": no es un desembolso real todavía (orden de cambio = impacto
 *    de presupuesto/alcance; ingreso de capital = fondeo, no es un costo
 *    de obra) — queda fuera de la suma pero visible en el listado y en el
 *    panel resumen.
 */
export const MOVIMIENTO_TIPOS = [
  { value: "Gasto", effect: "add" },
  { value: "Adelanto", effect: "add" },
  { value: "Pago / certificación de avance", effect: "add" },
  { value: "Devolución", effect: "subtract" },
  { value: "Orden de cambio", effect: "none" },
  { value: "Ingreso de capital", effect: "none" },
] as const;

// ── Regla de estado (decisión del dueño, 2026-10-04) ───────────────────
// Un movimiento "Pendiente" (deuda a pagar) NO suma ni resta al Ejecutado
// hasta que figure como pagado ("Pagado" o "Conciliado"). Un estado vacío
// (registros viejos de antes de que existiera el campo) cuenta como pagado.
// Todo cálculo del Ejecutado (servidor, pantallas, Memby) pasa por acá, así
// la regla vive en un solo lugar.

export const ESTADO_PENDIENTE = "Pendiente";
export const ESTADO_PAGADO = "Pagado";

/** true si el estado del movimiento es "Pendiente" (sin importar mayúsculas ni espacios). */
export function esPendiente(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === ESTADO_PENDIENTE.toLowerCase();
}

/** Si un movimiento con este estado cuenta para el Ejecutado: todo menos "Pendiente". */
export function cuentaEnEjecutado(status: string | null | undefined): boolean {
  return !esPendiente(status);
}

const EFECTO_POR_TIPO = new Map<string, number>(
  MOVIMIENTO_TIPOS.map((t) => [t.value, t.effect === "add" ? 1 : t.effect === "subtract" ? -1 : 0])
);

/** Efecto que tendría el tipo si estuviera pagado: +1 suma, -1 resta, 0 no mueve el Ejecutado. */
export function efectoDelTipo(tipo: unknown): 1 | -1 | 0 {
  return (EFECTO_POR_TIPO.get(String(tipo ?? "")) ?? 0) as 1 | -1 | 0;
}

/** Efecto real hoy, combinando tipo y estado: un pendiente siempre es 0. */
export function efectoMovimiento(tipo: unknown, status: string | null | undefined): 1 | -1 | 0 {
  return cuentaEnEjecutado(status) ? efectoDelTipo(tipo) : 0;
}

/** Monto del movimiento como número (0 si falta o no es un número). */
export function montoMovimiento(data: unknown): number {
  const n = Number((data as { monto?: unknown } | null | undefined)?.monto ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Lo mínimo de un movimiento para calcular: sirve tanto la fila de Prisma como el DTO de la pantalla. */
export interface MovimientoParaCalculo {
  status?: string | null;
  data?: unknown;
}

/** Cuánto mueve este movimiento el Ejecutado hoy (con signo; 0 si es pendiente o no es gasto). */
export function aporteAlEjecutado(m: MovimientoParaCalculo): number {
  const data = m.data as { tipo?: unknown } | null | undefined;
  return efectoMovimiento(data?.tipo, m.status) * montoMovimiento(m.data);
}

/** El Ejecutado de una obra a partir de sus movimientos — nunca negativo (mismo criterio de siempre). */
export function calcularEjecutado(items: MovimientoParaCalculo[]): number {
  return Math.max(0, items.reduce((acc, m) => acc + aporteAlEjecutado(m), 0));
}

/**
 * Pendientes que moverían el Ejecutado al pagarse: cuántos son y cuánto
 * sumarían (con signo). Las órdenes de cambio e ingresos de capital
 * pendientes quedan afuera: tampoco sumarían pagados.
 */
export function resumenPendientes(items: MovimientoParaCalculo[]): { cantidad: number; monto: number } {
  let cantidad = 0;
  let monto = 0;
  for (const m of items) {
    const data = m.data as { tipo?: unknown } | null | undefined;
    const efecto = efectoDelTipo(data?.tipo);
    if (!esPendiente(m.status) || efecto === 0) continue;
    cantidad++;
    monto += efecto * montoMovimiento(m.data);
  }
  return { cantidad, monto };
}
