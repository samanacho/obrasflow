import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeRawMaterial } from "@/lib/serialize";
import { isForeignKeyRestrictError } from "@/lib/prismaErrors";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const nombre = String(body.nombre ?? "").trim();
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
    const unidad = String(body.unidad ?? "").trim();
    if (!unidad) return NextResponse.json({ error: "La unidad es obligatoria." }, { status: 400 });
    const costoUnitarioGs = Number(body.costoUnitarioGs);
    if (!Number.isFinite(costoUnitarioGs) || costoUnitarioGs <= 0) {
      return NextResponse.json({ error: "El costo unitario tiene que ser un número mayor a 0." }, { status: 400 });
    }

    const updated = await prisma.rawMaterial.update({
      where: { id: params.id },
      data: {
        nombre,
        unidad,
        costoUnitarioGs,
        proveedor: body.proveedor ? String(body.proveedor) : null,
        notas: body.notas ? String(body.notas) : null,
        activo: body.activo !== false,
      },
      include: {
        recipeItems: { select: { id: true } },
        consumptions: { select: { cantidadTotal: true, costoTotalGs: true } },
      },
    });
    return NextResponse.json(serializeRawMaterial(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Materia prima no encontrada." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar la materia prima." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.rawMaterial.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Materia prima no encontrada." }, { status: 404 });
    }
    if (isForeignKeyRestrictError(err)) {
      return NextResponse.json(
        {
          error:
            "No se puede eliminar: esta materia prima está en uso en una o más recetas o registros de consumo. Marcala como inactiva en su lugar.",
        },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar la materia prima." }, { status: 500 });
  }
}
