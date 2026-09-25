// Conector de WhatsApp por QR (Baileys). Vincula una cuenta de WhatsApp
// como "dispositivo vinculado" (igual que WhatsApp Web) y le pasa los
// mensajes al agente de ObrasFlow (lib/whatsapp/handle.ts).
//
// Tiene que quedar corriendo en una PC o servidor encendido todo el tiempo:
// Vercel no puede mantener la conexión abierta. Se inicia con
//   npm run wa:conector
// y lee las variables de .env.local (misma base de datos que la app en
// Vercel). El estado y el QR se ven en la pantalla /agente-whatsapp.
//
// La sesión vinculada queda en la carpeta .baileys-auth/ (git la ignora):
// quien tenga esa carpeta puede usar la cuenta, así que no se comparte.

import { rmSync } from "fs";
import { resolve } from "path";
import pino from "pino";
import QRCode from "qrcode";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  isLidUser,
  isPnUser,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import { prisma } from "../lib/prisma";
import { handleInbound } from "../lib/whatsapp/handle";
import type { InboundMessage } from "../lib/whatsapp/parse";
import type { Transport } from "../lib/whatsapp/transport";
import { getAllowedNumbers } from "../lib/whatsapp/config";
import { startLocalPanel } from "./local-panel.mjs";

const SESSION_ID = "baileys";
/** Sin una URL de Postgres válida el conector arranca solo su página local, para que se la carguen ahí. */
const DB_OK = /^postgres(ql)?:\/\//.test(process.env.POSTGRES_PRISMA_URL?.trim() ?? "");
const AUTH_DIR = process.env.BAILEYS_AUTH_DIR?.trim() || resolve(process.cwd(), ".baileys-auth");
/** Tiempo máximo por mensaje (acá no hay límite de Vercel). */
const TURN_BUDGET_MS = 120_000;
const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || "warn" });

let sock: WASocket | null = null;
let stopping = false;
let reconnectTimer: NodeJS.Timeout | null = null;

/** Mensajes recientes por id: para marcar leído y bajar fotos/PDF. */
const recent = new Map<string, WAMessage>();
/** Último chat (jid) de cada teléfono: se responde por el mismo chat. */
const jidByPhone = new Map<string, string>();

function remember(m: WAMessage) {
  recent.set(m.key.id!, m);
  if (recent.size > 500) recent.delete(recent.keys().next().value!);
}

/** Estado actual, para la página local (el QR vive SOLO acá, nunca en la base ni en Vercel). */
export const local = {
  status: "desconectado",
  qr: null as string | null,
  phone: null as string | null,
  name: null as string | null,
  lastError: null as string | null,
  info: null as Record<string, unknown> | null,
};

async function setSession(data: { status?: string; qr?: string | null; phone?: string | null; name?: string | null; lastError?: string | null; command?: string | null }) {
  Object.assign(local, Object.fromEntries(Object.entries(data).filter(([k]) => k !== "command")));
  if (!DB_OK) return;
  const { qr: _qr, ...forDb } = data; // el QR no sale de esta PC
  await prisma.whatsAppSession
    .upsert({
      where: { id: SESSION_ID },
      create: { id: SESSION_ID, status: forDb.status ?? "desconectado", ...forDb, qr: null, heartbeatAt: new Date() },
      update: { ...forDb, qr: null, heartbeatAt: new Date() },
    })
    .catch((err) => console.error("No se pudo guardar el estado de la sesión:", err.message));
}

const digits = (jid: string) => jid.split("@")[0].split(":")[0];

/** Teléfono de quien escribe (WhatsApp puede mandar un id "@lid" y el número aparte). */
function senderPhone(m: WAMessage): string | null {
  const jid = m.key.remoteJid ?? "";
  if (isPnUser(jid)) return digits(jid);
  const alt = m.key.remoteJidAlt ?? "";
  if (isPnUser(alt)) return digits(alt);
  return null;
}

function timestampOf(m: WAMessage): number {
  const ts = m.messageTimestamp as unknown;
  if (typeof ts === "number") return ts;
  return Number((ts as { toString?: () => string })?.toString?.() ?? 0) || 0;
}

