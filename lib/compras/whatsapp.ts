import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { fmtGs, normalizeText } from "../agent/format";
import { todayInParaguay, fmtYmd, weekdayOf } from "../dates";
import { CompraError, ESTADO_LABEL, ORDER_INCLUDE, createOrder, getOrder, orderLinesText, registerInvoice, serializeOrder, type PurchaseOrderDTO } from "./core";
import { isPurchaseRequest, parsePurchaseRequest, type ParsedRequest } from "./parse";
import { extractWithAI } from "./extract";

// Pedidos de compra por el grupo de WhatsApp de pedidos (lo lee el conector
// de la PC, worker/whatsapp-baileys.mts). Acá no se manda nada por WhatsApp:
// se devuelven los textos y el conector los manda.
//
// Corre en el conector, que puede trabajar contra la base "remota" (sin
// $transaction): todo lo de acá son operaciones sueltas de Prisma.

export { isPurchaseRequest };

/** Cuánto vive la tarjeta de aprobación en el chat del dueño (después se aprueba desde la app). */
const APPROVAL_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export const FORMATO_EJEMPLO = [
  "*Pedido de compra*",
  "Obra: Sucursal Norte",
  "Fecha: 06/10",
  "- 50 bolsas de cemento",
  "- 20 varillas 10 mm",
  "Proveedor: (si ya saben)",
].join("\n");

function appUrl(path: string): string | null {
  const base =
    process.env.MEMBY_REMOTE_URL?.replace(/\/$/, "") ||
    process.env.APP_BASE_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return base ? `${base}${path}` : null;
}

// ------------------------------- emparejar -------------------------------

type ObraLite = { id: string; name: string; reference: string | null; code: string | null };

function words(s: string) {
  return normalizeText(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 2 && !["obra", "del", "los", "las", "para"].includes(w));
}

const MIN_LARGO_OBRA = 4;

/** Obra por código, nombre exacto, nombre contenido o palabras en común. */
export function matchObra(texto: string | null, obras: ObraLite[]): ObraLite | null {
  if (!texto) return null;
  const t = normalizeText(texto);
  const byCode = obras.find((o) => o.code && normalizeText(o.code) === t);
  if (byCode) return byCode;
  const exact = obras.find((o) => normalizeText(o.name) === t || (o.reference && normalizeText(`${o.name} ${o.reference}`) === t));
  if (exact) return exact;
  // Con textos muy cortos el "contiene" y las palabras adivinan ("san" →
  // "Sanatorio…"): por debajo de 4 letras solo vale código o nombre exacto.
  const largo = (s: string) => s.replace(/[^a-z0-9]/g, "").length;
  if (largo(t) < MIN_LARGO_OBRA) return null;
  const contains = obras.filter((o) => {
    const n = normalizeText(o.name);
    return (largo(n) >= MIN_LARGO_OBRA && t.includes(n)) || n.includes(t);
  });
  if (contains.length === 1) return contains[0];
  const q = new Set(words(texto));
  let best: { o: ObraLite; score: number } | null = null;
  let tie = false;
  for (const o of obras) {
    const w = words(`${o.name} ${o.reference ?? ""}`);
    if (!w.length || !q.size) continue;
    const score = w.filter((x) => q.has(x)).length / Math.min(q.size, w.length);
    if (!best || score > best.score) {
      best = { o, score };
      tie = false;
    } else if (score === best.score) tie = true;
  }
  return best && best.score >= 0.6 && !tie ? best.o : null;
}

async function matchSupplier(nombre: string | null) {
  if (!nombre) return null;
  const t = normalizeText(nombre);
  const all = await prisma.supplier.findMany({ where: { status: "activo" }, select: { id: true, name: true } });
  return all.find((s) => normalizeText(s.name) === t) ?? (all.filter((s) => normalizeText(s.name).includes(t) || t.includes(normalizeText(s.name))).length === 1
    ? all.find((s) => normalizeText(s.name).includes(t) || t.includes(normalizeText(s.name)))!
    : null);
}

// ------------------------------- textos -------------------------------

function fechaCorta(iso: string | null) {
  if (!iso) return null;
  const ymd = iso.slice(0, 10);
  return `${weekdayOf(ymd)} ${fmtYmd(ymd)}`;
}

