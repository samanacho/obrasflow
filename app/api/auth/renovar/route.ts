import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie, isLocalApp, setSessionCookie } from "@/lib/auth/server";
import { SESSION_COOKIE, newSession, nowS, readSession, safeReturnPath } from "@/lib/auth/token";

export const dynamic = "force-dynamic";

/**
 * Renueva la sesión si el usuario sigue activo y no pasó el plazo de
 * "Recordarme". Así, desactivar a alguien le corta el acceso en pocas horas.
 */
async function renew(req: NextRequest): Promise<{ ok: true; s: ReturnType<typeof newSession>; persistent: boolean } | { ok: false }> {
  const s = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!s || s.rexp <= nowS()) return { ok: false };
  const user = await prisma.user.findUnique({ where: { id: s.uid }, select: { id: true, name: true, active: true } });
  if (!user?.active) return { ok: false };
  const persistent = s.rexp > s.exp;
  return { ok: true, s: newSession(user, persistent, persistent ? s.rexp : undefined), persistent };
}

/** Desde el middleware: renueva y vuelve a la página pedida (o manda a /ingresar). */
export async function GET(req: NextRequest) {
  const volver = safeReturnPath(req.nextUrl.searchParams.get("volver"));
  const r = await renew(req);
  if (!r.ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/ingresar";
    url.search = volver === "/" ? "" : `?volver=${encodeURIComponent(volver)}`;
    const res = NextResponse.redirect(url);
    clearSessionCookie(res);
    return res;
  }
  const url = new URL(volver, req.nextUrl.origin);
  const res = NextResponse.redirect(url);
  await setSessionCookie(res, r.s, r.persistent);
  return res;
}

/** Desde la app abierta (cada tanto): mantiene viva la sesión mientras se usa. */
export async function POST(req: NextRequest) {
  if (isLocalApp()) return NextResponse.json({ ok: true, local: true });
  const r = await renew(req);
  if (!r.ok) {
    const res = NextResponse.json({ error: "Tu sesión terminó. Volvé a ingresar." }, { status: 401 });
    clearSessionCookie(res);
    return res;
  }
  const res = NextResponse.json({ ok: true, nombre: r.s.n });
  await setSessionCookie(res, r.s, r.persistent);
  return res;
}