/** WAMessage -> mensaje interno del agente (null = no es algo que haya que contestar). */
function toInbound(m: WAMessage, phone: string): InboundMessage | null {
  const c = m.message;
  if (!c) return null;
  const inner =
    c.ephemeralMessage?.message ??
    c.viewOnceMessage?.message ??
    c.viewOnceMessageV2?.message ??
    c.documentWithCaptionMessage?.message ??
    c;
  const base = { waMessageId: m.key.id!, from: phone, timestamp: timestampOf(m) };
  const text = inner.conversation ?? inner.extendedTextMessage?.text;
  if (text) return { ...base, kind: "text", text };
  if (inner.imageMessage) {
    return {
      ...base,
      kind: "media",
      mediaType: "image",
      waMediaId: m.key.id!,
      mimeType: inner.imageMessage.mimetype ?? "image/jpeg",
      filename: null,
      caption: inner.imageMessage.caption ?? null,
    };
  }
  if (inner.documentMessage) {
    return {
      ...base,
      kind: "media",
      mediaType: "document",
      waMediaId: m.key.id!,
      mimeType: inner.documentMessage.mimetype ?? "application/octet-stream",
      filename: inner.documentMessage.fileName ?? null,
      caption: inner.documentMessage.caption ?? null,
    };
  }
  if (inner.audioMessage) return { ...base, kind: "unsupported", type: "audio" };
  if (inner.videoMessage) return { ...base, kind: "unsupported", type: "video" };
  if (inner.stickerMessage) return { ...base, kind: "unsupported", type: "sticker" };
  if (inner.locationMessage) return { ...base, kind: "unsupported", type: "location" };
  if (inner.contactMessage || inner.contactsArrayMessage) return { ...base, kind: "unsupported", type: "contacts" };
  // Reacciones, ediciones, borrados, avisos de cifrado, etc.: no se contestan.
  return null;
}

const transport: Transport = {
  kind: "baileys",
  buttons: false,
  async sendText(to, text) {
    if (!sock) throw new Error("WhatsApp no está conectado");
    const sent = await sock.sendMessage(jidByPhone.get(to) ?? `${to}@s.whatsapp.net`, { text });
    return sent?.key.id ?? null;
  },
  async sendProposal(to, body) {
    return transport.sendText(to, body);
  },
  async markRead(msg, typing) {
    const m = recent.get(msg.waMessageId);
    if (!sock || !m) return;
    await sock.readMessages([m.key]);
    if (typing && m.key.remoteJid) await sock.sendPresenceUpdate("composing", m.key.remoteJid);
  },
  async downloadMedia(msg, maxBytes) {
    const m = recent.get(msg.waMediaId);
    if (!sock || !m) throw new Error("No encontré el archivo del mensaje");
    const inner = m.message?.documentWithCaptionMessage?.message ?? m.message;
    const declared = Number(inner?.imageMessage?.fileLength ?? inner?.documentMessage?.fileLength ?? 0);
    if (declared > maxBytes) return { tooLarge: true, size: declared };
    const data = await downloadMediaMessage(m, "buffer", {}, { logger, reuploadRequest: sock.updateMediaMessage });
    if (data.length > maxBytes) return { tooLarge: true, size: data.length };
    return { data, mimeType: msg.mimeType };
  },
};

// Un mensaje por vez: las respuestas salen en el orden en que llegaron.
let queue: Promise<void> = Promise.resolve();

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  await setSession({ status: "conectando", lastError: null });

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.windows("ObrasFlow"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  const current = sock;

  current.ev.on("creds.update", saveCreds);

  current.ev.on("connection.update", async (u) => {
    if (current !== sock) return;
    if (u.qr) {
      const qr = await QRCode.toDataURL(u.qr, { margin: 1, width: 320 });
      await setSession({ status: "esperando_qr", qr, phone: null, name: null, lastError: null });
      console.log("📱 QR nuevo: escanealo desde la pantalla Agente WhatsApp de ObrasFlow.");
    }
    if (u.connection === "open") {
      const phone = current.user?.id ? digits(current.user.id) : null;
      await setSession({ status: "conectado", qr: null, phone, name: current.user?.name ?? null, lastError: null });
      console.log(`✅ Conectado como ${current.user?.name ?? ""} (${phone ?? "?"}).`);
    }
    if (u.connection === "close") {
      const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      if (stopping) return;
      if (code === DisconnectReason.loggedOut) {
        // Se desvinculó desde el teléfono (o desde la pantalla): borrar la sesión y pedir un QR nuevo.
        rmSync(AUTH_DIR, { recursive: true, force: true });
        await setSession({ status: "desconectado", qr: null, phone: null, name: null, lastError: "La sesión se cerró desde el teléfono. Escaneá el QR nuevo para volver a vincular." });
        console.log("🔌 Sesión cerrada. Generando un QR nuevo…");
        scheduleReconnect(2_000);
      } else if (code === DisconnectReason.connectionReplaced) {
        await setSession({ status: "desconectado", lastError: "Otra instancia del conector abrió esta misma sesión. Dejá corriendo uno solo." });
        console.log("⚠️ Otra instancia del conector tomó la sesión. Reintento en 60 s.");
        scheduleReconnect(60_000);
      } else {
        await setSession({ status: "conectando", lastError: code === DisconnectReason.restartRequired ? null : `Conexión cortada (código ${code ?? "?"}). Reconectando…` });
        scheduleReconnect(code === DisconnectReason.restartRequired ? 500 : 3_000);
      }
    }
  });

  current.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify" || current !== sock) return;
    for (const m of messages) {
      if (!m.key.id || m.key.fromMe) continue;
      const jid = m.key.remoteJid ?? "";
      // Solo chats individuales: grupos, estados y canales no se contestan.
      if (!isPnUser(jid) && !isLidUser(jid)) continue;
      const phone = senderPhone(m);
      if (!phone) {
        console.warn("WhatsApp: mensaje sin número de teléfono (solo id interno) ignorado");
        continue;
      }
      const inbound = toInbound(m, phone);
      if (!inbound) continue;
      remember(m);
      jidByPhone.set(phone, jid);
      queue = queue
        .then(() => handleInbound(transport, inbound, Date.now() + TURN_BUDGET_MS))
        .catch((err) => console.error("WhatsApp: error procesando mensaje", err));
    }
  });
}

