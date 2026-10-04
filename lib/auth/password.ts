import { randomBytes, scrypt, timingSafeEqual, createHash } from "crypto";

// Contraseñas con scrypt (incluido en Node, sin dependencias). Se guarda
// "salt:hash" en hex. Servidor únicamente.

const KEYLEN = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, KEYLEN, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Hash para comparar contra un usuario inexistente (mismo tiempo de respuesta). */
export const DUMMY_HASH = "00000000000000000000000000000000:" + "0".repeat(KEYLEN * 2);

/** Reglas mínimas: 8 caracteres o más. Devuelve el problema o null. */
export function passwordProblem(p: string): string | null {
  if (p.length < 8) return "La contraseña tiene que tener al menos 8 caracteres.";
  if (p.length > 200) return "La contraseña es demasiado larga.";
  return null;
}

/** "Ignacio Samaniego" → "ignacio"; solo letras, números, punto y guion. */
export function normalizeUsername(u: string): string {
  return u
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]/g, "");
}

export function newInvitationToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
