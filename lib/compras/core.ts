import type { BudgetItem, Prisma, Project, PurchaseOrder, PurchaseOrderLine, Supplier } from "@prisma/client";
import { prisma } from "../prisma";
import { createProjectItem } from "../items";
import { logChanges } from "../history";
import { fmtGs, normalizeText } from "../agent/format";
import { todayInParaguay } from "../dates";
import { CompraError, ESTADO_LABEL, compararPresupuesto, validarPago, type ComparacionPresupuesto } from "./calculos";

export { CompraError, ESTADO_LABEL, type BudgetRowDTO } from "./calculos";

// Módulo Compras: pedido de compra → aprobación → pago (crea el gasto en
// Ejecución de la obra) → factura, y comparación contra el presupuesto por
// ítem de la obra (BudgetItem). Servidor únicamente.
//
// Ojo: el conector de WhatsApp de la PC usa una base "remota" (cada operación
// de Prisma viaja a Vercel, ver lib/memby/remote-prisma.ts) que NO tiene
// $transaction. Por eso crear, aprobar y rechazar usan una sola operación
// cada una; pagar (que sí necesita transacción) corre solo en la app.

export const ESTADOS_PEDIDO = ["pendiente", "aprobado", "rechazado", "pagado", "anulado"] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

// ------------------------------- DTOs -------------------------------

export interface PurchaseLineDTO {
  id: string;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  precioUnitario: number | null;
  budgetItemId: string | null;
  /** Comparación con el presupuesto (null si el renglón no está vinculado a un ítem). */
  presupuesto: {
    descripcion: string;
    unidad: string | null;
    cantidad: number;
    precioUnitario: number;
    /** Cantidad pedida en OTROS pedidos aprobados o pagados de ese ítem. */
    pedidoAntes: number;
    /** Lo que queda por pedir después de este renglón (negativo = se pasa). */
    restante: number;
  } | null;
}

export interface PurchaseOrderDTO {
  id: string;
  numero: number;
  status: string;
  statusLabel: string;
  origen: string;
  solicitante: string;
  solicitantePhone: string | null;
  textoOriginal: string | null;
  projectId: string | null;
  projectName: string | null;
  obraTexto: string | null;
  fechaNecesaria: string | null;
  notas: string | null;
  supplierId: string | null;
  proveedorNombre: string | null;
  aprobadoPor: string | null;
  aprobadoAt: string | null;
  rechazoMotivo: string | null;
  montoPagado: number | null;
  medioPago: string | null;
  pagadoAt: string | null;
  gastoItemId: string | null;
  facturaTipo: string | null;
  facturaNumero: string | null;
  facturaRuc: string | null;
  facturaFecha: string | null;
  iva10: number | null;
  iva5: number | null;
  facturaMediaId: string | null;
  facturaAt: string | null;
  /** Pagado y sin datos de factura todavía. */
  faltaFactura: boolean;
  /** Estimado con los precios del presupuesto (antes de pagar). */
  montoEstimado: number | null;
  createdAt: string;
  lines: PurchaseLineDTO[];
}

type OrderWithRels = PurchaseOrder & {
  project: Pick<Project, "id" | "name" | "reference"> | null;
  supplier: Pick<Supplier, "id" | "name"> | null;
  lines: (PurchaseOrderLine & { budgetItem: BudgetItem | null })[];
};

export const ORDER_INCLUDE = {
  project: { select: { id: true, name: true, reference: true } },
  supplier: { select: { id: true, name: true } },
  lines: { orderBy: { orden: "asc" }, include: { budgetItem: true } },
} satisfies Prisma.PurchaseOrderInclude;

const num = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? null : Number(d));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function obraLabel(p: { name: string; reference: string | null } | null | undefined) {
  return p ? `${p.name}${p.reference ? ` (REF ${p.reference})` : ""}` : null;
}

/** Cantidad ya pedida por ítem de presupuesto en pedidos aprobados o pagados (excluyendo uno). */
async function pedidoPorItem(budgetItemIds: string[], excludeOrderId?: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!budgetItemIds.length) return out;
  const rows = await prisma.purchaseOrderLine.findMany({
    where: {
      budgetItemId: { in: budgetItemIds },
      order: { status: { in: ["aprobado", "pagado"] }, ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}) },
    },
    select: { budgetItemId: true, cantidad: true },
  });
  for (const r of rows) out.set(r.budgetItemId!, (out.get(r.budgetItemId!) ?? 0) + Number(r.cantidad));
  return out;
}

