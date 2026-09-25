import { randomInt } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { prisma } from "../prisma";
import type { InboundMessage } from "./parse";
import { type WhatsAppConfig, authorizedUserName, normalizePhone } from "./config";
import { type Transport, cloudTransport, codeInstructions } from "./transport";
import { isAffirmative, isNegative, parseButtonId } from "./confirm";
import { acquirePhoneLock, releasePhoneLock } from "./lock";
import { runAgentTurn, isAgentConfigured } from "../agent/run";
import {
  executePendingAction,
  cancelPendingAction,
  MAX_MEDIA_BYTES,
  MAX_IMAGE_BYTES,
  type AgentUser,
} from "../agent/actions";

// Procesa UN mensaje entrante de WhatsApp de punta a punta. Lo que se puede
// resolver sin IA se resuelve en código (autorización, duplicados, botones
// Confirmar/Cancelar); solo lo demás pasa por el modelo.
//
// Registrar plata requiere SIEMPRE tocar el botón Confirmar de la tarjeta:
// un "sí" escrito puede estar contestando otra cosa ("¿no será repetido?",
// una pregunta anterior citada, etc.), así que nunca confirma nada.

/** Tipos que Claude puede leer y que la ficha de la obra sabe mostrar. */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const PDF_TYPE = "application/pdf";
/** Un comprobante es 1-2 hojas; un PDF largo es caro de leer y casi seguro no es un comprobante. */
const MAX_PDF_PAGES = 20;
/** Un "Confirmar" que WhatsApp entrega con más atraso que esto no se ejecuta (pudo haberse registrado por otro lado). */
const STALE_BUTTON_MS = 10 * 60 * 1000;
/** Mensajes retenidos por WhatsApp más que esto no se mandan al modelo (llegan juntos y fuera de contexto). */
const STALE_TEXT_MS = 15 * 60 * 1000;
/** Tiempo que se reserva al final del turno para mandar la respuesta y las tarjetas. */
const REPLY_MARGIN_MS = 7_000;
const MIN_AGENT_MS = 8_000;

const STALE_NOTICE = "⏳ Me llegaron con atraso algunos mensajes tuyos (WhatsApp los retuvo). Si algo sigue pendiente, repetímelo y lo vemos.";
const USE_BUTTON_NOTICE =
  "Para registrar tocá ✅ *Confirmar* en la tarjeta de la propuesta (o ❌ *Cancelar*). Por seguridad, un \"sí\" escrito no registra nada.";
const USE_CODE_NOTICE =
  "Para registrar respondé con el código que figura en la propuesta, por ejemplo *OK 1234* (o *NO 1234* para descartarla). Por seguridad, un \"sí\" solo no registra nada.";

/** "OK 4821" / "sí 4821" / "confirmar 4821" → confirmar; "NO 4821" / "cancelar 4821" → cancelar. */
function parseCodeReply(text: string): { op: "confirm" | "cancel"; code: string } | null {
  const n = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[*_.!¡]/g, "").trim();
  const m = /^(ok|si|confirmar|confirmo|confirma|dale|no|cancelar|cancela|cancelo|anular|anula|descartar|descarta)\s*[-:#]?\s*(\d{4})$/.exec(n);
  if (!m) return null;
  return { op: /^(no|cancel|anul|descart)/.test(m[1]) ? "cancel" : "confirm", code: m[2] };
}

/** Código de 4 dígitos para la propuesta, distinto de los de otras propuestas pendientes de ese número. */
async function assignConfirmCode(phone: string, actionId: string): Promise<string> {
  const pending = await prisma.whatsAppPendingAction.findMany({
    where: { phone, status: "pendiente", confirmCode: { not: null }, id: { not: actionId } },
    select: { confirmCode: true },
  });
  const used = new Set(pending.map((p) => p.confirmCode));
  let code = "";
  do code = String(randomInt(1000, 10000));
  while (used.has(code));
  await prisma.whatsAppPendingAction.update({ where: { id: actionId }, data: { confirmCode: code } });
  return code;
}

function mask(phone: string) {
  return phone.length > 6 ? `${phone.slice(0, 5)}…${phone.slice(-3)}` : "…";
}

function cleanMime(m: string): string {
  const base = m.split(";")[0].trim().toLowerCase();
  return base === "image/jpg" ? "image/jpeg" : base;
}

/**
 * Errores de la cuenta de la IA (no del mensaje): clave inválida, sin saldo,
 * límite de gasto alcanzado. Reintentar no sirve: hay que avisarle al
 * administrador, no pedirle al usuario que "pruebe de nuevo".
 */
