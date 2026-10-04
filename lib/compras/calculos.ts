// Cálculos de Compras sin base de datos: la parte donde un error cuesta
// guaraníes. Viven separados de core.ts para poder probarlos solos
// (lib/compras/calculos.test.ts).

import { fmtGs } from "../agent/format";

export class CompraError extends Error {}

export const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Esperando aprobación",
  aprobado: "Aprobado · por pagar",
  rechazado: "Rechazado",
  pagado: "Pagado",
  anulado: "Anulado",
};

// ------------------------------- pago -------------------------------

/** Lo máximo que entra en las columnas de plata (Decimal(14,2)). */
export const MONTO_MAXIMO = 999_999_999_999;

/**
 * Controla que el pedido se pueda pagar y devuelve el monto en guaraníes
 * enteros. Solo un pedido aprobado, con obra elegida y monto mayor a cero.
 */
export function validarPago(o: { status: string; numero: number; projectId: string | null }, montoIngresado: number): number {
  if (o.status !== "aprobado") {
    throw new CompraError(o.status === "pendiente" ? "Primero hay que aprobar el pedido." : `El pedido #${o.numero} está ${ESTADO_LABEL[o.status]?.toLowerCase()}: no se puede pagar.`);
  }
  if (!o.projectId) throw new CompraError("Elegí a qué obra va el pedido antes de pagarlo.");
  const monto = Math.round(Number(montoIngresado));
  if (!(monto > 0)) throw new CompraError("El monto pagado tiene que ser mayor a cero.");
  // Infinity pasa el "> 0" y un monto enorme no entra en Decimal(14,2):
  // mejor un aviso claro que un error 500 al guardar.
  if (!Number.isFinite(monto) || monto > MONTO_MAXIMO) throw new CompraError("El monto pagado es demasiado grande: revisá que esté bien escrito.");
  return monto;
}

/**
 * El IVA de la factura no puede superar lo que correspondería si todo el
 * total fuera de esa tasa (10 % → total/11, 5 % → total/21), como ya controla
 * el agente al cargar gastos. +1 de tolerancia por el redondeo.
 */
export function validarIva(total: number, iva10: number | null | undefined, iva5: number | null | undefined) {
  if ((iva10 ?? 0) > Math.round(total / 11) + 1) {
    throw new CompraError(`El IVA 10 % (${fmtGs(iva10!)}) es más de lo que corresponde a un total de ${fmtGs(total)}: revisá la liquidación del IVA.`);
  }
  if ((iva5 ?? 0) > Math.round(total / 21) + 1) {
    throw new CompraError(`El IVA 5 % (${fmtGs(iva5!)}) es más de lo que corresponde a un total de ${fmtGs(total)}: revisá la liquidación del IVA.`);
  }
}

// ------------------------------- presupuesto -------------------------------

export interface ItemPresupuesto {
  id: string;
  codigo: string | null;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  precioUnitario: number;
  categoria: string | null;
  orden: number;
}

/** Renglón de un pedido aprobado o pagado vinculado a un ítem del presupuesto. */
export interface RenglonPedido {
  budgetItemId: string;
  cantidad: number;
  precioUnitario: number | null;
  status: string;
}

export interface BudgetRowDTO {
  id: string;
  codigo: string | null;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  precioUnitario: number;
  total: number;
  categoria: string | null;
  orden: number;
  /** Cantidad en pedidos aprobados o pagados. */
  pedido: number;
  /** Cantidad en pedidos ya pagados. */
  comprado: number;
  /** Lo gastado en esos renglones pagados (con su precio real, o el presupuestado si no se cargó). */
  gastado: number;
  /** Precio real promedio de lo pagado (null si no hay precios cargados). */
  precioReal: number | null;
  /** "ok" | "cerca" (≥ 90 % de la cantidad) | "pasado" (más de lo presupuestado) | "precio" (precio real > 5 % arriba) */
  alerta: "ok" | "cerca" | "pasado" | "precio";
}

export interface ComparacionPresupuesto {
  items: BudgetRowDTO[];
  totales: { presupuestado: number; pedido: number; gastado: number };
}

