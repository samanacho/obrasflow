import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkConnectorKey } from "@/lib/memby/auth";
import { newInvitationToken, normalizeUsername } from "@/lib/auth/password";
import { getSession, isLocalApp } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Crea un link de invitación (un solo uso, vence en 48 h). Lo puede pedir:
 *  • alguien que ya ingresó (pantalla Usuarios), o
 *  • la PC del dueño con la clave del conector de Memby — así se crea el
 *    PRIMER usuario (scripts/invitar-usuario.mjs), cuando todavía no hay nadie.
 * Body: { nombre } para un usuario nuevo, o { usuario } para restablecerle la
 * contraseña a uno que ya existe (se la olvidó).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  let createdBy = session?.n ?? null;
  if (!createdBy && isLocalApp()) createdBy = "PC local";
  if (!createdBy) {
    const denied = checkConnectorKey(req);
    if (denied) return NextResponse.json({ error: "Tenés que ingresar para invitar a alguien." }, { status: 401 });
    createdBy = "Clave del conector";
  }
  const b = (await req.json().catch(() => ({}))) as { nombre?: string; usuario?: string };

  let name = String(b.nombre ?? "").trim().slice(0, 80);
  let userId: string | null = null;
  if (b.usuario !== undefined) {
    const user = await prisma.user.findUnique({ where: { username: normalizeUsername(String(b.usuario)) } });
    if (!user) return NextResponse.json({ error: "Ese usuario no existe." }, { status: 404 });
    if (!user.active) return NextResponse.json({ error: "Ese usuario está desactivado. Activalo primero." }, { status: 400 });
    name = user.name;
    userId = user.id;
  }
  if (!name) return NextResponse.json({ error: "Escribí el nombre de la persona." }, { status: 400 });

  const { token, hash } = newInvitationToken();
  const inv = await prisma.$transaction(async (tx) => {
    // Un link de contraseña nueva por persona: el anterior que no se usó deja de servir.
    if (userId) await tx.userInvitation.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    return tx.userInvitation.create({ data: { tokenHash: hash, name, createdBy, userId, expiresAt: new Date(Date.now() + TTL_MS) } });
  });
  const link = `${req.nextUrl.origin}/ingresar/invitacion/${token}`;
  return NextResponse.json({ link, vence: inv.expiresAt.toISOString(), nombre: name, restablecer: Boolean(userId) }, { status: 201 });
}
