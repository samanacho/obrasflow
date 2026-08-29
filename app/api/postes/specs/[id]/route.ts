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

/**
 * specId es una relación requerida en PoleLot, sin onDelete Cascade a
 * propósito (borrar una especificación no debería borrar la producción
 * real ya registrada). En Postgres esto sale como un RESTRICT de FK a
 * nivel de motor (SQLSTATE 23001) — Prisma no lo mapea a un P-code
 * "conocido" (P2003/P2014 son para otros casos), así que llega acá como
 * PrismaClientUnknownRequestError envolviendo el ConnectorError crudo.
 * Se detecta por el texto del mensaje en vez de por código.
 */
function isSpecInUseError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2014" || err.code === "P2003")) {
    return true;
  }
  const message = err instanceof Error ? err.message : "";
  return /foreign key constraint/i.test(message) && /PoleLot/.test(message);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.poleSpec.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Especificación no encontrada." }, { status: 404 });
    }
    if (isSpecInUseError(err)) {
      return NextResponse.json(
        { error: "No se puede eliminar: hay lotes de producción cargados con esta especificación. Marcala como inactiva en su lugar." },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar la especificación." }, { status: 500 });
  }
}