function scheduleReconnect(ms: number) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect().catch((err) => {
      console.error("No se pudo conectar:", err);
      scheduleReconnect(10_000);
    });
  }, ms);
}

/** Latido para la pantalla ("el conector está corriendo") y pedidos desde ella (desvincular / reiniciar). */
async function heartbeat() {
  try {
    const s = await prisma.whatsAppSession.findUnique({ where: { id: SESSION_ID } });
    await prisma.whatsAppSession.update({ where: { id: SESSION_ID }, data: { heartbeatAt: new Date(), command: null } }).catch(() => {});
    if (s?.command === "logout" || s?.command === "restart") await runCommand(s.command);
  } catch (err) {
    console.error("Latido:", (err as Error).message);
  }
}

/** Desvincular (pide QR nuevo) o reiniciar la conexión. Lo usan la pantalla de la app y la página local. */
export async function runCommand(command: "logout" | "restart") {
  if (!sock) return;
  if (command === "logout") {
    console.log("🔌 Desvinculando…");
    if (local.status === "conectado") await sock.logout().catch(() => {});
    else {
      // Sin sesión abierta no hay nada que cerrar en WhatsApp: se borra la local y se pide un QR nuevo.
      rmSync(AUTH_DIR, { recursive: true, force: true });
      sock.end(undefined);
    }
  } else {
    console.log("🔄 Reiniciando la conexión…");
    sock.end(undefined);
  }
}

/** Le cuenta a la pantalla con qué configuración corre el conector (sin secretos). */
export async function reportInfo() {
  if (!DB_OK) return;
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
  let ai = { ok: false, detail: "Falta ANTHROPIC_API_KEY en .env.local." };
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const m = await new Anthropic({ maxRetries: 0 }).models.retrieve(model);
      ai = { ok: true, detail: `Clave válida · ${m.display_name ?? model} disponible.` };
    } catch (err) {
      const status = (err as { status?: number }).status;
      ai = {
        ok: false,
        detail: status === 401 || status === 403 ? "La clave de Anthropic no es válida." : status === 404 ? `El modelo ${model} no está disponible para la cuenta.` : `No se pudo verificar la IA: ${(err as Error).message.slice(0, 120)}`,
      };
    }
  }
  const info = {
    model,
    effort: process.env.ANTHROPIC_EFFORT?.trim() || "medium",
    allowedCount: getAllowedNumbers().size,
    ai,
    startedAt: new Date().toISOString(),
  };
  local.info = info;
  console.log(`IA: ${ai.detail} · ${info.allowedCount} número(s) autorizado(s).`);
  await prisma.whatsAppSession
    .upsert({ where: { id: SESSION_ID }, create: { id: SESSION_ID, status: "conectando", info, heartbeatAt: new Date() }, update: { info } })
    .catch(() => {});
}

async function shutdown() {
  stopping = true;
  console.log("\nDeteniendo el conector…");
  await setSession({ status: "desconectado", qr: null, lastError: "El conector está detenido." });
  sock?.end(undefined);
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}

async function main() {
  console.log("ObrasFlow — conector de WhatsApp (Baileys). Ctrl+C para detenerlo.");
  const url = await startLocalPanel({ local, runCommand, reportInfo, dbConfigured: DB_OK });
  console.log(`🖥️  Configuración y QR en esta PC: ${url}`);
  if (!DB_OK) {
    local.status = "falta_base";
    console.log("⚙️  Falta la base de datos: cargá su URL en la página de arriba (el conector se reinicia solo al guardarla).");
    return;
  }
  await reportInfo();
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  setInterval(heartbeat, 15_000);
  await connect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