/** Tarjeta que le llega al dueño por privado para aprobar o rechazar. `reaprobar`: ya se había aprobado y lo editaron. */
export function approvalCardBody(o: PurchaseOrderDTO, opts: { reaprobar?: boolean } = {}): string {
  const lines = [
    `🛒 *Pedido de compra #${o.numero}*`,
    ...(opts.reaprobar ? ["✏️ Se modificó después de aprobado: hay que aprobarlo de nuevo."] : []),
    o.projectName ? `📍 ${o.projectName}` : `⚠️ No reconocí la obra${o.obraTexto ? ` ("${o.obraTexto}")` : ""}: elegila en la app antes de pagar.`,
    `👷 Pide: ${o.solicitante}${o.origen === "whatsapp" ? " · por el grupo" : ""}`,
  ];
  if (o.fechaNecesaria) lines.push(`📅 Para: ${fechaCorta(o.fechaNecesaria)}`);
  lines.push("", ...orderLinesText(o));
  if (o.lines.some((l) => !(l.cantidad > 0))) lines.push("⚠️ Hay materiales sin cantidad: completalos en la app.");
  if (o.montoEstimado) {
    // Si hay materiales sin precio (fuera del presupuesto), el estimado es parcial: que no parezca el total.
    const sinPrecio = o.lines.filter((l) => l.precioUnitario === null && !l.presupuesto).length;
    const parcial = sinPrecio ? ` (sin contar ${sinPrecio === 1 ? "1 material sin precio" : `${sinPrecio} materiales sin precio`})` : "";
    lines.push("", `💵 Estimado con precios del presupuesto: *${fmtGs(o.montoEstimado)}*${parcial}`);
  }
  if (o.proveedorNombre) lines.push(`🏪 Proveedor: ${o.proveedorNombre}`);
  if (o.notas) lines.push(`📝 ${o.notas.slice(0, 200)}`);
  const url = appUrl(`/compras/${o.id}`);
  if (url) lines.push("", `🔗 ${url}`);
  return lines.join("\n");
}

/**
 * Aviso al grupo cuando cambia el estado del pedido (null = no se avisa).
 * `avisadoAntes`: el último estado que se avisó en el grupo (grupoAvisado).
 */
