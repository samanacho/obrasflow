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

/** Qué hacer ante los códigos de error de entrega más probables (docs de Meta: support/error-codes). */
const DELIVERY_HINTS: Record<string, string> = {
  "131042": "problema con el medio de pago de la cuenta de WhatsApp en Meta: revisá la tarjeta en WhatsApp Manager",
  "131047": "pasaron más de 24 h desde el último mensaje del usuario",
  "131056": "demasiados mensajes seguidos al mismo número",
  "133010": "el número no está registrado en Cloud API (falta el /register con el PIN)",
};

/**
 * Deja en los logs lo que el webhook trae además de mensajes y que el agente
 * no procesa, para poder diagnosticar sin exponer datos:
 * - mensajes dirigidos a OTRO phone_number_id (típico al pasar del número de
 *   prueba al real sin actualizar WHATSAPP_PHONE_NUMBER_ID);
 * - respuestas que Meta NO pudo entregar (statuses "failed");
 * - avisos de la cuenta (restricciones, desconexión, etc.).
 */
export function logWebhookEvents(body: any, phoneNumberId?: string): void {
  if (!body || body.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) return;
  for (const entry of body.entry) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      if (change?.field !== "messages") {
        const event = value?.event ?? value?.decision ?? "";
        console.warn(`WhatsApp: evento de cuenta "${String(change?.field)}"${event ? ` (${String(event)})` : ""}`);
        continue;
      }
      const to = value?.metadata?.phone_number_id ? String(value.metadata.phone_number_id) : "";
      const count = Array.isArray(value?.messages) ? value.messages.length : 0;
      if (phoneNumberId && to && to !== phoneNumberId && count) {
        console.warn(
          `WhatsApp: ${count} mensaje(s) para otro número (phone_number_id …${to.slice(-4)}), ignorados. Si es el número del agente, revisá WHATSAPP_PHONE_NUMBER_ID.`
        );
      }
      for (const s of value?.statuses ?? []) {
        if (s?.status !== "failed") continue;
        for (const e of s?.errors?.length ? s.errors : [{}]) {
          const code = String(e?.code ?? "?");
          const hint = DELIVERY_HINTS[code];
          console.warn(`WhatsApp: Meta no pudo entregar una respuesta (código ${code}: ${String(e?.title ?? "sin detalle")})${hint ? ` — ${hint}` : ""}`);
        }
      }
    }
  }
}

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
          const bsuid = String(m?.from_user_id ?? "");
          console.warn(`WhatsApp: mensaje sin número de teléfono (solo BSUID ${bsuid ? `${bsuid.slice(0, 5)}…${bsuid.slice(-3)}` : "?"}) ignorado`);
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
