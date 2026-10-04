import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { APP_SOURCE } from "../history";
import { SESSION_COOKIE, nowS, readSession, signSession, type Session } from "./token";

// Sesión del lado del servidor (rutas de la API y páginas). Servidor únicamente.

/** App local (server/local-server.mjs, solo 127.0.0.1): no pide login. */
export function isLocalApp(): boolean {
  return process.env.OBRASFLOW_LOCAL === "1" && !process.env.VERCEL;
}

/** Sesión vigente del pedido actual, o null. */
export async function getSession(): Promise<Session | null> {
  if (isLocalApp()) return null;
  const s = await readSession(cookies().get(SESSION_COOKIE)?.value);
  return s && s.exp > nowS() ? s : null;
}

/**
 * Desde dónde/quién se hizo un cambio, para el historial: el nombre de quien
 * ingresó ("Ignacio") o "Desde la app" (app local, sin login).
 */
export async function appSource(): Promise<string> {
  const s = await getSession();
  return s?.n || APP_SOURCE;
}

export async function setSessionCookie(res: NextResponse, s: Session, persistent: boolean) {
  res.cookies.set(SESSION_COOKIE, await signSession(s), {
    httpOnly: true,
    secure: !isLocalApp(),
    sameSite: "lax",
    path: "/",
    // Sin "Recordarme", cookie de sesión: se borra al cerrar el navegador.
    ...(persistent ? { maxAge: Math.max(0, s.rexp - nowS()) } : {}),
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: !isLocalApp(), sameSite: "lax", path: "/", maxAge: 0 });
}