export function groupStatusText(o: PurchaseOrderDTO, avisadoAntes?: string | null): string | null {
  const obra = o.projectName ? ` (${o.projectName})` : "";
  // Ya les habíamos dicho "aprobado, compren" y lo editaron (vuelve a pendiente,
  // decisión del 04/10/2026): que nadie compre con lo que se aprobó antes.
  if (o.status === "pendiente") {
    return avisadoAntes === "aprobado" ? `✏️ Pedido #${o.numero}${obra} *se modificó* y vuelve a esperar aprobación. No compren hasta que se apruebe de nuevo.` : null;
  }
  if (o.status === "aprobado") return `✅ Pedido #${o.numero}${obra} *aprobado*. Ya pueden comprar.`;
  if (o.status === "rechazado") return `❌ Pedido #${o.numero}${obra} *rechazado*.${o.rechazoMotivo ? `\nMotivo: ${o.rechazoMotivo}` : ""}`;
  if (o.status === "pagado") {
    return [
      `💰 Pedido #${o.numero}${obra} *pagado*${o.medioPago ? ` (${o.medioPago.toLowerCase()})` : ""}.`,
      o.facturaNumero || o.facturaMediaId ? null : `Cuando tengan la factura, mándenla acá en foto o PDF con el texto *Factura pedido ${o.numero}*.`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (o.status === "anulado") return `Pedido #${o.numero}${obra} anulado.`;
  return null;
}

// ------------------------------- entrada -------------------------------

export interface GroupMessage {
  text: string;
  groupJid: string;
  waMessageId: string;
  senderName: string;
  senderPhone: string | null;
}

export interface GroupResult {
  /** Respuesta en el grupo (citando el mensaje). */
  groupReply: string | null;
  /** Tarjeta para el dueño: ya está creada la propuesta; el conector le pone el código y la manda. */
  card: { actionId: string; body: string } | null;
}

/** Procesa un "Pedido de compra" del grupo: lo registra y prepara la tarjeta de aprobación. */
export async function handleGroupPurchaseRequest(msg: GroupMessage, ownerPhone: string): Promise<GroupResult> {
  const dup = await prisma.purchaseOrder.findUnique({ where: { waMessageId: msg.waMessageId }, select: { id: true, status: true } });
  if (dup) {
    // Reentrega del mismo mensaje. Si la vez anterior se registró el pedido
    // pero se cortó antes de crear la tarjeta, se la crea ahora (si no, el
    // pedido quedaba pendiente para siempre sin que el dueño se enterara).
    if (dup.status !== "pendiente") return { groupReply: null, card: null };
    const card = await prisma.whatsAppPendingAction.findFirst({
      where: { kind: "aprobar_pedido", payload: { path: ["pedidoId"], equals: dup.id } },
      select: { id: true },
    });
    if (card) return { groupReply: null, card: null };
    const order = await getOrder(dup.id);
    if (!order) return { groupReply: null, card: null };
    return { groupReply: null, card: await createApprovalCard(await serializeOrder(order), ownerPhone) };
  }

  const today = todayInParaguay();
  const obras = await prisma.project.findMany({
    where: { status: { not: "finalizado" } },
    select: { id: true, name: true, reference: true, code: true },
    orderBy: { updatedAt: "desc" },
  });
  let parsed: ParsedRequest = parsePurchaseRequest(msg.text, today);
  let obra = matchObra(parsed.obra, obras);
  // Formato libre o incompleto: Claude lo interpreta (con la lista de obras para reconocer la que dicen).
  if (!parsed.lineas.length || !obra) {
    const ai = await extractWithAI(msg.text, today, obras.map((o) => `${o.name}${o.reference ? ` (REF ${o.reference})` : ""}${o.code ? ` [${o.code}]` : ""}`));
    if (ai && (ai.lineas.length || ai.obra)) {
      parsed = {
        obra: obra ? parsed.obra : ai.obra ?? parsed.obra,
        proveedor: parsed.proveedor ?? ai.proveedor,
        fechaNecesaria: parsed.fechaNecesaria ?? ai.fechaNecesaria,
        notas: parsed.notas ?? ai.notas,
        lineas: parsed.lineas.length ? parsed.lineas : ai.lineas,
      };
      obra = obra ?? matchObra(parsed.obra, obras);
    }
  }
  if (!parsed.lineas.length) {
    return {
      groupReply: `No encontré qué materiales hay que comprar 🤔 Mandalo de nuevo así:\n\n${FORMATO_EJEMPLO}`,
      card: null,
    };
  }

  const supplier = await matchSupplier(parsed.proveedor);
  let order;
  try {
    order = await createOrder({
      projectId: obra?.id ?? null,
      obraTexto: obra ? null : parsed.obra,
      solicitante: msg.senderName,
      solicitantePhone: msg.senderPhone,
      origen: "whatsapp",
      textoOriginal: msg.text.slice(0, 4000),
      notas: parsed.notas,
      fechaNecesaria: parsed.fechaNecesaria ? new Date(`${parsed.fechaNecesaria}T12:00:00-03:00`) : null,
      supplierId: supplier?.id ?? null,
      proveedorNombre: supplier ? null : parsed.proveedor,
      grupoJid: msg.groupJid,
      waMessageId: msg.waMessageId,
      lines: parsed.lineas,
    });
  } catch (err) {
    if (err instanceof CompraError) return { groupReply: `No pude registrar el pedido: ${err.message}\n\n${FORMATO_EJEMPLO}`, card: null };
    throw err;
  }
  const dto = await serializeOrder(order);
  const card = await createApprovalCard(dto, ownerPhone);
  const cuantos = dto.lines.length === 1 ? "1 material" : `${dto.lines.length} materiales`;
  const groupReply = [
    `📝 Pedido *#${dto.numero}* recibido${dto.projectName ? ` · ${dto.projectName}` : ""} · ${cuantos}.`,
    dto.projectName ? null : "No reconocí la obra: la va a elegir el encargado de aprobar.",
    "Queda esperando aprobación; les aviso acá.",
  ]
    .filter(Boolean)
    .join("\n");
  return { groupReply, card };
}

async function createApprovalCard(dto: PurchaseOrderDTO, ownerPhone: string, opts: { reaprobar?: boolean } = {}): Promise<{ actionId: string; body: string }> {
  const body = approvalCardBody(dto, opts);
  const action = await prisma.whatsAppPendingAction.create({
    data: {
      phone: ownerPhone,
      kind: "aprobar_pedido",
      payload: { pedidoId: dto.id, numero: dto.numero } as Prisma.InputJsonValue,
      summary: body,
      expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
    },
  });
  return { actionId: action.id, body };
}

/** "Factura pedido 14" (foto o PDF en el grupo) → número de pedido; null si no es una factura de pedido. */
export function invoiceOrderNumber(caption: string | null | undefined): number | null {
  if (!caption || !/factura/i.test(caption)) return null;
  const pedido = /pedido\s*(?:n[°ºo.]?|nro\.?)?\s*#?\s*(\d{1,6})\b/i.exec(caption);
  if (pedido) return Number(pedido[1]);
  const hash = /#\s*(\d{1,6})\b/.exec(caption);
  if (hash) return Number(hash[1]);
  // "Factura 14" solo si es el único número del texto: "Factura 001-001-0001234"
  // (el número de la factura) o "Factura 12/10" no dicen a qué pedido va.
  const solo = /^\W*factura\s*(?:n[°ºo.]?|nro\.?)?\s*(\d{1,6})\W*$/i.exec(caption.trim());
  return solo && (caption.match(/\d+/g) ?? []).length === 1 ? Number(solo[1]) : null;
}

/** Factura que llega al grupo: se guarda en el pedido (y en su gasto, si ya se pagó). */
export async function handleGroupInvoice(numero: number, mediaId: string, senderName: string): Promise<{ groupReply: string; ownerNotice: string | null }> {
  const o = await prisma.purchaseOrder.findUnique({ where: { numero }, select: { id: true, status: true } });
  if (!o) return { groupReply: `No encontré el pedido #${numero}. Revisá el número y mandala de nuevo.`, ownerNotice: null };
  if (["rechazado", "anulado"].includes(o.status)) return { groupReply: `El pedido #${numero} está ${ESTADO_LABEL[o.status].toLowerCase()}: no guardé la factura.`, ownerNotice: null };
  const updated = await registerInvoice(o.id, { mediaId, por: `WhatsApp · ${senderName}` });
  const dto = await serializeOrder(updated, false);
  const url = appUrl(`/compras/${dto.id}`);
  return {
    groupReply: `🧾 Factura del pedido #${numero} recibida. ¡Gracias!`,
    ownerNotice: [
      `🧾 Llegó la factura del pedido #${numero}${dto.projectName ? ` (${dto.projectName})` : ""}, mandada por ${senderName}.`,
      dto.status === "pagado" ? "Quedó adjunta al gasto. Completá número, RUC e IVA en la app." : "Queda guardada y se adjunta al gasto cuando registres el pago.",
      url ? `🔗 ${url}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export interface GroupNotice {
  id: string;
  groupJid: string;
  status: string;
  text: string | null;
  /** Volvió a pendiente por una edición después de aprobado: hay que mandarle al dueño una tarjeta nueva. */
  reaprobar: boolean;
}

/** Pedidos del grupo cuyo cambio de estado todavía no se avisó ahí. */
export async function pendingGroupNotices(): Promise<GroupNotice[]> {
  const rows = await prisma.purchaseOrder.findMany({
    where: {
      grupoJid: { not: null },
      OR: [
        { status: { in: ["aprobado", "rechazado", "pagado", "anulado"] } },
        // Aprobado (y avisado) que después editaron: vuelve a pendiente (core.ts updateOrder).
        { status: "pendiente", grupoAvisado: "aprobado" },
      ],
    },
    select: { id: true, status: true, grupoAvisado: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  // Los pendientes (casi siempre ninguno) se traen completos en una sola
  // consulta: uno por uno era un pedido HTTP por pedido con la base remota.
  const ids = rows.filter((r) => r.grupoAvisado !== r.status).map((r) => r.id);
  if (!ids.length) return [];
  const orders = await prisma.purchaseOrder.findMany({ where: { id: { in: ids } }, include: ORDER_INCLUDE, orderBy: { updatedAt: "desc" } });
  const out: GroupNotice[] = [];
  for (const o of orders) {
    const reaprobar = o.status === "pendiente" && o.grupoAvisado === "aprobado";
    out.push({ id: o.id, groupJid: o.grupoJid!, status: o.status, text: groupStatusText(await serializeOrder(o, false), o.grupoAvisado), reaprobar });
  }
  return out;
}

/**
 * Tarjeta nueva para un pedido que volvió a pendiente por una edición. Las
 * tarjetas viejas ya quedaron canceladas al editar (core.ts updateOrder), así
 * que con ellas no se puede aprobar la versión nueva. null si ya no hace falta
 * (lo aprobaron o rechazaron desde la app) o si ya hay una abierta.
 */
export async function reapprovalCard(orderId: string, ownerPhone: string): Promise<{ actionId: string; body: string } | null> {
  const open = await prisma.whatsAppPendingAction.findFirst({
    where: { kind: "aprobar_pedido", status: "pendiente", payload: { path: ["pedidoId"], equals: orderId } },
    select: { id: true },
  });
  if (open) return null;
  const order = await getOrder(orderId);
  if (!order || order.status !== "pendiente") return null;
  return createApprovalCard(await serializeOrder(order), ownerPhone, { reaprobar: true });
}

export async function markGroupNotified(id: string, status: string) {
  await prisma.purchaseOrder.update({ where: { id }, data: { grupoAvisado: status } });
}
