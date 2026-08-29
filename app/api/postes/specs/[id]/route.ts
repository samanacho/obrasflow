import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializePoleSpec } from "@/lib/serialize";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
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
      include: { lots: { select: { id: true } } },
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

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.poleSpec.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Especificación no encontrada." }, { status: 404 });
    }
    // Fila con lotes ya cargados: specId es una relación requerida en PoleLot
    // sin onDelete Cascade a propósito (borrar una especificación no debería
    // borrar la producción real ya registrada) — se avisa en vez de fallar
    // en silencio. Prisma valida esta relación requerida ANTES de tocar la
    // base (P2014); P2003 se deja como red de contención por si el motor
    // llega a devolver la violación de FK cruda en su lugar.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err.code === "P2014" || err.code === "P2003")
    ) {
      return NextResponse.json(
        { error: "No se puede eliminar: hay lotes de producción cargados con esta especificación. Marcala como inactiva en su lugar." },
        { status: 409 }
      );
    }
    console.error(err);
    const debugCode = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : (err as any)?.name ?? String(err);
    return NextResponse.json({ error: "No se pudo eliminar la especificación.", debugCode }, { status: 500 });
  }
}
