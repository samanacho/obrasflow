import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Usuarios (sin contraseñas) e invitaciones pendientes. */
export async function GET() {
  const [users, invitations, s] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, username: true, name: true, active: true, lastLoginAt: true, createdAt: true } }),
    prisma.userInvitation.findMany({ where: { usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, createdBy: true, expiresAt: true } }),
    getSession(),
  ]);
  return NextResponse.json({
    yo: s?.uid ?? null,
    usuarios: users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() })),
    invitaciones: invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() })),
  });
}
