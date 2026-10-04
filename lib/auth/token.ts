// Sesión de ObrasFlow: una cookie firmada con HMAC-SHA256. Sirve igual en el
// middleware (Edge, sin base de datos) y en el servidor (Node): solo usa Web
// Crypto. No guarda nada secreto adentro: id y nombre del usuario y vencimientos.
//
//  exp  = hasta cuándo vale tal cual (12 h). Pasado eso, el middleware manda a
//         /api/auth/renovar, que mira en la base que el usuario siga activo y
//         emite una nueva: así desactivar a alguien le corta el acceso en horas.
//  rexp = hasta cuándo se puede renovar sin volver a escribir la contraseña
//         (30 días con "Recordarme"; si no, igual a exp).
//
// Clave: AUTH_SECRET si está; si no, se deriva de la URL de la base (que ya es
// secreta y existe en Vercel y en la PC). Cambiar AUTH_SECRET cierra todas las
// sesiones abiertas.

export const SESSION_COOKIE = "of_sesion";
export const SESSION_TTL_S = 12 * 60 * 60;
export const REMEMBER_TTL_S = 30 * 24 * 60 * 60;

export interface Session {
  /** id del User */
  uid: string;
  /** Nombre para mostrar (y para el historial de cambios). */
  n: string;
  /** Vence (segundos epoch). */
  exp: number;
  /** Se puede renovar hasta (segundos epoch). */
  rexp: number;
}

const enc = new TextEncoder();

function secretMaterial(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    ""
  );
}

let cached: { material: string; key: Promise<CryptoKey> } | null = null;
function hmacKey(): Promise<CryptoKey> {
  const material = secretMaterial();
  if (!material) throw new Error("Falta AUTH_SECRET (o la URL de la base) para firmar las sesiones.");
  if (!cached || cached.material !== material) {
    const key = crypto.subtle
      .digest("SHA-256", enc.encode(`obrasflow-sesion|${material}`))
      .then((raw) => crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));
    cached = { material, key };
  }
  return cached.key;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export const nowS = () => Math.floor(Date.now() / 1000);

export async function signSession(s: Session): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(s)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/**
 * Firma válida → la sesión (aunque esté vencida: mirá `exp`/`rexp`).
 * Firma inválida o token roto → null.
 */
export async function readSession(token: string | null | undefined): Promise<Session | null> {
  if (!token || token.length > 2000) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64url(sig) as BufferSource, enc.encode(body));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    if (typeof s.uid !== "string" || typeof s.exp !== "number" || typeof s.rexp !== "number") return null;
    return s;
  } catch {
    return null;
  }
}

export function newSession(user: { id: string; name: string }, remember: boolean, rexp?: number): Session {
  const now = nowS();
  const exp = now + SESSION_TTL_S;
  return { uid: user.id, n: user.name, exp, rexp: rexp ?? (remember ? now + REMEMBER_TTL_S : exp) };
}

/** Solo rutas internas ("/compras?x=1"), nunca "//otro-sitio" ni URLs completas. */
export function safeReturnPath(p: string | null | undefined): string {
  if (!p || !p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\")) return "/";
  return p;
}
