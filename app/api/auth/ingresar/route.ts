import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DUMMY_HASH, normalizeUsername, verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/server";
import { newSession } from "@/lib/auth/token";

export const dynamic = "force-dynamic";

/**
 * Freno de "probar contraseñas": por USUARIO (no por IP) y guardado en la base
 * (model LoginAttempt), así no se esquiva cambiando de IP ni cayendo en otra
 * instancia de Vercel. 8 fallos en 15 minutos bloquean ese usuario hasta que
 * el más viejo de esos 8 salga de la ventana.
 */
const MAX_FAILS = 8;
const WINDOW_MS = 15 * 60_000;
const KEEP_MS = 24 * 60 * 60_000;

/** Respaldo en memoria por usuario+IP, solo si la tabla LoginAttempt todavía no existe (deploy viejo). */
const fails = new Map<string, { n: number; until: number }>();
const MEM_MAX_FAILS = 5;
const MEM_LOCK_MS = 60_000;

/** Milisegundos que le faltan al bloqueo (0 = puede intentar); null si la base no respondió. */
async function dbWaitMs(username: string): Promise<number | null> {
  try {
    const recent = await prisma.loginAttempt.findMany({
      where: { username, createdAt: { gt: new Date(Date.now() - WINDOW_MS) } },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: MAX_FAILS,
    });
    if (recent.length < MAX_FAILS) return 0;
    return Math.max(0, recent[MAX_FAILS - 1].createdAt.getTime() + WINDOW_MS - Date.now());
  } catch (err) {
    console.error("Freno de ingreso: no se pudo leer LoginAttempt, se usa el de memoria.", err);
    return null;
  }
}

async function dbRecordFail(username: string, ip: string): Promise<boolean> {
  try {
    await prisma.loginAttempt.create({ data: { username, ip } });
    await prisma.loginAttempt.deleteMany({ where: { username, createdAt: { lt: new Date(Date.now() - KEEP_MS) } } });
    return true;
  } catch (err) {
    console.error("Freno de ingreso: no se pudo anotar el intento fallido.", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { usuario?: string; contrasena?: string; recordar?: boolean };
  const username = normalizeUsername(String(b.usuario ?? ""));
  const password = String(b.contrasena ?? "");
  if (!username || !password) return NextResponse.json({ error: "Escribí tu usuario y tu contraseña." }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const k = `${username}|${ip}`;
  const f = fails.get(k);

  // Se frena igual exista o no el usuario: la respuesta no delata cuáles existen.
  const wait = await dbWaitMs(username);
  if (wait !== null && wait > 0) {
    const min = Math.ceil(wait / 60_000);
    return NextResponse.json(
      { error: `Demasiados intentos con este usuario. Esperá ${min === 1 ? "1 minuto" : `${min} minutos`} y probá de nuevo.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(wait / 1000)) } }
    );
  }
  if (wait === null && f && f.n >= MEM_MAX_FAILS && f.until > Date.now()) {
    return NextResponse.json({ error: "Demasiados intentos. Esperá un minuto y probá de nuevo." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  // Con usuario inexistente igual se calcula un hash: misma demora, no se delata qué usuarios existen.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    if (wait === null || !(await dbRecordFail(username, ip))) {
      const cur = f && f.until > Date.now() ? f : { n: 0, until: 0 };
      fails.set(k, { n: cur.n + 1, until: Date.now() + MEM_LOCK_MS });
      if (fails.size > 1000) fails.delete(fails.keys().next().value!);
    }
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: user && ok && !user.active ? "Ese usuario está desactivado." : "Usuario o contraseña incorrectos." }, { status: 401 });
  }
  fails.delete(k);
  // Entró bien: se olvidan sus fallos (si la tabla no existe todavía, no importa).
  await prisma.loginAttempt.deleteMany({ where: { username } }).catch(() => {});
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const remember = Boolean(b.recordar);
  const res = NextResponse.json({ ok: true, nombre: user.name });
  await setSessionCookie(res, newSession(user, remember), remember);
  return res;
}
