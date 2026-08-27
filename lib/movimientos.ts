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
