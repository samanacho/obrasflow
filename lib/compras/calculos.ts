// Cálculos de Compras sin base de datos: la parte donde un error cuesta
// guaraníes. Viven separados de core.ts para poder probarlos solos
// (lib/compras/calculos.test.ts).

export class CompraError extends Error {}

export const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Esperando aprobación",
  aprobado: "Aprobado · por pagar",
  rechazado: "Rechazado",
  pagado: "Pagado",
  anulado: "Anulado",
};

// ------------------------------- pago -------------------------------

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
  return monto;
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