/** Presupuestado contra pedido y gastado, por ítem y en total. */
export function compararPresupuesto(items: ItemPresupuesto[], renglones: RenglonPedido[]): ComparacionPresupuesto {
  const agg = new Map<string, { pedido: number; comprado: number; gastado: number; conPrecio: number; montoConPrecio: number }>();
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const l of renglones) {
    const item = byId.get(l.budgetItemId);
    if (!item) continue;
    const a = agg.get(l.budgetItemId) ?? { pedido: 0, comprado: 0, gastado: 0, conPrecio: 0, montoConPrecio: 0 };
    const c = l.cantidad;
    a.pedido += c;
    if (l.status === "pagado") {
      a.comprado += c;
      a.gastado += (l.precioUnitario ?? item.precioUnitario) * c;
      if (l.precioUnitario !== null) {
        a.conPrecio += c;
        a.montoConPrecio += l.precioUnitario * c;
      }
    }
    agg.set(l.budgetItemId, a);
  }
  let presupuestado = 0;
  let pedidoTotal = 0;
  let gastadoTotal = 0;
  const rows = items.map((i): BudgetRowDTO => {
    const a = agg.get(i.id) ?? { pedido: 0, comprado: 0, gastado: 0, conPrecio: 0, montoConPrecio: 0 };
    const { cantidad, precioUnitario: precio } = i;
    const precioReal = a.conPrecio > 0 ? a.montoConPrecio / a.conPrecio : null;
    presupuestado += cantidad * precio;
    pedidoTotal += a.pedido * precio;
    gastadoTotal += a.gastado;
    const alerta =
      cantidad > 0 && a.pedido > cantidad + 1e-9 ? "pasado" : precioReal !== null && precio > 0 && precioReal > precio * 1.05 ? "precio" : cantidad > 0 && a.pedido >= cantidad * 0.9 ? "cerca" : "ok";
    return {
      id: i.id,
      codigo: i.codigo,
      descripcion: i.descripcion,
      unidad: i.unidad,
      cantidad,
      precioUnitario: precio,
      total: Math.round(cantidad * precio),
      categoria: i.categoria,
      orden: i.orden,
      pedido: a.pedido,
      comprado: a.comprado,
      gastado: Math.round(a.gastado),
      precioReal: precioReal === null ? null : Math.round(precioReal),
      alerta,
    };
  });
  return { items: rows, totales: { presupuestado: Math.round(presupuestado), pedido: Math.round(pedidoTotal), gastado: Math.round(gastadoTotal) } };
}

// ------------------------- edición de un pedido aprobado -------------------------

export interface RenglonComparable {
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  budgetItemId: string | null;
}

function claveRenglon(l: RenglonComparable): string {
  const txt = (s: string | null) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  // Redondeo: la base guarda Decimal y la pantalla manda number; 2,5 y "2.50" son lo mismo.
  return [txt(l.descripcion), txt(l.unidad), Math.round(Number(l.cantidad) * 10_000), l.budgetItemId ?? ""].join("|");
}

/**
 * Decisión de Ignacio (04/10/2026): si a un pedido YA APROBADO le cambian
 * materiales, cantidades u obra, vuelve a "esperando aprobación". Esto dice
 * si la edición cambió algo de eso: renglones (descripción, unidad, cantidad o
 * vínculo al presupuesto) u obra. Cambiar solo el orden de los renglones no
 * cuenta. Notas, fecha y proveedor ni se miran: no devuelven a pendiente.
 */
export function requiereNuevaAprobacion(
  antes: { projectId: string | null; lines: RenglonComparable[] },
  despues: { projectId: string | null; lines: RenglonComparable[] }
): boolean {
  if ((antes.projectId ?? null) !== (despues.projectId ?? null)) return true;
  if (antes.lines.length !== despues.lines.length) return true;
  const a = antes.lines.map(claveRenglon).sort();
  const b = despues.lines.map(claveRenglon).sort();
  return a.some((k, i) => k !== b[i]);
}
