import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth/server";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/**
 * Cambios de un usuario:
 *  { activo: boolean } — activar/desactivar (no a uno mismo, ni dejar la app sin nadie activo)
 *  { nombre }          — cambiar el nombre que se ve
 *  { contrasenaActual, contrasenaNueva } — cambiar la propia contraseña
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const s = await getSession();
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  const data: { active?: boolean; name?: string; passwordHash?: string } = {};

  if (typeof b.activo === "boolean") {
    if (!b.activo && s?.uid === user.id) return NextResponse.json({ error: "No podés desactivarte a vos mismo." }, { status: 400 });
    if (!b.activo && (await prisma.user.count({ where: { active: true, id: { not: user.id } } })) === 0) {
      return NextResponse.json({ error: "Tiene que quedar al menos un usuario activo." }, { status: 400 });
    }
    data.active = b.activo;
  }
  if (typeof b.nombre === "string") {
    const n = b.nombre.trim().slice(0, 80);
    if (!n) return NextResponse.json({ error: "El nombre no puede quedar vacío." }, { status: 400 });
    data.name = n;
  }
  if (typeof b.contrasenaNueva === "string") {
    if (s?.uid !== user.id) return NextResponse.json({ error: "Cada uno cambia su propia contraseña." }, { status: 403 });
    if (!(await verifyPassword(String(b.contrasenaActual ?? ""), user.passwordHash))) {
      return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 400 });
    }
    const problem = passwordProblem(b.contrasenaNueva);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    data.passwordHash = await hashPassword(b.contrasenaNueva);
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "No hay nada para cambiar." }, { status: 400 });
  await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json({ ok: true });
}
