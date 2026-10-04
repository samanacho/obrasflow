import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DUMMY_HASH, normalizeUsername, verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/server";
import { newSession } from "@/lib/auth/token";

export const dynamic = "force-dynamic";

/** Intentos fallidos recientes por usuario+IP (en memoria: frena el "probar contraseñas" sin base extra). */
const fails = new Map<string, { n: number; until: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 60_000;

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { usuario?: string; contrasena?: string; recordar?: boolean };
  const username = normalizeUsername(String(b.usuario ?? ""));
  const password = String(b.contrasena ?? "");
  if (!username || !password) return NextResponse.json({ error: "Escribí tu usuario y tu contraseña." }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const k = `${username}|${ip}`;
  const f = fails.get(k);
  if (f && f.n >= MAX_FAILS && f.until > Date.now()) {
    return NextResponse.json({ error: "Demasiados intentos. Esperá un minuto y probá de nuevo." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { username } });
  // Con usuario inexistente igual se calcula un hash: misma demora, no se delata qué usuarios existen.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: 0 };
    fails.set(k, { n: cur.n + 1, until: Date.now() + LOCK_MS });
    if (fails.size > 1000) fails.delete(fails.keys().next().value!);
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: user && ok && !user.active ? "Ese usuario está desactivado." : "Usuario o contraseña incorrectos." }, { status: 401 });
  }
  fails.delete(k);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const remember = Boolean(b.recordar);
  const res = NextResponse.json({ ok: true, nombre: user.name });
  await setSessionCookie(res, newSession(user, remember), remember);
  return res;
}
