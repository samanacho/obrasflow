import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, hashToken, normalizeUsername, passwordProblem } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/server";
import { newSession } from "@/lib/auth/token";

export const dynamic = "force-dynamic";

const INVALIDO = "Este link ya se usó o venció. Pedí uno nuevo.";

async function findValid(token: string) {
  if (!token || token.length > 200) return null;
  const inv = await prisma.userInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date()) return null;
  return inv;
}

/** Usuario activo al que el link le restablece la contraseña (null si el link es para un usuario nuevo o ese usuario ya no sirve). */
async function userToReset(userId: string | null) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user?.active ? user : null;
}

/** ¿El link sirve? → nombre sugerido, o el usuario si es para restablecer la contraseña. */
export async function GET(req: NextRequest) {
  const inv = await findValid(req.nextUrl.searchParams.get("token") ?? "");
  if (!inv) return NextResponse.json({ error: INVALIDO }, { status: 404 });
  if (inv.userId) {
    const user = await userToReset(inv.userId);
    if (!user) return NextResponse.json({ error: INVALIDO }, { status: 404 });
    return NextResponse.json({ nombre: user.name, restablecer: { usuario: user.username } });
  }
  return NextResponse.json({ nombre: inv.name, usuarioSugerido: normalizeUsername(inv.name.split(" ")[0] ?? "") });
}

/**
 * Usa el link y deja la sesión iniciada.
 *  • Usuario nuevo — body: { token, nombre, usuario, contrasena }
 *  • Restablecer contraseña — body: { token, contrasena }
 */
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const token = String(b.token ?? "");
  const password = String(b.contrasena ?? "");
  const inv = await findValid(token);

  if (inv?.userId) {
    const problem = passwordProblem(password);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const target = await userToReset(inv.userId);
    if (!target) return NextResponse.json({ error: INVALIDO }, { status: 404 });
    const passwordHash = await hashPassword(password);
    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        const claimed = await tx.userInvitation.updateMany({ where: { id: inv.id, usedAt: null }, data: { usedAt: new Date() } });
        if (claimed.count !== 1) throw new Error("usada");
        return tx.user.update({ where: { id: target.id }, data: { passwordHash, lastLoginAt: new Date() } });
      });
    } catch {
      return NextResponse.json({ error: "Este link ya se usó. Pedí uno nuevo." }, { status: 409 });
    }
    const res = NextResponse.json({ ok: true, nombre: user.name, usuario: user.username }, { status: 201 });
    await setSessionCookie(res, newSession(user, true), true);
    return res;
  }

  const name = String(b.nombre ?? "").trim().slice(0, 80);
  const username = normalizeUsername(String(b.usuario ?? ""));
  if (!name) return NextResponse.json({ error: "Escribí tu nombre." }, { status: 400 });
  if (username.length < 3) return NextResponse.json({ error: "El usuario tiene que tener al menos 3 letras o números." }, { status: 400 });
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  if (!inv) return NextResponse.json({ error: INVALIDO }, { status: 404 });
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
  } catch {
    return NextResponse.json({ error: "Este link de invitación ya se usó. Pedí uno nuevo." }, { status: 409 });
  }
  const res = NextResponse.json({ ok: true, nombre: user.name, usuario: user.username }, { status: 201 });
  await setSessionCookie(res, newSession(user, true), true);
  return res;
}
