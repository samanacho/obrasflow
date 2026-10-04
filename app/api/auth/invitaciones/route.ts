import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkConnectorKey } from "@/lib/memby/auth";
import { newInvitationToken } from "@/lib/auth/password";
import { getSession, isLocalApp } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Crea un link de invitación (un solo uso, vence en 48 h). Lo puede pedir:
 *  • alguien que ya ingresó (pantalla Usuarios), o
 *  • la PC del dueño con la clave del conector de Memby — así se crea el
 *    PRIMER usuario (scripts/invitar-usuario.mjs), cuando todavía no hay nadie.
 * Body: { nombre }
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
  const b = (await req.json().catch(() => ({}))) as { nombre?: string };
  const name = String(b.nombre ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "Escribí el nombre de la persona." }, { status: 400 });
  const { token, hash } = newInvitationToken();
  const inv = await prisma.userInvitation.create({ data: { tokenHash: hash, name, createdBy, expiresAt: new Date(Date.now() + TTL_MS) } });
  const link = `${req.nextUrl.origin}/ingresar/invitacion/${token}`;
  return NextResponse.json({ link, vence: inv.expiresAt.toISOString(), nombre: name }, { status: 201 });
}
