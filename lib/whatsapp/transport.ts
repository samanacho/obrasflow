import type { InboundMessage } from "./parse";
import type { WhatsAppConfig } from "./config";
import { sendText, sendConfirmButtons, markAsRead, downloadMedia } from "./client";

// Canal por el que el agente recibe y contesta. El agente (handle.ts) no sabe
// si del otro lado está la API oficial de Meta (webhook en Vercel) o la
// conexión por QR con Baileys (worker/whatsapp-baileys.mts, en una PC).

export type MediaMessage = Extract<InboundMessage, { kind: "media" }>;
export type DownloadResult = { data: Buffer; mimeType: string } | { tooLarge: true; size: number };

export interface Transport {
  kind: "cloud" | "baileys";
  /** true si la tarjeta de la propuesta lleva botones Confirmar/Cancelar; si no, se confirma con un código. */
  buttons: boolean;
  sendText(to: string, text: string): Promise<string | null>;
  /** Tarjeta de la propuesta: con botones, o con el código para confirmar por texto. */
  sendProposal(to: string, body: string, actionId: string, code: string): Promise<string | null>;
  markRead(msg: InboundMessage, typing: boolean): Promise<void>;
  downloadMedia(msg: MediaMessage, maxBytes: number): Promise<DownloadResult>;
}

/** Texto que se agrega a la tarjeta cuando el canal no tiene botones. */
export function codeInstructions(code: string) {
  return `¿Lo registro? Respondé *Sí* o *No*\n(o *OK ${code}* / *NO ${code}* si respondés más tarde)`;
}

export function cloudTransport(cfg: WhatsAppConfig): Transport {
  return {
    kind: "cloud",
    buttons: true,
    sendText: (to, text) => sendText(cfg, to, text),
    sendProposal: (to, body, actionId) => sendConfirmButtons(cfg, to, body, actionId),
    markRead: (msg, typing) => markAsRead(cfg, msg.waMessageId, typing),
    downloadMedia: (msg, maxBytes) => downloadMedia(cfg, msg.waMediaId, maxBytes),
  };
}
