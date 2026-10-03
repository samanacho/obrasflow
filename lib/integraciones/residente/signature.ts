import { createHmac, timingSafeEqual } from "crypto";

// Firma de los webhooks de Residente de Obra: HMAC-SHA256 del cuerpo CRUDO
// con el secreto compartido, en el header "X-Signature: sha256=<hex>".
// Es el formato que propusimos en docs/RESPUESTA_HANDOFF_RESIDENTE_DE_OBRA.md
// (igual al de WhatsApp Cloud API); si ellos definen otro, se cambia acá.

export const SIGNATURE_HEADER = "x-signature";

export function signBody(raw: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}

export function verifySignature(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(signBody(raw, secret));
  const got = Buffer.from(header.trim());
  return expected.length === got.length && timingSafeEqual(expected, got);
}
