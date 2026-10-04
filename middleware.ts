import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, nowS, readSession } from "@/lib/auth/token";

// Login: toda la app pide haber ingresado (pantalla /ingresar), salvo:
//  • las rutas que usan otros sistemas con su propia clave o firma (Memby,
//    backup diario, webhook de WhatsApp, webhook de Residente de Obra);
//  • las páginas legales que pide Meta y la propia pantalla de ingreso;
//  • la app local (server/local-server.mjs, solo 127.0.0.1).
// Ver lib/auth/token.ts.

const PUBLIC: RegExp[] = [
  /^\/ingresar(\/|$)/,
  /^\/api\/auth\//,
  /^\/privacidad\/?$/,
  /^\/terminos\/?$/,
  /^\/api\/memby\//, // clave del conector (lib/memby/auth.ts)
  /^\/api\/backup\/?$/, // CRON_SECRET
  /^\/api\/whatsapp\/webhook\/?$/, // firma de Meta
  /^\/api\/integraciones\/residente-de-obra\/webhook\/?$/, // firma HMAC
];

export async function middleware(req: NextRequest) {
  if (process.env.OBRASFLOW_LOCAL === "1" && !process.env.VERCEL) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  const s = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  const now = nowS();
  if (s && s.exp > now) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");
  // Vencida pero renovable ("Recordarme"): /api/auth/renovar revisa que el usuario siga activo.
  if (s && s.rexp > now && !isApi) {
    const url = req.nextUrl.clone();
    url.pathname = "/api/auth/renovar";
    url.search = `?volver=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (isApi) {
    return NextResponse.json({ error: "Tu sesión terminó. Volvé a ingresar.", sesion: s && s.rexp > now ? "renovar" : "ingresar" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/ingresar";
  url.search = pathname === "/" ? "" : `?volver=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Todo menos los archivos estáticos de Next y de /public.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|json|webmanifest|woff2?|css|js|map)$).*)"],
};
