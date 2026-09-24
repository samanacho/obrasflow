import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifica la cabecera `X-Hub-Signature-256` que Meta manda en cada POST del
 * webhook: "sha256=" + HMAC-SHA256(cuerpo crudo, App Secret) en hex. Tiene
 * que calcularse sobre el cuerpo CRUDO exacto (antes de parsear el JSON);
 * sin esto, cualquiera que conozca la URL podría inyectar mensajes falsos.
 */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const received = header.slice("sha256=".length).trim();
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  // Comparación en tiempo constante (evita ataques de timing).
  return timingSafeEqual(Buffer.from(received.toLowerCase(), "hex"), Buffer.from(expected, "hex"));
}