export async function serializeOrder(o: OrderWithRels, withComparison = true): Promise<PurchaseOrderDTO> {
  const ids = o.lines.map((l) => l.budgetItemId).filter((x): x is string => Boolean(x));
  const antes = withComparison ? await pedidoPorItem(ids, o.id) : new Map<string, number>();
  let estimado = 0;
  let todosConPrecio = o.lines.length > 0;
  const lines: PurchaseLineDTO[] = o.lines.map((l) => {
    const b = l.budgetItem;
    const cantidad = Number(l.cantidad);
    const precio = num(l.precioUnitario) ?? (b ? Number(b.precioUnitario) : null);
    if (precio === null) todosConPrecio = false;
    else estimado += precio * cantidad;
    const pedidoAntes = b ? antes.get(b.id) ?? 0 : 0;
    return {
      id: l.id,
      descripcion: l.descripcion,
      unidad: l.unidad,
      cantidad,
      precioUnitario: num(l.precioUnitario),
      budgetItemId: l.budgetItemId,
      presupuesto: b
        ? {
            descripcion: b.descripcion,
            unidad: b.unidad,
            cantidad: Number(b.cantidad),
            precioUnitario: Number(b.precioUnitario),
            pedidoAntes,
            restante: Number(b.cantidad) - pedidoAntes - cantidad,
          }
        : null,
    };
  });
  return {
    id: o.id,
    numero: o.numero,
    status: o.status,
    statusLabel: ESTADO_LABEL[o.status] ?? o.status,
    origen: o.origen,
    solicitante: o.solicitante,
    solicitantePhone: o.solicitantePhone,
    textoOriginal: o.textoOriginal,
    projectId: o.projectId,
    projectName: obraLabel(o.project),
    obraTexto: o.obraTexto,
    fechaNecesaria: iso(o.fechaNecesaria),
    notas: o.notas,
    supplierId: o.supplierId,
    proveedorNombre: o.supplier?.name ?? o.proveedorNombre,
    aprobadoPor: o.aprobadoPor,
    aprobadoAt: iso(o.aprobadoAt),
    rechazoMotivo: o.rechazoMotivo,
    montoPagado: num(o.montoPagado),
    medioPago: o.medioPago,
    pagadoAt: iso(o.pagadoAt),
    gastoItemId: o.gastoItemId,
    facturaTipo: o.facturaTipo,
    facturaNumero: o.facturaNumero,
    facturaRuc: o.facturaRuc,
    facturaFecha: iso(o.facturaFecha),
    iva10: num(o.iva10),
    iva5: num(o.iva5),
    facturaMediaId: o.facturaMediaId,
    facturaAt: iso(o.facturaAt),
    faltaFactura: o.status === "pagado" && !o.facturaNumero,
    montoEstimado: todosConPrecio ? Math.round(estimado) : estimado > 0 ? Math.round(estimado) : null,
    createdAt: o.createdAt.toISOString(),
    lines,
  };
}

export async function getOrder(id: string) {
  return prisma.purchaseOrder.findUnique({ where: { id }, include: ORDER_INCLUDE });
}

// ------------------------- emparejar con el presupuesto -------------------------

