import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeSitio } from "@/lib/serialize";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const sitio = await prisma.sitio.findUnique({ where: { id: params.id }, include: { projects: true } });
  if (!sitio) return NextResponse.json({ error: "Sitio no encontrado." }, { status: 404 });
  return NextResponse.json(serializeSitio(sitio));
}

/** Edita nombre/responsable/notas del Sitio — no toca presupuesto/ejecutado (no existen como campos propios, ver comentario en el schema). */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const nombre = String(body.nombre ?? "").trim();
    const responsable = String(body.responsable ?? "").trim();
    if (!nombre) return NextResponse.json({ error: "El nombre del sitio es obligatorio." }, { status: 400 });
    if (!responsable) return NextResponse.json({ error: "El responsable es obligatorio." }, { status: 400 });
    const notas = String(body.notas ?? "").trim() || null;

    const updated = await prisma.sitio.update({
      where: { id: params.id },
      data: { nombre, responsable, notas },
      include: { projects: true },
    });
    return NextResponse.json(serializeSitio(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Sitio no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar el sitio." }, { status: 500 });
  }
}

/** Borra el Sitio — las obras que pertenecían quedan sueltas (sitioId -> null, onDelete: SetNull), nunca se borra ninguna obra ni movimiento. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.sitio.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Sitio no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar el sitio." }, { status: 500 });
  }
}
