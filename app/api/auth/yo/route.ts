import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isLocalApp } from "@/lib/auth/server";
import { usuarioVePersonal } from "@/lib/auth/personalServer";

export const dynamic = "force-dynamic";

/**
 * Quién ingresó (para la barra de arriba). En la app local: sin login.
 * verPersonal: si mostrarle "Personal" en el menú. Solo esconde el enlace; el
 * permiso de verdad lo controla app/personal/page.tsx.
 */
export async function GET() {
  if (isLocalApp()) return NextResponse.json({ local: true, nombre: "PC local", usuario: null, verPersonal: true });
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const u = await prisma.user.findUnique({ where: { id: s.uid }, select: { id: true, name: true, username: true, active: true } });
  if (!u?.active) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  return NextResponse.json({ local: false, nombre: u.name, usuario: u.username, verPersonal: await usuarioVePersonal(u) });
}