const STOP = new Set(["de", "del", "la", "el", "los", "las", "para", "con", "x", "y", "en", "un", "una", "por"]);
function tokens(s: string): string[] {
  return normalizeText(s)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith("es") ? t.slice(0, -2) : t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

/**
 * Ítem del presupuesto que mejor corresponde a una descripción de pedido
 * ("50 bolsas de cemento" → "Cemento Portland CP-II"). Por palabras en común;
 * si ninguna coincide lo suficiente, null (se vincula a mano en la app).
 */
export function matchBudgetItem(descripcion: string, items: Pick<BudgetItem, "id" | "descripcion" | "unidad">[]): string | null {
  const q = new Set(tokens(descripcion));
  if (!q.size) return null;
  let best: { id: string; score: number } | null = null;
  for (const it of items) {
    const t = tokens(`${it.descripcion} ${it.unidad ?? ""}`);
    if (!t.length) continue;
    const common = t.filter((x) => q.has(x) || [...q].some((y) => y.length >= 4 && (x.startsWith(y) || y.startsWith(x)))).length;
    if (!common) continue;
    const score = common / Math.min(q.size, new Set(t).size);
    if (!best || score > best.score) best = { id: it.id, score };
  }
  return best && best.score >= 0.5 ? best.id : null;
}

// ------------------------------- ciclo del pedido -------------------------------

export interface NewOrderInput {
  projectId?: string | null;
  obraTexto?: string | null;
  solicitante: string;
  solicitantePhone?: string | null;
  origen: "whatsapp" | "app";
  textoOriginal?: string | null;
  notas?: string | null;
  fechaNecesaria?: Date | null;
  supplierId?: string | null;
  proveedorNombre?: string | null;
  grupoJid?: string | null;
  waMessageId?: string | null;
  lines: { descripcion: string; unidad?: string | null; cantidad: number; budgetItemId?: string | null }[];
}

export async function createOrder(input: NewOrderInput) {
  // Por WhatsApp puede venir un material sin cantidad (0): se registra igual y se completa en la app.
  const lines = input.lines.filter((l) => l.descripcion.trim() && Number(l.cantidad) >= 0 && (input.origen === "whatsapp" || Number(l.cantidad) > 0));
  if (!lines.length) throw new CompraError("El pedido no tiene materiales con cantidad.");
  const budget = input.projectId
    ? await prisma.budgetItem.findMany({ where: { projectId: input.projectId }, select: { id: true, descripcion: true, unidad: true } })
    : [];
  const valid = new Set(budget.map((b) => b.id));
  return prisma.purchaseOrder.create({
    data: {
      projectId: input.projectId ?? null,
      obraTexto: input.projectId ? null : input.obraTexto ?? null,
      solicitante: input.solicitante.trim() || "Sin nombre",
      solicitantePhone: input.solicitantePhone ?? null,
      origen: input.origen,
      textoOriginal: input.textoOriginal ?? null,
      notas: input.notas?.trim() || null,
      fechaNecesaria: input.fechaNecesaria ?? null,
      supplierId: input.supplierId ?? null,
      proveedorNombre: input.supplierId ? null : input.proveedorNombre?.trim() || null,
      grupoJid: input.grupoJid ?? null,
      waMessageId: input.waMessageId ?? null,
      // "Recibido" ya se avisa en el grupo al llegar; el conector avisa los cambios que siguen.
      grupoAvisado: input.grupoJid ? "pendiente" : null,
      lines: {
        create: lines.map((l, i) => ({
          descripcion: l.descripcion.trim(),
          unidad: l.unidad?.trim() || null,
          cantidad: Number(l.cantidad),
          budgetItemId: l.budgetItemId && valid.has(l.budgetItemId) ? l.budgetItemId : matchBudgetItem(l.descripcion, budget),
          orden: i,
        })),
      },
    },
    include: ORDER_INCLUDE,
  });
}

/** Tarjetas de WhatsApp de aprobación de ese pedido que siguen abiertas: se cierran (ya se resolvió por otro lado). */
async function closeApprovalCards(orderId: string) {
  await prisma.whatsAppPendingAction
    .updateMany({ where: { kind: "aprobar_pedido", status: "pendiente", payload: { path: ["pedidoId"], equals: orderId } }, data: { status: "cancelada" } })
    .catch((err) => console.error("Compras: no se pudieron cerrar las tarjetas de aprobación", orderId, err));
}

export async function approveOrder(id: string, por: string, opts: { closeCards?: boolean } = {}) {
  const res = await prisma.purchaseOrder.updateMany({
    where: { id, status: "pendiente" },
    data: { status: "aprobado", aprobadoPor: por, aprobadoAt: new Date(), rechazoMotivo: null },
  });
  if (res.count !== 1) {
    const o = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true, numero: true } });
    if (!o) throw new CompraError("Ese pedido ya no existe.");
    throw new CompraError(`El pedido #${o.numero} ya no está esperando aprobación (está ${ESTADO_LABEL[o.status]?.toLowerCase() ?? o.status}).`);
  }
  if (opts.closeCards !== false) await closeApprovalCards(id);
  return prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
}

