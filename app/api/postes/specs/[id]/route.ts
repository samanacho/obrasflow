import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializePoleSpec, serializePoleSpecDetail } from "@/lib/serialize";
import { isForeignKeyRestrictError } from "@/lib/prismaErrors";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/** Detalle de una especificación con su receta completa (para la ficha /postes/specs/[id]). */
export async function GET(_req: NextRequest, { params }: Params) {
  const spec = await prisma.poleSpec.findUnique({
    where: { id: params.id },
    include: {
      lots: { select: { id: true } },
      recipeItems: { include: { material: true }, orderBy: { material: { nombre: "asc" } } },
    },
  });
  if (!spec) return NextResponse.json({ error: "Especificación no encontrada." }, { status: 404 });
  return NextResponse.json(serializePoleSpecDetail(spec));
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const nombre = String(body.nombre ?? "").trim();
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
    const longitud = Number(body.longitud);
    if (!Number.isFinite(longitud) || longitud <= 0) {
      return NextResponse.json({ error: "La longitud tiene que ser un número mayor a 0." }, { status: 400 });
    }
    const esfuerzoNominal = Number(body.esfuerzoNominal);
    if (!Number.isFinite(esfuerzoNominal) || esfuerzoNominal <= 0) {
      return NextResponse.json({ error: "El esfuerzo nominal tiene que ser un número mayor a 0." }, { status: 400 });
    }

    const updated = await prisma.poleSpec.update({
      where: { id: params.id },
      data: {
        nombre,
        longitud,
        esfuerzoNominal,
        diametroBase: body.diametroBase ? Number(body.diametroBase) : null,
        resistenciaHormigon: body.resistenciaHormigon ? String(body.resistenciaHormigon) : null,
        armadura: body.armadura ? String(body.armadura) : null,
        normaAnde: body.normaAnde ? String(body.normaAnde) : null,
        notas: body.notas ? String(body.notas) : null,
        activo: body.activo !== false,
      },
      include: { lots: { select: { id: true } }, recipeItems: { include: { material: true } } },
    });
    return NextResponse.json(serializePoleSpec(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Especificación no encontrada." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar la especificación." }, { status: 500 });
  }
}

// specId es una relación requerida en PoleLot, sin onDelete Cascade a
// propósito — borrar una especificación no debería borrar la producción
// real ya registrada. (La receta — PoleRecipeItem — sí tiene onDelete
// Cascade: es solo configuración, no producción real, así que se borra
// junto con la especificación sin problema.) Ver lib/prismaErrors.ts para
// por qué la violación de FK se detecta por mensaje y no solo por P-code.
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.poleSpec.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Especificación no encontrada." }, { status: 404 });
    }
    if (isForeignKeyRestrictError(err)) {
      return NextResponse.json(
        { error: "No se puede eliminar: hay lotes de producción cargados con esta especificación. Marcala como inactiva en su lugar." },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar la especificación." }, { status: 500 });
  }
}
