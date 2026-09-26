import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ITEM_KINDS } from "../itemKinds";
import { MOVIMIENTO_TIPOS } from "../movimientos";
import { PARTNERS } from "../profitShare";
import { createProjectItem } from "../items";
import { todayInParaguay, daysBetween, fmtYmd, weekdayOf } from "../dates";
import { fmtGs, normalizeText } from "./format";

// ---------------------------------------------------------------------------
// Escrituras del agente de WhatsApp, en dos fases:
//   1. propose*()  — el modelo de IA arma una propuesta. Acá se valida TODO
//      contra la base (obra existe, proveedor existe, montos/fechas sanos) y
//      se guarda como WhatsAppPendingAction. No se toca ningún movimiento.
//   2. executePendingAction() — corre SOLO cuando el usuario toca el botón
//      "Confirmar" de esa propuesta. Ni el modelo ni un "sí" escrito llegan
//      acá (un "sí" puede estar respondiendo otra cosa).
// ---------------------------------------------------------------------------

/** Cuánto vive una propuesta sin confirmar (los botones de WhatsApp igual dejan de servir a las 24h). */
const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;
/** Tope de cordura: nada de lo que maneja esta empresa pasa de 10 mil millones en un solo movimiento. */
const MAX_MONTO = 10_000_000_000;
const WARN_MONTO = 100_000_000;
/** Mismo tope que Attachment (app/api/items/[itemId]/attachment/route.ts). */
export const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
/** Las imágenes viajan a Claude en base64 (+33%) y el API acepta hasta 5 MB por imagen. */
export const MAX_IMAGE_BYTES = 3_700_000;
/** Largo máximo de las notas dentro del resumen (el payload guarda el texto completo). */
const NOTAS_EN_RESUMEN = 300;

const CO = ITEM_KINDS.change_order;
const fieldOptions = (key: string) => CO.fields.find((f) => f.key === key)?.options ?? [];
const TIPOS_MOVIMIENTO: string[] = MOVIMIENTO_TIPOS.map((t) => t.value);
const TIPOS_INSUMO = fieldOptions("tipoInsumo");
const MEDIOS_PAGO = fieldOptions("medioPago");
const ESTADOS = CO.statusOptions ?? ["Pendiente", "Pagado", "Conciliado"];
const proveedorAplica = CO.fields.find((f) => f.key === "proveedorId")?.showIf ?? (() => true);

export interface AgentUser {
  phone: string;
  name: string;
}

export type ActionKind = "movimiento_obra" | "movimiento_general" | "registro_rapido";

interface MovimientoObraPayload {
  obraId: string;
  obraLabel: string;
  rubro: string;
  tipo: string;
  monto: number;
  fecha: string;
  tipoInsumo: string | null;
  proveedorId: string | null;
  proveedorNombre: string | null;
  categoria: string | null;
  medioPago: string | null;
  estado: string;
  notas: string | null;
  comprobanteMediaId: string | null;
  /** Captura de Registro rápido que este movimiento clasifica (se marca resuelta al confirmar). */
  registroRapidoId?: string | null;
}

interface MovimientoGeneralPayload {
  tipo: "ingreso" | "egreso";
  concepto: string;
  monto: number;
  fecha: string;
  categoria: string | null;
  medioPago: string | null;
  estado: string;
  responsable: string | null;
  notas: string | null;
  comprobanteMediaId: string | null;
  registroRapidoId?: string | null;
}

interface RegistroRapidoPayload {
  monto: number;
  medioPago: string;
  fecha: string;
  nota: string | null;
  comprobanteMediaId: string | null;
}

export interface ProposalResult {
  propuestaId: string;
  resumen: string;
  advertencias: string[];
}

/** Error al ejecutar que se le puede mostrar tal cual al usuario, y que garantiza que no se escribió nada. */
class NothingWrittenError extends Error {
  // Bandera en vez de instanceof: sobrevive a cualquier target de compilación.
  readonly nothingWritten = true;
}

// ------------------------------- validación -------------------------------

function cleanText(v: string | null | undefined, max: number): string | null {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
}

function short(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : s;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function validMonto(v: number, warnings: string[]): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error("El monto tiene que ser un número mayor a cero (en guaraníes).");
  const monto = Math.round(n);
  if (monto > MAX_MONTO) throw new Error(`El monto ${fmtGs(monto)} está fuera de rango — confirmá la cifra con el usuario.`);
  if (monto > WARN_MONTO) warnings.push(`Monto alto: ${fmtGs(monto)}. Revisá que la cifra sea correcta.`);
  return monto;
}