export async function rejectOrder(id: string, por: string, motivo: string | null, opts: { closeCards?: boolean } = {}) {
  const res = await prisma.purchaseOrder.updateMany({
    where: { id, status: { in: ["pendiente", "aprobado"] } },
    data: { status: "rechazado", aprobadoPor: por, aprobadoAt: new Date(), rechazoMotivo: motivo?.trim() || null },
  });
  if (res.count !== 1) {
    const o = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true, numero: true } });
    if (!o) throw new CompraError("Ese pedido ya no existe.");
    throw new CompraError(`El pedido #${o.numero} no se puede rechazar: está ${ESTADO_LABEL[o.status]?.toLowerCase() ?? o.status}.`);
  }
  if (opts.closeCards !== false) await closeApprovalCards(id);
  return prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
}

export async function annulOrder(id: string) {
  const res = await prisma.purchaseOrder.updateMany({ where: { id, status: { in: ["pendiente", "aprobado", "rechazado"] } }, data: { status: "anulado" } });
  if (res.count !== 1) throw new CompraError("Solo se puede anular un pedido que todavía no se pagó (si ya se pagó, borrá el gasto desde la obra).");
  await closeApprovalCards(id);
  return prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
}

/** Cambios mientras el pedido no está pagado: obra, proveedor, notas y renglones. */
export async function updateOrder(
  id: string,
  input: {
    projectId?: string | null;
    supplierId?: string | null;
    proveedorNombre?: string | null;
    notas?: string | null;
    fechaNecesaria?: Date | null;
    lines?: { id?: string; descripcion: string; unidad?: string | null; cantidad: number; budgetItemId?: string | null }[];
  }
) {
  const o = await prisma.purchaseOrder.findUnique({ where: { id }, select: { status: true, projectId: true } });
  if (!o) throw new CompraError("Ese pedido ya no existe.");
  if (!["pendiente", "aprobado"].includes(o.status)) throw new CompraError("Un pedido pagado, rechazado o anulado ya no se modifica.");
  const projectId = input.projectId !== undefined ? input.projectId : o.projectId;
  const budget = projectId ? await prisma.budgetItem.findMany({ where: { projectId }, select: { id: true, descripcion: true, unidad: true } }) : [];
  const valid = new Set(budget.map((b) => b.id));
  await prisma.$transaction(async (tx) => {
    // El estado se vuelve a mirar acá adentro: si lo pagaron entre la lectura
    // de arriba y este punto, no se tocan los renglones de un pedido ya pagado.
    const claimed = await tx.purchaseOrder.updateMany({
      where: { id, status: { in: ["pendiente", "aprobado"] } },
      data: {
        ...(input.projectId !== undefined ? { projectId: input.projectId, ...(input.projectId ? { obraTexto: null } : {}) } : {}),
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId, ...(input.supplierId ? { proveedorNombre: null } : {}) } : {}),
        ...(input.proveedorNombre !== undefined && !input.supplierId ? { proveedorNombre: input.proveedorNombre?.trim() || null } : {}),
        ...(input.notas !== undefined ? { notas: input.notas?.trim() || null } : {}),
        ...(input.fechaNecesaria !== undefined ? { fechaNecesaria: input.fechaNecesaria } : {}),
      },
    });
    if (claimed.count !== 1) throw new CompraError("El pedido cambió mientras lo editabas (¿lo pagaron o anularon desde otro lado?). No se guardó nada.");
    if (input.lines) {
      const clean = input.lines.filter((l) => l.descripcion.trim() && Number(l.cantidad) > 0);
      if (!clean.length) throw new CompraError("El pedido tiene que tener al menos un material con cantidad.");
      await tx.purchaseOrderLine.deleteMany({ where: { orderId: id } });
      await tx.purchaseOrderLine.createMany({
        data: clean.map((l, i) => ({
          orderId: id,
          descripcion: l.descripcion.trim(),
          unidad: l.unidad?.trim() || null,
          cantidad: Number(l.cantidad),
          budgetItemId: l.budgetItemId === null ? null : l.budgetItemId && valid.has(l.budgetItemId) ? l.budgetItemId : matchBudgetItem(l.descripcion, budget),
          orden: i,
        })),
      });
    } else if (input.projectId !== undefined && input.projectId !== o.projectId) {
      // Cambió la obra: los vínculos al presupuesto de la obra anterior ya no sirven; se vuelven a emparejar.
      const lines = await tx.purchaseOrderLine.findMany({ where: { orderId: id } });
      for (const l of lines) {
        await tx.purchaseOrderLine.update({ where: { id: l.id }, data: { budgetItemId: matchBudgetItem(l.descripcion, budget) } });
      }
    }
  });
  return prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
}

