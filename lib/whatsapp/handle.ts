import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { prisma } from "../prisma";
import type { InboundMessage } from "./parse";
import { type WhatsAppConfig, authorizedUserName, normalizePhone } from "./config";
import { sendText, sendConfirmButtons, markAsRead, downloadMedia } from "./client";
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

function mask(phone: string) {
  return phone.length > 6 ? `${phone.slice(0, 5)}…${phone.slice(-3)}` : "…";
}

function cleanMime(m: string): string {
  const base = m.split(";")[0].trim().toLowerCase();
  return base === "image/jpg" ? "image/jpeg" : base;
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

async function reply(cfg: WhatsAppConfig, user: AgentUser, text: string) {
  const wamid = await sendText(cfg, user.phone, text);
  await saveOutgoing(user.phone, text, { waMessageId: wamid });
}

/**
 * @param deadline epoch ms hasta el que esta función puede trabajar (la de
 *                 Vercel muere a los maxDuration segundos del POST).
 */
export async function handleInbound(cfg: WhatsAppConfig, msg: InboundMessage, deadline: number = Date.now() + 55_000): Promise<void> {
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
  markAsRead(cfg, msg.waMessageId).catch(() => {});
  const ageMs = msg.timestamp > 0 ? Date.now() - msg.timestamp * 1000 : 0;

  try {
    if (msg.kind === "button") {
      // Los botones no esperan el turno del agente: la ejecución ya es atómica.
      const parsed = parseButtonId(msg.buttonId);
      if (!parsed) return reply(cfg, user, "Ese botón ya no sirve. Pedime de nuevo lo que necesitás.");
      if (parsed.op === "confirm" && ageMs > STALE_BUTTON_MS) {
        const min = Math.round(ageMs / 60000);
        return reply(cfg, user, `Ese *Confirmar* me llegó con ${min} minutos de atraso (WhatsApp lo retuvo), así que no registré nada. Si todavía vale, tocalo de nuevo.`);
      }
      const result =
        parsed.op === "confirm"
          ? await executePendingAction(user, parsed.actionId)
          : await cancelPendingAction(phone, parsed.actionId);
      return reply(cfg, user, result);
    }

    if (msg.kind === "unsupported") {
      return reply(
        cfg,
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
      await handleContent(cfg, user, msg, inbound, ageMs, deadline);
    } finally {
      if (lockToken) await releasePhoneLock(phone, lockToken);
    }
  } catch (err) {
    console.error("WhatsApp: error procesando mensaje", msg.waMessageId, err);
    await reply(cfg, user, "Tuve un problema procesando tu mensaje 😕 Probá de nuevo en un rato.").catch(() => {});
  }
}

async function handleContent(
  cfg: WhatsAppConfig,
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
    if (!recentNotice) await reply(cfg, user, STALE_NOTICE);
    return;
  }

  if (msg.kind === "text") {
    const text = msg.text.trim();
    if (!text) return;
    // "sí"/"no" a secas justo después de una tarjeta: se le recuerda que
    // confirme con el botón (sin gastar una llamada al modelo).
    if (isAffirmative(text) || isNegative(text)) {
      const lastOut = await prisma.whatsAppMessage.findFirst({
        where: { phone: user.phone, direction: "out", NOT: { text: USE_BUTTON_NOTICE } },
        orderBy: { createdAt: "desc" },
        select: { proposalId: true },
      });
      if (lastOut?.proposalId) {
        const p = await prisma.whatsAppPendingAction.findUnique({ where: { id: lastOut.proposalId }, select: { status: true } });
        if (p?.status === "pendiente") return reply(cfg, user, USE_BUTTON_NOTICE);
      }
    }
    return agentTurn(cfg, user, inbound, [{ type: "text", text }], deadline, false);
  }

  // Foto o documento (comprobante).
  const declared = cleanMime(msg.mimeType);
  if (!IMAGE_TYPES.includes(declared) && declared !== PDF_TYPE) {
    return reply(cfg, user, "Por ahora leo comprobantes en foto (JPG/PNG/WEBP) o PDF. ¿Me lo mandás en alguno de esos formatos?");
  }
  const dl = await downloadMedia(cfg, msg.waMediaId, MAX_MEDIA_BYTES);
  if ("tooLarge" in dl) {
    return reply(cfg, user, "Ese archivo pesa más de 4 MB, que es el máximo. Probá con una foto de menor resolución o un PDF más liviano.");
  }
  const mimeType = cleanMime(dl.mimeType) || declared;
  const isPdf = mimeType === PDF_TYPE;
  if (!isPdf && !IMAGE_TYPES.includes(mimeType)) {
    return reply(cfg, user, "No pude leer ese archivo. Mandámelo como foto (JPG/PNG) o PDF.");
  }
  if (!isPdf && dl.data.length > MAX_IMAGE_BYTES) {
    return reply(cfg, user, "Esa imagen es muy pesada para leerla (más de 3,5 MB). Mandala como foto normal de WhatsApp (no como documento) o una captura de pantalla.");
  }
  if (isPdf) {
    const pages = pdfPageCount(dl.data);
    if (pages > MAX_PDF_PAGES) {
      return reply(cfg, user, `Ese PDF tiene ${pages} páginas. Mandame solo la hoja del comprobante (una captura o un PDF de 1-2 páginas).`);
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
    cfg,
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
  cfg: WhatsAppConfig,
  user: AgentUser,
  inbound: { id: string; createdAt: Date },
  content: BetaContentBlockParam[],
  deadline: number,
  hasFile: boolean
) {
  if (!isAgentConfigured()) {
    return reply(cfg, user, "El asistente todavía no está configurado (falta la clave de la IA). Avisale a quien administra el sistema.");
  }
  const timeoutMs = deadline - Date.now() - REPLY_MARGIN_MS;
  if (timeoutMs < MIN_AGENT_MS) {
    return reply(cfg, user, "Se me juntaron varios mensajes y no llegué a este 😅 ¿Me lo repetís?");
  }

  let turn: Awaited<ReturnType<typeof runAgentTurn>>;
  try {
    turn = await runAgentTurn(user, content, inbound, timeoutMs);
  } catch (err) {
    if (hasFile && err instanceof Anthropic.BadRequestError) {
      console.error("WhatsApp agent: el API rechazó el archivo", err.message);
      return reply(cfg, user, "No pude leer ese archivo 😕 Mandámelo como foto normal de WhatsApp o una captura de pantalla.");
    }
    throw err;
  }

  if (turn.reply) await reply(cfg, user, turn.reply);
  for (const p of turn.proposals) {
    // Pudo haberse reemplazado por otra propuesta dentro del mismo turno.
    const current = await prisma.whatsAppPendingAction.findUnique({ where: { id: p.propuestaId }, select: { status: true } });
    if (current?.status !== "pendiente") continue;
    const wamid = await sendConfirmButtons(cfg, user.phone, p.resumen, p.propuestaId);
    // Queda en el historial vinculada a su propuesta (columna aparte, no texto:
    // así el modelo sabe qué reemplazar si el usuario corrige).
    await saveOutgoing(user.phone, p.resumen, { proposalId: p.propuestaId, waMessageId: wamid });
  }

  if (!turn.reply && turn.proposals.length === 0) {
    await reply(cfg, user, "🤔 No te entendí bien, ¿me lo decís de otra forma?");
  }
}