function validFecha(v: string, warnings: string[]): string {
  const s = String(v ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Fecha inválida "${s}": usá el formato AAAA-MM-DD.`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new Error(`La fecha "${s}" no existe en el calendario.`);
  }
  const today = todayInParaguay();
  if (daysBetween(today, s) > 1) warnings.push(`La fecha ${fmtYmd(s)} es futura.`);
  if (daysBetween(s, today) > 60) warnings.push(`La fecha ${fmtYmd(s)} es de hace más de dos meses.`);
  return s;
}

function validOption(v: string | null | undefined, options: string[], label: string): string | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const found = options.find((o) => o.toLowerCase() === String(v).trim().toLowerCase());
  if (!found) throw new Error(`${label} inválido "${v}". Opciones: ${options.join(", ")}.`);
  return found;
}

async function validComprobante(user: AgentUser, mediaId: string | null | undefined): Promise<string | null> {
  if (!mediaId) return null;
  const media = await prisma.inboundMedia.findUnique({ where: { id: mediaId }, select: { id: true, phone: true } });
  if (!media || media.phone !== user.phone) throw new Error(`No encontré el comprobante "${mediaId}" enviado por este usuario.`);
  return media.id;
}

/**
 * Nombre de responsable tal como ya está cargado en el sistema ("hugo" ->
 * "Hugo Rotela"): /personal agrupa el 15% por el texto exacto, así que un
 * apodo abriría una fila aparte.
 */
async function canonicalResponsable(raw: string, warnings: string[]): Promise<string> {
  const [gens, sitios, projects] = await Promise.all([
    prisma.generalMovement.findMany({ where: { responsable: { not: null } }, select: { responsable: true }, distinct: ["responsable"] }),
    prisma.sitio.findMany({ select: { responsable: true } }),
    prisma.project.findMany({ select: { manager: true }, distinct: ["manager"] }),
  ]);
  const candidatos = Array.from(
    new Set(
      [...PARTNERS.map((p) => p.nombre), ...gens.map((g) => g.responsable ?? ""), ...sitios.map((s) => s.responsable), ...projects.map((p) => p.manager)]
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
  const n = normalizeText(raw);
  const exacto = candidatos.find((c) => normalizeText(c) === n);
  if (exacto) return exacto;
  const parciales = candidatos.filter((c) => {
    const nc = normalizeText(c);
    return nc.startsWith(`${n} `) || nc.split(" ").includes(n);
  });
  if (parciales.length === 1) return parciales[0];
  if (parciales.length > 1) throw new Error(`"${raw}" puede ser ${parciales.join(" o ")}. Preguntale al usuario cuál.`);
  warnings.push(`"${raw}" es un responsable nuevo (no coincide con ninguno cargado). Revisá que el nombre esté completo y bien escrito.`);
  return raw;
}

/** Valida que `reemplazaA` sea una propuesta de este usuario que todavía se puede reemplazar. */
async function checkReplaceable(user: AgentUser, reemplazaA: string | null | undefined) {
  if (!reemplazaA) return;
  const prev = await prisma.whatsAppPendingAction.findFirst({ where: { id: reemplazaA, phone: user.phone }, select: { status: true } });
  if (!prev) throw new Error(`No encontré la propuesta "${reemplazaA}" para reemplazar.`);
  if (prev.status === "confirmada" || prev.status === "ejecutando") {
    throw new Error(
      `La propuesta ${reemplazaA} YA FUE REGISTRADA: no se puede reemplazar, y una propuesta nueva se SUMARÍA a la registrada. Decile al usuario que corrija o borre ese movimiento desde la app (o preguntale si quiere registrar solo la diferencia).`
    );
  }
}

/** Cancela la propuesta que se corrige, justo antes de crear la nueva (y vuelve a chequear que no se haya confirmado mientras tanto). */
async function cancelReplaced(user: AgentUser, reemplazaA: string | null | undefined) {
  if (!reemplazaA) return;
  const res = await prisma.whatsAppPendingAction.updateMany({
    where: { id: reemplazaA, phone: user.phone, status: "pendiente" },
    data: { status: "cancelada", error: "Reemplazada por una propuesta corregida." },
  });
  if (res.count === 0) await checkReplaceable(user, reemplazaA);
}

async function samePendingWarning(user: AgentUser, kind: ActionKind, monto: number, reemplazaA: string | null | undefined, warnings: string[]) {
  const recent = await prisma.whatsAppPendingAction.findMany({
    where: {
      phone: user.phone,
      kind,
      status: { in: ["pendiente", "ejecutando"] },
      expiresAt: { gt: new Date() },
      ...(reemplazaA ? { id: { not: reemplazaA } } : {}),
    },
    select: { payload: true },
  });
  if (recent.some((a) => Number((a.payload as any)?.monto) === monto)) {
    warnings.push(`Ya hay otra propuesta de ${fmtGs(monto)} esperando confirmación. Si es la misma, confirmá solo una.`);
  }
}

/** Captura de Registro rápido que el movimiento clasifica: tiene que existir y seguir sin clasificar. */
async function validRegistroRapido(id: string | null | undefined, monto: number, warnings: string[]) {
  if (!id) return null;
  const q = await prisma.quickExpense.findUnique({ where: { id } });
  if (!q) throw new Error(`No existe la captura de Registro rápido "${id}". Buscala con ver_registros_rapidos.`);
  if (q.resuelto) throw new Error("Esa captura de Registro rápido ya está clasificada: no la cargues de nuevo.");
  if (Number(q.monto) !== monto) warnings.push(`La captura de Registro rápido era de ${fmtGs(Number(q.monto))}, no de ${fmtGs(monto)}.`);
  return q;
}

/** Aviso si el pago parece ser una captura de Registro rápido que todavía no se clasificó. */
async function quickExpenseWarning(monto: number, fecha: string, warnings: string[]) {
  const caps = await prisma.quickExpense.findMany({ where: { resuelto: false, monto } });
  const c = caps.find((q) => Math.abs(daysBetween(ymd(q.fecha), fecha)) <= 3);
  if (c) {
    warnings.push(
      `Posible duplicado: hay una captura de Registro rápido sin clasificar de ${fmtGs(monto)} del ${fmtYmd(ymd(c.fecha))}. Si es este mismo pago, cancelá y pedime que clasifique esa captura.`
    );
  }
}

function fechaLabel(ymdStr: string) {
  return `${fmtYmd(ymdStr)} (${weekdayOf(ymdStr)})`;
}

/**
 * Guarda la propuesta. Las advertencias van ARRIBA, pegadas al título: el
 * cuerpo del mensaje con botones tiene un tope de 1024 caracteres y, si hay
 * que recortar, se recorta el detalle, nunca un aviso.
 */
async function createPending(user: AgentUser, kind: ActionKind, payload: object, lines: string[], advertencias: string[]): Promise<ProposalResult> {
  const [titulo, ...detalle] = lines;
  const summary = advertencias.length
    ? [titulo, ...advertencias.map((a) => `⚠️ ${a}`), "", ...detalle].join("\n")
    : [titulo, ...detalle].join("\n");
  const action = await prisma.whatsAppPendingAction.create({
    data: {
      phone: user.phone,
      kind,
      payload: payload as Prisma.InputJsonValue,
      summary,
      expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
    },
  });
  return { propuestaId: action.id, resumen: summary, advertencias };
}

// ------------------------------- propuestas -------------------------------

export async function proposeMovimientoObra(
  user: AgentUser,
  input: {
    obraId: string;
    rubro: string;
    tipo: string;
    monto: number;
    fecha: string;
    tipoInsumo?: string | null;
    proveedorId?: string | null;
    categoria?: string | null;
    medioPago?: string | null;
    estado?: string | null;
    notas?: string | null;
    comprobanteId?: string | null;
    registroRapidoId?: string | null;
    reemplazaA?: string | null;
  }
): Promise<ProposalResult> {
  const warnings: string[] = [];
  const obra = await prisma.project.findUnique({
    where: { id: input.obraId },
    include: { sitio: { select: { nombre: true } } },
  });
  if (!obra) throw new Error(`No existe una obra con id "${input.obraId}". Buscala con buscar_obras.`);
  if (obra.status === "finalizado") warnings.push("La obra figura como Finalizada.");

  let rubro = cleanText(input.rubro, 120);
  if (!rubro) throw new Error("Falta el nombre del rubro (ej. \"Pedestal de Hormigón\").");
  const tipo = validOption(input.tipo, TIPOS_MOVIMIENTO, "Tipo de movimiento");
  if (!tipo) throw new Error(`Falta el tipo de movimiento. Opciones: ${TIPOS_MOVIMIENTO.join(", ")}.`);
  const monto = validMonto(input.monto, warnings);
  const fecha = validFecha(input.fecha, warnings);
  const tipoInsumo = validOption(input.tipoInsumo, TIPOS_INSUMO, "Tipo de insumo");
  const medioPago = validOption(input.medioPago, MEDIOS_PAGO, "Medio de pago");
  const estado = validOption(input.estado ?? "Pagado", ESTADOS, "Estado") ?? "Pagado";
  const categoria = cleanText(input.categoria, 120);
  const notas = cleanText(input.notas, 1000);
  const captura = await validRegistroRapido(input.registroRapidoId, monto, warnings);
  const comprobanteMediaId = (await validComprobante(user, input.comprobanteId)) ?? captura?.comprobanteMediaId ?? null;
  await checkReplaceable(user, input.reemplazaA);

  // Proveedor: mismas reglas que el formulario (solo aplica a ciertos tipos de insumo).
  let proveedorId: string | null = null;
  let proveedorNombre: string | null = null;
  if (input.proveedorId) {
    if (!proveedorAplica({ tipoInsumo })) {
      throw new Error(
        "El proveedor solo se registra cuando el tipo de insumo es Materiales, Maquinaria / Alquileres o Servicios varios. Cambiá el tipo de insumo o poné el proveedor en las notas."
      );
    }
    const prov = await prisma.supplier.findUnique({ where: { id: input.proveedorId } });
    if (!prov) throw new Error(`No existe un proveedor con id "${input.proveedorId}". Buscalo con buscar_proveedores.`);
    proveedorId = prov.id;
    proveedorNombre = prov.name;
  }

  // Rubro: si ya existe (sin importar mayúsculas ni tildes) se usa el nombre
  // exacto — la ficha agrupa por título y "pedestal" abriría otro grupo.
  const items = await prisma.projectItem.findMany({ where: { projectId: obra.id, kind: "change_order" } });
  const existente = items.map((i) => i.title.trim()).find((t) => normalizeText(t) === normalizeText(rubro!));
  if (existente) rubro = existente;
  else warnings.push(`"${rubro}" es un rubro nuevo en esta obra.`);

  // Posible duplicado: mismo monto ±3 días en la misma obra.
  const dup = items.find((i) => {
    const d = (i.data as any) ?? {};
    return Number(d.monto) === monto && d.fecha && Math.abs(daysBetween(String(d.fecha), fecha)) <= 3;
  });
  if (dup) {
    const d = (dup.data as any) ?? {};
    warnings.push(`Posible duplicado: ya existe un movimiento de ${fmtGs(monto)} del ${fmtYmd(String(d.fecha))} en esta obra (rubro "${dup.title}"). Si es el mismo pago, tocá Cancelar.`);
  }
  if (!captura) await quickExpenseWarning(monto, fecha, warnings);
  await samePendingWarning(user, "movimiento_obra", monto, input.reemplazaA, warnings);

  const obraLabel = `${obra.name}${obra.reference ? ` (REF: ${obra.reference})` : ""}${obra.sitio ? ` · Sitio ${obra.sitio.nombre}` : ""}`;
  const payload: MovimientoObraPayload = {
    obraId: obra.id, obraLabel, rubro, tipo, monto, fecha, tipoInsumo, proveedorId, proveedorNombre,
    categoria, medioPago, estado, notas, comprobanteMediaId, registroRapidoId: captura?.id ?? null,
  };

  const lines = [
    "📝 *Movimiento de obra* — para confirmar",
    `• Obra: ${obraLabel}`,
    `• Rubro: ${rubro}`,
    `• Tipo: ${tipo}${tipoInsumo ? ` · ${tipoInsumo}` : ""}`,
    proveedorNombre ? `• Proveedor: ${proveedorNombre}` : null,
    `• Monto: *${fmtGs(monto)}*`,
    `• Fecha: ${fechaLabel(fecha)}`,
    `• ${medioPago ? `Medio de pago: ${medioPago} · ` : ""}Estado: ${estado}`,
    categoria ? `• Centro de costos: ${categoria}` : null,
    captura ? `• Clasifica la captura de Registro rápido del ${fmtYmd(ymd(captura.fecha))}` : null,
    comprobanteMediaId ? "• Comprobante: adjunto ✓" : null,
    notas ? `• Notas: ${short(notas, NOTAS_EN_RESUMEN)}` : null,
  ].filter((l): l is string => Boolean(l));
  await cancelReplaced(user, input.reemplazaA);
  return createPending(user, "movimiento_obra", payload, lines, warnings);
}

export async function proposeMovimientoGeneral(
  user: AgentUser,
  input: {
    tipo: "ingreso" | "egreso";
    concepto: string;
    monto: number;
    fecha: string;
    categoria?: string | null;
    medioPago?: string | null;
    estado?: string | null;
    responsable?: string | null;
    notas?: string | null;
    comprobanteId?: string | null;
    registroRapidoId?: string | null;
    reemplazaA?: string | null;
  }
): Promise<ProposalResult> {
  const warnings: string[] = [];
  if (input.tipo !== "ingreso" && input.tipo !== "egreso") throw new Error('El tipo tiene que ser "ingreso" o "egreso".');
  const concepto = cleanText(input.concepto, 200);
  if (!concepto) throw new Error("Falta el concepto (ej. \"Royalties ACV\", \"Alquiler de oficina\").");
  const monto = validMonto(input.monto, warnings);
  const fecha = validFecha(input.fecha, warnings);
  const medioPago = validOption(input.medioPago, MEDIOS_PAGO, "Medio de pago");
  const estado = validOption(input.estado ?? "Pagado", ESTADOS, "Estado") ?? "Pagado";
  const categoria = cleanText(input.categoria, 120);
  const notas = cleanText(input.notas, 1000);
  const responsableRaw = cleanText(input.responsable, 120);
  // Misma regla que app/api/general-movements: un ingreso necesita responsable (reparto de Personal).
  if (input.tipo === "ingreso" && !responsableRaw) {
    throw new Error("Un ingreso necesita responsable: la persona que consiguió ese ingreso (se usa para el reparto de beneficios). Preguntáselo al usuario.");
  }
  const responsable = responsableRaw ? await canonicalResponsable(responsableRaw, warnings) : null;
  if (input.registroRapidoId && input.tipo !== "egreso") throw new Error("Una captura de Registro rápido es un pago: solo se puede clasificar como egreso.");
  const captura = await validRegistroRapido(input.registroRapidoId, monto, warnings);
  const comprobanteMediaId = (await validComprobante(user, input.comprobanteId)) ?? captura?.comprobanteMediaId ?? null;
  await checkReplaceable(user, input.reemplazaA);

  const gens = await prisma.generalMovement.findMany({ where: { tipo: input.tipo, monto } });
  const dup = gens.find((g) => Math.abs(daysBetween(ymd(g.fecha), fecha)) <= 3);
  if (dup) warnings.push(`Posible duplicado: ya existe un ${input.tipo} general de ${fmtGs(monto)} del ${fmtYmd(ymd(dup.fecha))} ("${dup.concepto}"). Si es el mismo, tocá Cancelar.`);
  if (input.tipo === "egreso" && !captura) await quickExpenseWarning(monto, fecha, warnings);
  await samePendingWarning(user, "movimiento_general", monto, input.reemplazaA, warnings);

  const payload: MovimientoGeneralPayload = {
    tipo: input.tipo, concepto, monto, fecha, categoria, medioPago, estado,
    responsable, notas, comprobanteMediaId, registroRapidoId: captura?.id ?? null,
  };
  const lines = [
    `📝 *${input.tipo === "ingreso" ? "Ingreso" : "Egreso"} general (sin obra)* — para confirmar`,
    `• Concepto: ${concepto}`,
    `• Monto: *${fmtGs(monto)}*`,
    `• Fecha: ${fechaLabel(fecha)}`,
    `• ${medioPago ? `Medio de pago: ${medioPago} · ` : ""}Estado: ${estado}`,
    categoria ? `• Categoría: ${categoria}` : null,
    responsable ? `• Responsable: ${responsable}` : null,
    captura ? `• Clasifica la captura de Registro rápido del ${fmtYmd(ymd(captura.fecha))}` : null,
    comprobanteMediaId ? "• Comprobante: adjunto ✓" : null,
    notas ? `• Notas: ${short(notas, NOTAS_EN_RESUMEN)}` : null,
  ].filter((l): l is string => Boolean(l));
  await cancelReplaced(user, input.reemplazaA);
  return createPending(user, "movimiento_general", payload, lines, warnings);
}

export async function proposeRegistroRapido(
  user: AgentUser,
  input: { monto: number; medioPago: string; fecha: string; nota?: string | null; comprobanteId?: string | null; reemplazaA?: string | null }
): Promise<ProposalResult> {
  const warnings: string[] = [];
  const monto = validMonto(input.monto, warnings);
  const fecha = validFecha(input.fecha, warnings);
  const medioPago = validOption(input.medioPago, MEDIOS_PAGO, "Medio de pago");
  if (!medioPago) throw new Error(`Falta el medio de pago. Opciones: ${MEDIOS_PAGO.join(", ")}.`);
  const nota = cleanText(input.nota, 500);
  const comprobanteMediaId = await validComprobante(user, input.comprobanteId);
  await checkReplaceable(user, input.reemplazaA);

  const caps = await prisma.quickExpense.findMany({ where: { monto } });
  const dup = caps.find((q) => Math.abs(daysBetween(ymd(q.fecha), fecha)) <= 3);
  if (dup) warnings.push(`Posible duplicado: ya hay una captura rápida de ${fmtGs(monto)} del ${fmtYmd(ymd(dup.fecha))}. Si es la misma, tocá Cancelar.`);
  await samePendingWarning(user, "registro_rapido", monto, input.reemplazaA, warnings);

  const payload: RegistroRapidoPayload = { monto, medioPago, fecha, nota, comprobanteMediaId };
  const lines = [
    "⚡ *Registro rápido* (se clasifica después en la app) — para confirmar",
    `• Monto: *${fmtGs(monto)}*`,
    `• Medio de pago: ${medioPago}`,
    `• Fecha: ${fechaLabel(fecha)}`,
    comprobanteMediaId ? "• Comprobante: adjunto ✓" : null,
    nota ? `• Nota: ${short(nota, NOTAS_EN_RESUMEN)}` : null,
  ].filter((l): l is string => Boolean(l));
  await cancelReplaced(user, input.reemplazaA);
  return createPending(user, "registro_rapido", payload, lines, warnings);
}

// ------------------------- consultar / cancelar -------------------------

export async function listPendingActions(phone: string) {
  const actions = await prisma.whatsAppPendingAction.findMany({
    where: { phone, status: "pendiente", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
  });
  return actions.map((a) => ({ propuestaId: a.id, tipo: a.kind, resumen: a.summary, creada: a.createdAt.toISOString() }));
}

export async function cancelPendingAction(phone: string, id: string): Promise<string> {
  const res = await prisma.whatsAppPendingAction.updateMany({
    where: { id, phone, status: "pendiente" },
    data: { status: "cancelada" },
  });
  if (res.count === 1) return "❌ Cancelado. No se registró nada.";
  const a = await prisma.whatsAppPendingAction.findFirst({ where: { id, phone } });
  if (!a) return "No encontré esa propuesta.";
  if (a.status === "confirmada") return "Esa propuesta ya estaba confirmada y registrada — para anularla hay que borrar el movimiento desde la app.";
  return "Esa propuesta ya no estaba pendiente.";
}

// -------------------------------- ejecución --------------------------------

/** Líneas "• Etiqueta: valor" sin las vacías. */
function detail(rows: [string, string | null | undefined | false][]): string[] {
  return rows.filter(([, v]) => Boolean(v)).map(([k, v]) => `• ${k}: ${v}`);
}

/** Cómo quedó el presupuesto de la obra después de registrar (semáforo + %). */
async function budgetLine(obraId: string): Promise<string | null> {
  const p = await prisma.project.findUnique({ where: { id: obraId }, select: { budget: true, spent: true } });
  if (!p) return null;
  const budget = Number(p.budget);
  const spent = Number(p.spent);
  if (!(budget > 0)) return `⚪ *Ejecutado de la obra:* ${fmtGs(spent)} (no tiene presupuesto cargado)`;
  const pct = Math.round((spent / budget) * 100);
  const light = pct > 100 ? "🔴" : pct >= 80 ? "🟡" : "🟢";
  const rest = budget - spent;
  return `${light} *Presupuesto de la obra:* ${pct} % ejecutado · ${rest >= 0 ? `quedan ${fmtGs(rest)}` : `se pasó ${fmtGs(-rest)}`}\n   (${fmtGs(spent)} de ${fmtGs(budget)})`;
}

async function pendingQuickLine(): Promise<string | null> {
  const n = await prisma.quickExpense.count({ where: { resuelto: false } });
  return n ? `📥 Quedan ${n} registro${n === 1 ? "" : "s"} rápido${n === 1 ? "" : "s"} sin clasificar.` : null;
}

function appUrl(path: string): string | null {
  const base =
    process.env.APP_BASE_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return base ? `${base}${path}` : null;
}

/**
 * Registra en firme una propuesta. La transición pendiente -> ejecutando es
 * atómica (updateMany con condición de estado): un doble toque en
 * "Confirmar" o un webhook repetido de WhatsApp nunca registra dos veces.
 */
export async function executePendingAction(user: AgentUser, id: string): Promise<string> {
  const claimed = await prisma.whatsAppPendingAction.updateMany({
    where: { id, phone: user.phone, status: "pendiente", expiresAt: { gt: new Date() } },
    data: { status: "ejecutando" },
  });
  if (claimed.count !== 1) {
    const a = await prisma.whatsAppPendingAction.findFirst({ where: { id, phone: user.phone } });
    if (!a) return "No encontré esa propuesta.";
    if (a.status === "confirmada") return "✅ Eso ya estaba registrado (no lo registré de nuevo).";
    if (a.status === "cancelada") return "Esa propuesta estaba cancelada, así que no registré nada. Si querés, pedímela de nuevo.";
    if (a.status === "ejecutando") return "Eso se está registrando en este momento.";
    if (a.status === "fallida") {
      return `Esa propuesta había fallado (${a.error ?? "error desconocido"}). Antes de pedirla de nuevo, fijate en la app que no haya quedado cargada.`;
    }
    return "Esa propuesta venció (tenían 24 horas para confirmarse). Pedímela de nuevo y te la preparo.";
  }

  const action = await prisma.whatsAppPendingAction.findUniqueOrThrow({ where: { id } });
  let result: { resultId: string; message: string };
  try {
    result = await runAction(user, action.kind as ActionKind, action.payload as any);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("WhatsApp agent: fallo al ejecutar propuesta", id, msg);
    await prisma.whatsAppPendingAction
      .update({ where: { id }, data: { status: "fallida", error: msg.slice(0, 500) } })
      .catch((e) => console.error("WhatsApp agent: no se pudo marcar fallida", id, e));
    if ((err as Partial<NothingWrittenError>)?.nothingWritten) return `❌ No registré nada: ${msg}`;
    return "❌ No se pudo registrar. Antes de reintentar, fijate en la app que no haya quedado cargado; después pedímelo de nuevo o cargalo a mano.";
  }
  // Ya está registrado: si falla solo la marca de "confirmada", el usuario
  // igual tiene que enterarse de que se guardó.
  await prisma.whatsAppPendingAction
    .update({ where: { id }, data: { status: "confirmada", resultId: result.resultId } })
    .catch((e) => console.error("WhatsApp agent: registrado pero no se pudo marcar confirmada", id, result.resultId, e));
  return result.message;
}

/** Marca la captura de Registro rápido como clasificada, dentro de la misma transacción que crea el movimiento. */
async function claimQuickExpense(tx: Prisma.TransactionClient, registroRapidoId: string | null | undefined) {
  if (!registroRapidoId) return;
  const res = await tx.quickExpense.updateMany({ where: { id: registroRapidoId, resuelto: false }, data: { resuelto: true } });
  if (res.count !== 1) {
    throw new NothingWrittenError("esa captura de Registro rápido ya se había clasificado (desde la app o en otro mensaje), así que no la cargué de nuevo.");
  }
}

async function runAction(user: AgentUser, kind: ActionKind, payload: any): Promise<{ resultId: string; message: string }> {
  const procesadoPor = `WhatsApp · ${user.name}`;

  if (kind === "movimiento_obra") {
    const p = payload as MovimientoObraPayload;
    const obra = await prisma.project.findUnique({ where: { id: p.obraId }, select: { id: true } });
    if (!obra) throw new NothingWrittenError("la obra ya no existe.");
    const data: Record<string, unknown> = {
      tipo: p.tipo,
      monto: p.monto,
      fecha: p.fecha,
      ...(p.tipoInsumo ? { tipoInsumo: p.tipoInsumo } : {}),
      ...(p.proveedorId ? { proveedorId: p.proveedorId, proveedorNombre: p.proveedorNombre } : {}),
      ...(p.categoria ? { categoria: p.categoria } : {}),
      ...(p.medioPago ? { medioPago: p.medioPago } : {}),
      ...(p.notas ? { notas: p.notas } : {}),
      procesadoPor,
    };
    // Movimiento + feed + Ejecutado + captura clasificada: todo o nada.
    const item = await createProjectItem(
      { projectId: p.obraId, kind: "change_order", title: p.rubro, status: p.estado, data: data as Prisma.InputJsonValue },
      (tx) => claimQuickExpense(tx, p.registroRapidoId)
    );
    // El movimiento ya quedó registrado: si adjuntar el comprobante falla,
    // se avisa pero no se da por fallida la propuesta entera.
    let adjunto = "";
    if (p.comprobanteMediaId) {
      try {
        const media = await prisma.inboundMedia.findUnique({ where: { id: p.comprobanteMediaId } });
        if (!media) throw new Error("media no encontrada");
        await prisma.attachment.create({
          data: {
            projectItemId: item.id,
            filename: media.filename || `comprobante-whatsapp.${media.mimeType === "application/pdf" ? "pdf" : "jpg"}`,
            mimeType: media.mimeType,
            size: media.size,
            data: media.data,
          },
        });
        adjunto = " con el comprobante adjunto";
      } catch (err) {
        console.error("WhatsApp agent: no se pudo adjuntar el comprobante", item.id, err);
        adjunto = " (ojo: no se pudo adjuntar el comprobante, subilo desde la app)";
      }
    }
    const url = appUrl(`/project/${p.obraId}`);
    const lines = [
      "✅ *Registrado · Movimiento de obra*",
      `📍 ${p.obraLabel}`,
      "",
      ...detail([
        ["Monto", `*${fmtGs(p.monto)}*`],
        ["Rubro", p.rubro],
        ["Tipo", `${p.tipo}${p.tipoInsumo ? ` · ${p.tipoInsumo}` : ""}`],
        ["Proveedor", p.proveedorNombre],
        ["Fecha", fechaLabel(p.fecha)],
        ["Medio de pago", p.medioPago],
        ["Estado", p.estado],
        ["Centro de costos", p.categoria],
        ["Notas", p.notas ? short(p.notas, NOTAS_EN_RESUMEN) : null],
        ["Comprobante", adjunto ? (adjunto.startsWith(" con") ? "adjunto ✓" : "⚠️ no se pudo adjuntar, subilo desde la app") : null],
        ["Registro rápido", p.registroRapidoId ? "la captura quedó clasificada ✓" : null],
      ]),
    ];
    const budget = await budgetLine(p.obraId).catch(() => null);
    if (budget) lines.push("", budget);
    if (url) lines.push("", `🔗 ${url}`);
    return { resultId: item.id, message: lines.join("\n") };
  }

  if (kind === "movimiento_general") {
    const p = payload as MovimientoGeneralPayload;
    const g = await prisma.$transaction(async (tx) => {
      await claimQuickExpense(tx, p.registroRapidoId);
      return tx.generalMovement.create({
        data: {
          fecha: new Date(p.fecha),
          tipo: p.tipo,
          concepto: p.concepto,
          categoria: p.categoria,
          monto: p.monto,
          medioPago: p.medioPago,
          estado: p.estado,
          procesadoPor,
          responsable: p.responsable,
          notas: p.notas,
          comprobanteMediaId: p.comprobanteMediaId,
        },
      });
    });
    const url = appUrl("/movimientos");
    const lines = [
      `✅ *Registrado · ${p.tipo === "ingreso" ? "Ingreso" : "Egreso"} general (sin obra)*`,
      "",
      ...detail([
        ["Monto", `*${fmtGs(p.monto)}*`],
        ["Concepto", p.concepto],
        ["Fecha", fechaLabel(p.fecha)],
        ["Categoría", p.categoria],
        ["Medio de pago", p.medioPago],
        ["Estado", p.estado],
        ["Responsable", p.responsable],
        ["Notas", p.notas ? short(p.notas, NOTAS_EN_RESUMEN) : null],
        ["Comprobante", p.comprobanteMediaId ? "adjunto ✓" : null],
        ["Registro rápido", p.registroRapidoId ? "la captura quedó clasificada ✓" : null],
      ]),
    ];
    if (url) lines.push("", `🔗 ${url}`);
    return { resultId: g.id, message: lines.join("\n") };
  }

  if (kind === "registro_rapido") {
    const p = payload as RegistroRapidoPayload;
    const nota = [p.nota, `(vía WhatsApp · ${user.name})`].filter(Boolean).join(" ");
    const q = await prisma.quickExpense.create({
      data: { fecha: new Date(p.fecha), monto: p.monto, medioPago: p.medioPago, nota, comprobanteMediaId: p.comprobanteMediaId },
    });
    const url = appUrl("/registro-rapido");
    const lines = [
      "✅ *Anotado en Registro rápido*",
      "",
      ...detail([
        ["Monto", `*${fmtGs(p.monto)}*`],
        ["Medio de pago", p.medioPago],
        ["Fecha", fechaLabel(p.fecha)],
        ["Nota", p.nota ? short(p.nota, NOTAS_EN_RESUMEN) : null],
        ["Comprobante", p.comprobanteMediaId ? "adjunto ✓" : null],
      ]),
      "",
      "Falta decir a qué obra o concepto va: clasificalo desde la app o pedímelo por acá.",
    ];
    const pend = await pendingQuickLine().catch(() => null);
    if (pend) lines.push(pend);
    if (url) lines.push("", `🔗 ${url}`);
    return { resultId: q.id, message: lines.join("\n") };
  }

  throw new NothingWrittenError(`tipo de propuesta desconocido (${kind}).`);
}