export interface PayInput {
  monto: number;
  fecha?: string | null;
  medioPago?: string | null;
  supplierId?: string | null;
  proveedorNombre?: string | null;
  /** Rubro de Ejecución donde queda el gasto (por defecto "Materiales"). */
  rubro?: string | null;
  precios?: { lineId: string; precioUnitario: number }[];
  por: string;
}

/**
 * Registra el pago: crea el gasto en Ejecución de la obra (suma al Ejecutado)
 * y deja el pedido como pagado, todo o nada. Si la factura ya estaba
 * cargada, sus datos van al gasto.
 */
export async function payOrder(id: string, input: PayInput) {
  const o = await prisma.purchaseOrder.findUnique({ where: { id }, include: { ...ORDER_INCLUDE, supplier: true } });
  if (!o) throw new CompraError("Ese pedido ya no existe.");
  const monto = validarPago(o, input.monto);
  const projectId = o.projectId!;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(input.fecha ?? "") ? input.fecha! : todayInParaguay();

  const supplierId = input.supplierId !== undefined ? input.supplierId : o.supplierId;
  const supplier = supplierId ? await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true, ruc: true } }) : null;
  const proveedorNombre = supplier?.name ?? (input.proveedorNombre?.trim() || o.proveedorNombre);
  const resumen = o.lines.map((l) => lineLabel(Number(l.cantidad), l.unidad, l.descripcion)).join(", ");
  const data: Record<string, unknown> = {
    tipo: "Gasto",
    monto,
    fecha,
    tipoInsumo: "Materiales",
    ...(supplier ? { proveedorId: supplier.id, proveedorNombre: supplier.name } : proveedorNombre ? { proveedorNombre } : {}),
    ...(input.medioPago ? { medioPago: input.medioPago } : {}),
    ...(o.facturaNumero ? { tipoComprobante: o.facturaTipo ?? "Factura", comprobante: o.facturaNumero } : {}),
    ...(o.facturaRuc ? { rucProveedor: o.facturaRuc } : {}),
    ...(o.iva10 ? { iva10: Number(o.iva10) } : {}),
    ...(o.iva5 ? { iva5: Number(o.iva5) } : {}),
    notas: `Pedido de compra #${o.numero}${resumen ? `: ${resumen}` : ""}`.slice(0, 500),
    procesadoPor: input.por,
    pedidoCompraId: o.id,
    pedidoCompraNumero: o.numero,
  };
  const precios = new Map((input.precios ?? []).filter((p) => Number(p.precioUnitario) >= 0).map((p) => [p.lineId, Number(p.precioUnitario)]));

  const item = await createProjectItem(
    { projectId, kind: "change_order", title: input.rubro?.trim() || "Materiales", status: "Pagado", data: data as Prisma.InputJsonValue, source: input.por },
    async (tx, created) => {
      const claimed = await tx.purchaseOrder.updateMany({
        where: { id, status: "aprobado" },
        data: {
          status: "pagado",
          montoPagado: monto,
          medioPago: input.medioPago || null,
          pagadoAt: new Date(`${fecha}T12:00:00-03:00`),
          gastoItemId: created.id,
          ...(supplier ? { supplierId: supplier.id, proveedorNombre: null } : proveedorNombre ? { proveedorNombre } : {}),
          ...(supplier?.ruc && !o.facturaRuc ? { facturaRuc: supplier.ruc } : {}),
        },
      });
      if (claimed.count !== 1) throw new CompraError("El pedido cambió mientras se registraba el pago (¿se pagó desde otro lado?). No se registró nada.");
      for (const l of o.lines) {
        if (precios.has(l.id)) await tx.purchaseOrderLine.update({ where: { id: l.id }, data: { precioUnitario: precios.get(l.id)! } });
      }
    }
  );

  // La factura que había llegado por WhatsApp pasa al gasto como adjunto.
  if (o.facturaMediaId) await attachMediaToItem(item.id, o.facturaMediaId, `factura-pedido-${o.numero}`).catch(() => {});
  return prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
}

