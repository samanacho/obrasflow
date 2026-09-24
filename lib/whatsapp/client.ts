import type { WhatsAppConfig } from "./config";

// Llamadas salientes a la Graph API de Meta (WhatsApp Cloud API).

const MAX_TEXT = 4096; // límite de WhatsApp para un mensaje de texto
const MAX_BUTTON_BODY = 1024; // límite del cuerpo de un mensaje interactivo

function graphUrl(cfg: WhatsAppConfig, path: string) {
  return `https://graph.facebook.com/${cfg.graphVersion}/${path}`;
}

/** Recorta por caracteres reales (code points): nunca parte un emoji a la mitad. */
function clip(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : s;
}

/** Envía un mensaje y devuelve su wamid (o null si Meta no lo informa). */
async function postMessage(cfg: WhatsAppConfig, payload: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(graphUrl(cfg, `${cfg.phoneNumberId}/messages`), {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WhatsApp API ${res.status}: ${detail.slice(0, 500)}`);
  }
  const json = (await res.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
  return json?.messages?.[0]?.id ?? null;
}

export async function sendText(cfg: WhatsAppConfig, to: string, body: string): Promise<string | null> {
  return postMessage(cfg, { recipient_type: "individual", to, type: "text", text: { preview_url: false, body: clip(body, MAX_TEXT) } });
}

/**
 * Pide confirmación de una propuesta con dos botones. El id de cada botón
 * lleva el id de la propuesta ("confirm:<id>" / "cancel:<id>"), así la
 * respuesta se resuelve en código sin pasar por el modelo de IA.
 */
export async function sendConfirmButtons(cfg: WhatsAppConfig, to: string, body: string, actionId: string): Promise<string | null> {
  return postMessage(cfg, {
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: clip(body, MAX_BUTTON_BODY) },
      action: {
        buttons: [
          { type: "reply", reply: { id: `confirm:${actionId}`, title: "✅ Confirmar" } },
          { type: "reply", reply: { id: `cancel:${actionId}`, title: "❌ Cancelar" } },
        ],
      },
    },
  });
}

/** Marca el mensaje entrante como leído (tildes azules) — señal de que el agente lo recibió. */
export async function markAsRead(cfg: WhatsAppConfig, waMessageId: string): Promise<void> {
  await postMessage(cfg, { status: "read", message_id: waMessageId });
}

/**
 * Descarga un archivo recibido: primero se pide la URL temporal del media
 * id, y después el binario (la URL también exige el token). `maxBytes` corta
 * antes de bajar archivos enormes (WhatsApp acepta documentos de hasta 100 MB).
 */
export async function downloadMedia(
  cfg: WhatsAppConfig,
  waMediaId: string,
  maxBytes: number
): Promise<{ data: Buffer; mimeType: string } | { tooLarge: true; size: number }> {
  const metaRes = await fetch(graphUrl(cfg, waMediaId), { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
  if (!metaRes.ok) throw new Error(`WhatsApp media meta ${metaRes.status}`);
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number | string };
  if (!meta.url) throw new Error("WhatsApp media sin url");
  // Meta documenta file_size a veces como número y a veces como string.
  const declared = Number(meta.file_size);
  if (Number.isFinite(declared) && declared > maxBytes) return { tooLarge: true, size: declared };

  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.accessToken}` } });
  if (!binRes.ok) throw new Error(`WhatsApp media download ${binRes.status}`);
  const length = Number(binRes.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    await binRes.body?.cancel().catch(() => {});
    return { tooLarge: true, size: length };
  }

  // Lectura por partes: se corta apenas pasa el tope, sin bajar el resto.
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = binRes.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { tooLarge: true, size: total };
      }
      chunks.push(value);
    }
  }
  const data = Buffer.concat(chunks);
  return { data, mimeType: meta.mime_type || binRes.headers.get("content-type") || "application/octet-stream" };
}
