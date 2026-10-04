import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isLocalApp } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Quién ingresó (para la barra de arriba). En la app local: sin login. */
export async function GET() {
  if (isLocalApp()) return NextResponse.json({ local: true, nombre: "PC local", usuario: null });
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const u = await prisma.user.findUnique({ where: { id: s.uid }, select: { name: true, username: true, active: true } });
  if (!u?.active) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  return NextResponse.json({ local: false, nombre: u.name, usuario: u.username });
}