async function attachMediaToItem(itemId: string, mediaId: string, baseName: string) {
  const media = await prisma.inboundMedia.findUnique({ where: { id: mediaId } });
  if (!media) return;
  await replaceAttachment(itemId, {
    filename: media.filename || `${baseName}.${media.mimeType === "application/pdf" ? "pdf" : "jpg"}`,
    mimeType: media.mimeType,
    size: media.size,
    data: media.data,
  });
}

/**
 * Un registro guarda un solo archivo: el nuevo reemplaza al anterior. Primero
 * se crea y después se borra el resto, cada paso en una sola operación (corre
 * también en el conector, sin transacción): si se corta la red en medio,
 * queda con dos archivos, nunca sin comprobante.
 */
async function replaceAttachment(itemId: string, file: { filename: string; mimeType: string; size: number; data: Buffer | Uint8Array }) {
  const nuevo = await prisma.attachment.create({ data: { projectItemId: itemId, ...file, data: Buffer.from(file.data) } });
  await prisma.attachment.deleteMany({ where: { projectItemId: itemId, id: { not: nuevo.id } } });
}

export interface InvoiceInput {
  tipo?: string | null;
  numero?: string | null;
  ruc?: string | null;
  fecha?: string | null;
  iva10?: number | null;
  iva5?: number | null;
  file?: { data: Buffer; mimeType: string; filename: string } | null;
  /** Foto/PDF que llegó por WhatsApp (InboundMedia). */
  mediaId?: string | null;
  por: string;
}

/**
 * Pasa los datos de la factura al gasto. Lo que se vació en este guardado
 * (p.ej. un IVA cargado por error) también se borra del gasto; lo que no vino
 * en el pedido queda como estaba.
 */
export function mergeInvoiceIntoGasto(
  prev: Record<string, unknown>,
  fresh: { facturaTipo: string | null; facturaNumero: string | null; facturaRuc: string | null; iva10: unknown; iva5: unknown },
  input: Pick<InvoiceInput, "numero" | "ruc" | "iva10" | "iva5">
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...prev };
  if (fresh.facturaNumero) Object.assign(data, { tipoComprobante: fresh.facturaTipo ?? "Factura", comprobante: fresh.facturaNumero });
  else if (input.numero !== undefined) delete data.comprobante;
  if (fresh.facturaRuc) data.rucProveedor = fresh.facturaRuc;
  else if (input.ruc !== undefined) delete data.rucProveedor;
  for (const k of ["iva10", "iva5"] as const) {
    const v = fresh[k] ? Number(fresh[k]) : null;
    if (v) data[k] = v;
    else if (input[k] !== undefined) delete data[k];
  }
  return data;
}

