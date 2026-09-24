// Traduce el payload del webhook de WhatsApp Cloud API a una forma interna
// simple. Si algún día se cambia de proveedor (Evolution API, Twilio, etc.),
// se reescribe solo este archivo y lib/whatsapp/client.ts — el resto del
// agente trabaja con InboundMessage.

export type InboundMessage =
  | { kind: "text"; waMessageId: string; from: string; timestamp: number; text: string }
  | {
      kind: "media";
      waMessageId: string;
      from: string;
      timestamp: number;
      mediaType: "image" | "document";
      waMediaId: string;
      mimeType: string;
      filename: string | null;
      caption: string | null;
    }
  | { kind: "button"; waMessageId: string; from: string; timestamp: number; buttonId: string; title: string }
  | { kind: "unsupported"; waMessageId: string; from: string; timestamp: number; type: string };

/** Tipos que no son un mensaje para contestar: reacciones (👍), avisos del sistema, etc. */
const IGNORED_TYPES = new Set(["reaction", "system", "request_welcome", "ephemeral"]);

/**
 * Extrae los mensajes entrantes de un POST del webhook. Ignora los
 * "statuses" (enviado/entregado/leído) y, si se pasa `phoneNumberId`, lo que
 * le escribieron a OTRO número de la misma cuenta de WhatsApp Business.
 */
export function parseWebhookPayload(body: any, phoneNumberId?: string): InboundMessage[] {
  const out: InboundMessage[] = [];
  if (!body || body.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) return out;

  for (const entry of body.entry) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "messages") continue;
      const to = change?.value?.metadata?.phone_number_id;
      if (phoneNumberId && to && String(to) !== phoneNumberId) continue;
      for (const m of change?.value?.messages ?? []) {
        const base = {
          waMessageId: String(m?.id ?? ""),
          from: String(m?.from ?? ""),
          timestamp: Number(m?.timestamp ?? 0),
        };
        if (!base.waMessageId) continue;
        if (!base.from) {
          // Usuarios con "nombre de usuario" de WhatsApp pueden llegar sin
          // teléfono (solo con su BSUID) — ver docs/WHATSAPP_AGENT.md.
          console.warn("WhatsApp: mensaje sin número de teléfono (solo BSUID) ignorado");
          continue;
        }
        if (IGNORED_TYPES.has(String(m.type))) continue;

        switch (m.type) {
          case "text":
            out.push({ ...base, kind: "text", text: String(m.text?.body ?? "") });
            break;
          case "image":
            out.push({
              ...base,
              kind: "media",
              mediaType: "image",
              waMediaId: String(m.image?.id ?? ""),
              mimeType: String(m.image?.mime_type ?? "image/jpeg"),
              filename: null,
              caption: m.image?.caption ? String(m.image.caption) : null,
            });
            break;
          case "document":
            out.push({
              ...base,
              kind: "media",
              mediaType: "document",
              waMediaId: String(m.document?.id ?? ""),
              mimeType: String(m.document?.mime_type ?? "application/octet-stream"),
              filename: m.document?.filename ? String(m.document.filename) : null,
              caption: m.document?.caption ? String(m.document.caption) : null,
            });
            break;
          case "interactive":
            // Respuesta a los botones "Confirmar"/"Cancelar" (ver client.sendConfirmButtons).
            if (m.interactive?.type === "button_reply") {
              out.push({
                ...base,
                kind: "button",
                buttonId: String(m.interactive.button_reply?.id ?? ""),
                title: String(m.interactive.button_reply?.title ?? ""),
              });
            } else {
              out.push({ ...base, kind: "unsupported", type: `interactive:${m.interactive?.type ?? "?"}` });
            }
            break;
          default:
            // audio (notas de voz), video, sticker, location, contacts, etc.
            out.push({ ...base, kind: "unsupported", type: String(m.type ?? "unknown") });
        }
      }
    }
  }
  return out;
}
