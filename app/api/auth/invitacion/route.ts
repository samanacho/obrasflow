import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, hashToken, normalizeUsername, passwordProblem } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/server";
import { newSession } from "@/lib/auth/token";

export const dynamic = "force-dynamic";

async function findValid(token: string) {
  if (!token || token.length > 200) return null;
  const inv = await prisma.userInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date()) return null;
  return inv;
}

/** ¿El link de invitación sirve? → nombre sugerido. */
export async function GET(req: NextRequest) {
  const inv = await findValid(req.nextUrl.searchParams.get("token") ?? "");
  if (!inv) return NextResponse.json({ error: "Este link de invitación ya se usó o venció. Pedí uno nuevo." }, { status: 404 });
  return NextResponse.json({ nombre: inv.name, usuarioSugerido: normalizeUsername(inv.name.split(" ")[0] ?? "") });
}

/** Crea el usuario con la invitación y deja la sesión iniciada. Body: { token, nombre, usuario, contrasena } */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const token = String(b.token ?? "");
  const name = String(b.nombre ?? "").trim().slice(0, 80);
  const username = normalizeUsername(String(b.usuario ?? ""));
  const password = String(b.contrasena ?? "");
  if (!name) return NextResponse.json({ error: "Escribí tu nombre." }, { status: 400 });
  if (username.length < 3) return NextResponse.json({ error: "El usuario tiene que tener al menos 3 letras o números." }, { status: 400 });
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const inv = await findValid(token);
  if (!inv) return NextResponse.json({ error: "Este link de invitación ya se usó o venció. Pedí uno nuevo." }, { status: 404 });
  if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
    return NextResponse.json({ error: `El usuario "${username}" ya existe. Elegí otro.` }, { status: 409 });
  }
  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      // El link es de un solo uso: si dos personas lo usan a la vez, solo una crea el usuario.
      const claimed = await tx.userInvitation.updateMany({ where: { id: inv.id, usedAt: null }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new Error("usada");
      return tx.user.create({ data: { username, name, passwordHash, lastLoginAt: new Date() } });
    });
  } catch (err) {
    // Otra persona eligió el mismo usuario justo ahora: la transacción se deshizo y el link sigue sirviendo.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: `El usuario "${username}" ya existe. Elegí otro.` }, { status: 409 });
    }
    return NextResponse.json({ error: "Este link de invitación ya se usó. Pedí uno nuevo." }, { status: 409 });
  }
  const res = NextResponse.json({ ok: true, nombre: user.name, usuario: user.username }, { status: 201 });
  await setSessionCookie(res, newSession(user, true), true);
  return res;
}