/** Datos de la factura (y el archivo). Si el pedido ya se pagó, también se completan en el gasto de Ejecución. */
export async function registerInvoice(id: string, input: InvoiceInput) {
  const o = await prisma.purchaseOrder.findUnique({ where: { id }, select: { id: true, numero: true, status: true, gastoItemId: true, projectId: true } });
  if (!o) throw new CompraError("Ese pedido ya no existe.");
  if (["rechazado", "anulado"].includes(o.status)) throw new CompraError("Ese pedido está rechazado o anulado.");
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(input.fecha ?? "") ? new Date(`${input.fecha}T12:00:00-03:00`) : undefined;
  const numero = input.numero?.trim() || null;
  await prisma.purchaseOrder.update({
    where: { id },
    data: {
      ...(input.tipo !== undefined ? { facturaTipo: input.tipo || "Factura" } : {}),
      ...(input.numero !== undefined ? { facturaNumero: numero } : {}),
      ...(input.ruc !== undefined ? { facturaRuc: input.ruc?.trim() || null } : {}),
      ...(fecha ? { facturaFecha: fecha } : {}),
      ...(input.iva10 !== undefined ? { iva10: input.iva10 || null } : {}),
      ...(input.iva5 !== undefined ? { iva5: input.iva5 || null } : {}),
      ...(input.mediaId ? { facturaMediaId: input.mediaId } : {}),
      facturaAt: new Date(),
    },
  });
  if (o.gastoItemId) {
    const item = await prisma.projectItem.findUnique({ where: { id: o.gastoItemId } });
    if (item) {
      const prev = (item.data ?? {}) as Record<string, unknown>;
      const fresh = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
      const data = mergeInvoiceIntoGasto(prev, fresh, input);
      await prisma.projectItem.update({ where: { id: item.id }, data: { data: data as Prisma.InputJsonValue } });
      if (input.file) {
        await replaceAttachment(item.id, { filename: input.file.filename, mimeType: input.file.mimeType, size: input.file.data.length, data: input.file.data });
      } else if (input.mediaId) {
        await attachMediaToItem(item.id, input.mediaId, `factura-pedido-${o.numero}`);
      }
      await logChanges(prisma, item.projectId, [{ action: "registro_editado", detail: `Factura${fresh.facturaNumero ? ` N° ${fresh.facturaNumero}` : ""} del pedido de compra #${o.numero}` }], input.por);
    }
  } else if (input.file) {
    // Todavía no hay gasto: el archivo queda guardado y pasa al gasto cuando se pague.
    const media = await prisma.inboundMedia.create({
      data: { phone: "app", waMediaId: `app-${id}-${Date.now()}`, mimeType: input.file.mimeType, filename: input.file.filename, size: input.file.data.length, data: input.file.data },
    });
    await prisma.purchaseOrder.update({ where: { id }, data: { facturaMediaId: media.id } });
  }
  return prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE });
}

// ------------------------------- presupuesto -------------------------------

export async function budgetComparison(projectId: string): Promise<ComparacionPresupuesto> {
  const items = await prisma.budgetItem.findMany({ where: { projectId }, orderBy: [{ orden: "asc" }, { createdAt: "asc" }] });
  const lines = await prisma.purchaseOrderLine.findMany({
    where: { budgetItemId: { in: items.map((i) => i.id) }, order: { status: { in: ["aprobado", "pagado"] } } },
    select: { budgetItemId: true, cantidad: true, precioUnitario: true, order: { select: { status: true } } },
  });
  return compararPresupuesto(
    items.map((i) => ({ id: i.id, codigo: i.codigo, descripcion: i.descripcion, unidad: i.unidad, cantidad: Number(i.cantidad), precioUnitario: Number(i.precioUnitario), categoria: i.categoria, orden: i.orden })),
    lines.map((l) => ({ budgetItemId: l.budgetItemId!, cantidad: Number(l.cantidad), precioUnitario: l.precioUnitario === null ? null : Number(l.precioUnitario), status: l.order.status }))
  );
}

// ------------------------------- textos -------------------------------

function qty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

/** "80 bolsa cemento", pero "20 varillas 10mm" (sin repetir la unidad si la descripción ya empieza con ella). */
export function lineLabel(cantidad: number, unidad: string | null, descripcion: string): string {
  const u = unidad ? normalizeText(unidad).slice(0, 5) : "";
  const repeats = Boolean(u) && normalizeText(descripcion).startsWith(u);
  return `${qty(cantidad)}${unidad && !repeats ? ` ${unidad}` : ""} ${descripcion}`;
}

/** Renglones del pedido para WhatsApp, con la comparación contra el presupuesto. */
export function orderLinesText(o: PurchaseOrderDTO): string[] {
  return o.lines.map((l) => {
    const base = `• ${lineLabel(l.cantidad, l.unidad, l.descripcion)}`;
    const p = l.presupuesto;
    if (!p) return `${base}\n   _no está en el presupuesto_`;
    const resto = p.restante < 0 ? `⚠️ se pasa ${qty(-p.restante)} de lo presupuestado (${qty(p.cantidad)})` : `quedan ${qty(p.restante)} de ${qty(p.cantidad)} presupuestados`;
    return `${base}\n   ${fmtGs(p.precioUnitario)}/${p.unidad ?? "u"} · ${resto}`;
  });
}
