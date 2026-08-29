import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeRecipeItem } from "@/lib/serialize";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/** params.id acá es el id del PoleRecipeItem (ítem de receta), no de la especificación. */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const cantidadPorPoste = Number(body.cantidadPorPoste);
    if (!Number.isFinite(cantidadPorPoste) || cantidadPorPoste <= 0) {
      return NextResponse.json({ error: "La cantidad por poste tiene que ser un número mayor a 0." }, { status: 400 });
    }

    const updated = await prisma.poleRecipeItem.update({
      where: { id: params.id },
      data: {
        cantidadPorPoste,
        notas: body.notas ? String(body.notas) : null,
      },
      include: { material: true },
    });
    return NextResponse.json(serializeRecipeItem(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Ítem de receta no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar el ítem de receta." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.poleRecipeItem.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Ítem de receta no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar el ítem de receta." }, { status: 500 });
  }
}
