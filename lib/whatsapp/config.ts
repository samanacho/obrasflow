// Configuración del canal de WhatsApp (API oficial de WhatsApp Business /
// Cloud API de Meta). Todo sale de variables de entorno de Vercel — ver
// docs/WHATSAPP_AGENT.md. Nada de esto se loguea nunca.

export interface WhatsAppConfig {
  /** Token que se inventa uno y se pega igual en Meta, para el handshake GET del webhook. */
  verifyToken: string;
  /** "App Secret" de la app de Meta — firma cada POST del webhook (X-Hub-Signature-256). */
  appSecret: string;
  /** Token de acceso (idealmente de un System User, permanente) para llamar a la Graph API. */
  accessToken: string;
  /** Phone Number ID del número de WhatsApp Business que envía las respuestas. */
  phoneNumberId: string;
  graphVersion: string;
}

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!verifyToken || !appSecret || !accessToken || !phoneNumberId) return null;
  return {
    verifyToken,
    appSecret,
    accessToken,
    phoneNumberId,
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v23.0",
  };
}

/**
 * Formato en que WhatsApp manda `from`: solo dígitos, con código de país y
 * sin el 0 de larga distancia. "+595 (0)981 123-456" y "00595981123456" ->
 * "595981123456".
 */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("5950")) d = "595" + d.slice(4);
  return d;
}

/**
 * Números autorizados a hablar con el agente, con el nombre de cada uno:
 *   WHATSAPP_ALLOWED_NUMBERS="595981111111:Ignacio Samaniego,595982222222:Hugo Rotela"
 * Cualquier otro número se ignora sin responder (ni siquiera se le confirma
 * que el bot existe) — el agente puede leer montos y registrar pagos.
 */
export function getAllowedNumbers(): Map<string, string> {
  const map = new Map<string, string>();
  const raw = process.env.WHATSAPP_ALLOWED_NUMBERS ?? "";
  for (const entry of raw.split(",")) {
    const [phonePart, ...nameParts] = entry.split(":");
    const phone = normalizePhone(phonePart ?? "");
    if (!phone) continue;
    map.set(phone, nameParts.join(":").trim() || phone);
  }
  return map;
}

/** Nombre de la persona autorizada, o null si el número no está en la lista. */
export function authorizedUserName(phone: string): string | null {
  return getAllowedNumbers().get(normalizePhone(phone)) ?? null;
}