function aiAccountProblem(err: unknown): string | null {
  if (!(err instanceof Anthropic.APIError)) return null;
  const body = ((err as { error?: { error?: { message?: string; details?: { error_code?: string } } } }).error?.error) ?? {};
  const message = String(body.message ?? "");
  if (err.status === 401 || err.status === 403) {
    return "⚠️ El asistente no puede usar la IA: la clave de Anthropic no es válida o no tiene permisos. Avisale al administrador.";
  }
  if (
    err.status === 402 ||
    message.startsWith("You have reached your specified") ||
    /credit balance/i.test(message) ||
    body.details?.error_code === "enforced_spend_limit_reached"
  ) {
    return "⚠️ El asistente está en pausa: la cuenta de la IA se quedó sin saldo o llegó a su límite de gasto. Avisale al administrador.";
  }
  return null;
}

/** Cuenta páginas de un PDF sin dependencias. Si no las encuentra (PDF comprimido) devuelve 0 y no se bloquea. */
function pdfPageCount(data: Buffer): number {
  return (data.toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
}

async function saveOutgoing(phone: string, text: string, extra: { proposalId?: string; waMessageId?: string | null } = {}) {
  await prisma.whatsAppMessage.create({
    data: { phone, direction: "out", text, proposalId: extra.proposalId ?? null, waMessageId: extra.waMessageId ?? null },
  });
}

async function reply(t: Transport, user: AgentUser, text: string) {
  const wamid = await t.sendText(user.phone, text);
  await saveOutgoing(user.phone, text, { waMessageId: wamid });
}

/**
 * @param deadline epoch ms hasta el que esta función puede trabajar (la de
 *                 Vercel muere a los maxDuration segundos del POST).
 */
export async function handleInbound(
  channel: Transport | WhatsAppConfig,
  msg: InboundMessage,
  deadline: number = Date.now() + 55_000
): Promise<void> {
  const t: Transport = "sendProposal" in channel ? channel : cloudTransport(channel);
  const phone = normalizePhone(msg.from);
  const name = authorizedUserName(phone);
  if (!name) {
    // A un número desconocido no se le responde nada (ni se le confirma que el bot existe).
    console.warn(`WhatsApp: mensaje de número no autorizado ${mask(phone)} ignorado`);
    return;
  }
  const user: AgentUser = { phone, name };

  const storedText =
    msg.kind === "text"
      ? msg.text
      : msg.kind === "media"
        ? msg.caption ?? ""
        : msg.kind === "button"
          ? `[Tocó el botón "${msg.title}"]`
          : `[Mandó un mensaje de tipo ${msg.type}]`;

  // Deduplicación: WhatsApp puede reenviar el mismo webhook. waMessageId es
  // único en la tabla, así que un repetido se descarta (el findUnique evita
  // ruido en los logs en el caso común; el catch cubre dos entregas simultáneas).
  const already = await prisma.whatsAppMessage.findUnique({ where: { waMessageId: msg.waMessageId }, select: { id: true } });
  if (already) return;
  let inbound: { id: string; createdAt: Date };
  try {
    inbound = await prisma.whatsAppMessage.create({
      data: { phone, direction: "in", waMessageId: msg.waMessageId, text: storedText },
      select: { id: true, createdAt: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
  const ageMs = msg.timestamp > 0 ? Date.now() - msg.timestamp * 1000 : 0;
  // "escribiendo…" solo si el agente va a contestar ese mensaje con la IA.
  const willThink = (msg.kind === "text" || msg.kind === "media") && ageMs <= STALE_TEXT_MS;
  t.markRead(msg, willThink).catch(() => {});

  try {
    if (msg.kind === "button") {
      // Los botones no esperan el turno del agente: la ejecución ya es atómica.
      const parsed = parseButtonId(msg.buttonId);
      if (!parsed) return reply(t, user, "Ese botón ya no sirve. Pedime de nuevo lo que necesitás.");
      if (parsed.op === "confirm" && ageMs > STALE_BUTTON_MS) {
        const min = Math.round(ageMs / 60000);
        return reply(t, user, `Ese *Confirmar* me llegó con ${min} minutos de atraso (WhatsApp lo retuvo), así que no registré nada. Si todavía vale, tocalo de nuevo.`);
      }
      const result =
        parsed.op === "confirm"
          ? await executePendingAction(user, parsed.actionId)
          : await cancelPendingAction(phone, parsed.actionId);
      return reply(t, user, result);
    }

    if (msg.kind === "unsupported") {
      return reply(
        t,
        user,
        msg.type === "audio"
          ? "🎤 Todavía no puedo escuchar audios. Escribime el mensaje, o mandame una foto o PDF del comprobante."
          : "Por ahora entiendo mensajes de texto, fotos y PDF."
      );
    }

    // Texto o archivo: un turno por número a la vez, en orden de llegada.
    const lockToken = await acquirePhoneLock(phone, Math.min(Date.now() + 25_000, deadline - 20_000));
    if (!lockToken) console.warn(`WhatsApp: ${mask(phone)} sigue ocupado; se procesa igual`);
    try {
      await handleContent(t, user, msg, inbound, ageMs, deadline);
    } finally {
      if (lockToken) await releasePhoneLock(phone, lockToken);
    }
  } catch (err) {
    console.error("WhatsApp: error procesando mensaje", msg.waMessageId, err);
    await reply(t, user, "Tuve un problema procesando tu mensaje 😕 Probá de nuevo en un rato.").catch(() => {});
  }
}

async function handleContent(
  t: Transport,
  user: AgentUser,
  msg: Extract<InboundMessage, { kind: "text" } | { kind: "media" }>,
  inbound: { id: string; createdAt: Date },
  ageMs: number,
  deadline: number
) {
  if (ageMs > STALE_TEXT_MS) {
    // Queda en el historial, pero no se le contesta uno por uno.
    const recentNotice = await prisma.whatsAppMessage.findFirst({
      where: { phone: user.phone, direction: "out", text: STALE_NOTICE, createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) } },
      select: { id: true },
    });
    if (!recentNotice) await reply(t, user, STALE_NOTICE);
    return;
  }

  if (msg.kind === "text") {
    const text = msg.text.trim();
    if (!text) return;
    // "OK 4821" / "NO 4821": confirma o cancela LA propuesta con ese código,
    // resuelto en código, sin pasar por el modelo.
    const byCode = parseCodeReply(text);
    if (byCode) {
      const action = await prisma.whatsAppPendingAction.findFirst({
        where: { phone: user.phone, confirmCode: byCode.code },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!action) return reply(t, user, `No encontré una propuesta con el código ${byCode.code}. Revisá el número en la tarjeta.`);
      if (byCode.op === "confirm" && ageMs > STALE_BUTTON_MS) {
        return reply(t, user, `Ese *OK ${byCode.code}* me llegó con ${Math.round(ageMs / 60000)} minutos de atraso, así que no registré nada. Si todavía vale, mandalo de nuevo.`);
      }
      const result =
        byCode.op === "confirm" ? await executePendingAction(user, action.id) : await cancelPendingAction(user.phone, action.id);
      return reply(t, user, result);
    }
    // "sí"/"no" a secas justo después de una tarjeta: se le recuerda cómo
    // confirmar (sin gastar una llamada al modelo).
    if (isAffirmative(text) || isNegative(text)) {
      const lastOut = await prisma.whatsAppMessage.findFirst({
        where: { phone: user.phone, direction: "out", NOT: { text: { in: [USE_BUTTON_NOTICE, USE_CODE_NOTICE] } } },
        orderBy: { createdAt: "desc" },
        select: { proposalId: true },
      });
      if (lastOut?.proposalId) {
        const p = await prisma.whatsAppPendingAction.findUnique({ where: { id: lastOut.proposalId }, select: { status: true } });
        if (p?.status === "pendiente") return reply(t, user, t.buttons ? USE_BUTTON_NOTICE : USE_CODE_NOTICE);
      }
    }
    return agentTurn(t, user, inbound, [{ type: "text", text }], deadline, false);
  }

  // Foto o documento (comprobante).
  const declared = cleanMime(msg.mimeType);
  if (!IMAGE_TYPES.includes(declared) && declared !== PDF_TYPE) {
    return reply(t, user, "Por ahora leo comprobantes en foto (JPG/PNG/WEBP) o PDF. ¿Me lo mandás en alguno de esos formatos?");
  }
  const dl = await t.downloadMedia(msg, MAX_MEDIA_BYTES);
  if ("tooLarge" in dl) {
    return reply(t, user, "Ese archivo pesa más de 4 MB, que es el máximo. Probá con una foto de menor resolución o un PDF más liviano.");
  }
  const mimeType = cleanMime(dl.mimeType) || declared;
  const isPdf = mimeType === PDF_TYPE;
  if (!isPdf && !IMAGE_TYPES.includes(mimeType)) {
    return reply(t, user, "No pude leer ese archivo. Mandámelo como foto (JPG/PNG) o PDF.");
  }
  if (!isPdf && dl.data.length > MAX_IMAGE_BYTES) {
    return reply(t, user, "Esa imagen es muy pesada para leerla (más de 3,5 MB). Mandala como foto normal de WhatsApp (no como documento) o una captura de pantalla.");
  }
  if (isPdf) {
    const pages = pdfPageCount(dl.data);
    if (pages > MAX_PDF_PAGES) {
      return reply(t, user, `Ese PDF tiene ${pages} páginas. Mandame solo la hoja del comprobante (una captura o un PDF de 1-2 páginas).`);
    }
  }

  const media = await prisma.inboundMedia.create({
    data: { phone: user.phone, waMediaId: msg.waMediaId, mimeType, filename: msg.filename, size: dl.data.length, data: dl.data },
  });
  const caption = msg.caption?.trim() ?? "";
  const label = isPdf ? "un PDF" : "una foto";
  // En el historial queda una referencia de texto (con el id) — la imagen
  // en sí solo se le manda al modelo en este turno (después, ver_comprobante).
  await prisma.whatsAppMessage.update({
    where: { id: inbound.id },
    data: { mediaId: media.id, text: `[Mandó ${label} — comprobanteId ${media.id}]${caption ? ` ${caption}` : ""}` },
  });

  const base64 = dl.data.toString("base64");
  const fileBlock: BetaContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : {
        type: "image",
        source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: base64 },
      };
  return agentTurn(
    t,
    user,
    inbound,
    [
      fileBlock,
      {
        type: "text",
        text: `El usuario mandó ${label} (comprobanteId: ${media.id}).${caption ? ` Su mensaje: ${caption}` : " Sin texto."}`,
      },
    ],
    deadline,
    true
  );
}

async function agentTurn(
  t: Transport,
  user: AgentUser,
  inbound: { id: string; createdAt: Date },
  content: BetaContentBlockParam[],
  deadline: number,
  hasFile: boolean
) {
  if (!isAgentConfigured()) {
    return reply(t, user, "El asistente todavía no está configurado (falta la clave de la IA). Avisale a quien administra el sistema.");
  }
  const timeoutMs = deadline - Date.now() - REPLY_MARGIN_MS;
  if (timeoutMs < MIN_AGENT_MS) {
    return reply(t, user, "Se me juntaron varios mensajes y no llegué a este 😅 ¿Me lo repetís?");
  }

  let turn: Awaited<ReturnType<typeof runAgentTurn>>;
  try {
    turn = await runAgentTurn(user, content, inbound, timeoutMs);
  } catch (err) {
    const accountProblem = aiAccountProblem(err);
    if (accountProblem) {
      console.error("WhatsApp agent: problema con la cuenta de Anthropic", (err as InstanceType<typeof Anthropic.APIError>).status, (err as InstanceType<typeof Anthropic.APIError>).requestID, (err as Error).message);
      return reply(t, user, accountProblem);
    }
    if (hasFile && err instanceof Anthropic.BadRequestError) {
      console.error("WhatsApp agent: el API rechazó el archivo", err.requestID, err.message);
      return reply(t, user, "No pude leer ese archivo 😕 Mandámelo como foto normal de WhatsApp o una captura de pantalla.");
    }
    throw err;
  }

  // Pudo haberse reemplazado alguna propuesta dentro del mismo turno.
  const cards: { propuestaId: string; body: string }[] = [];
  for (const p of turn.proposals) {
    const current = await prisma.whatsAppPendingAction.findUnique({ where: { id: p.propuestaId }, select: { status: true } });
    if (current?.status === "pendiente") cards.push({ propuestaId: p.propuestaId, body: p.resumen });
  }

  // Desde el 1/10/2026 Meta cobra cada mensaje de respuesta: si la frase del
  // agente entra en la tarjeta (tope de 1024 caracteres), va en el mismo mensaje.
  let text = turn.reply;
  if (text && cards.length) {
    const combined = `${text}\n\n${cards[0].body}`;
    if (Array.from(combined).length <= 1024) {
      cards[0] = { ...cards[0], body: combined };
      text = "";
    }
  }

  if (text) await reply(t, user, text);
  for (const c of cards) {
    // Sin botones (conexión por QR), la tarjeta lleva un código propio de esa
    // propuesta: "OK 4821" confirma ESA y ninguna otra.
    const code = await assignConfirmCode(user.phone, c.propuestaId);
    const body = t.buttons ? c.body : `${c.body}\n\n${codeInstructions(code)}`;
    const wamid = await t.sendProposal(user.phone, body, c.propuestaId, code);
    // Queda en el historial vinculada a su propuesta (columna aparte, no texto:
    // así el modelo sabe qué reemplazar si el usuario corrige).
    await saveOutgoing(user.phone, body, { proposalId: c.propuestaId, waMessageId: wamid });
  }

  if (!turn.reply && turn.proposals.length === 0) {
    await reply(t, user, "🤔 No te entendí bien, ¿me lo decís de otra forma?");
  }
}
