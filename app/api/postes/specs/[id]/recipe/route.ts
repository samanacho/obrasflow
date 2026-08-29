import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeRecipeItem } from "@/lib/serialize";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/** Agrega un material a la receta (BOM) de la especificación params.id. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const materialId = String(body.materialId ?? "").trim();
    if (!materialId) return NextResponse.json({ error: "La materia prima es obligatoria." }, { status: 400 });

    const material = await prisma.rawMaterial.findUnique({ where: { id: materialId } });
    if (!material) return NextResponse.json({ error: "Materia prima no encontrada." }, { status: 400 });

    const cantidadPorPoste = Number(body.cantidadPorPoste);
    if (!Number.isFinite(cantidadPorPoste) || cantidadPorPoste <= 0) {
      return NextResponse.json({ error: "La cantidad por poste tiene que ser un número mayor a 0." }, { status: 400 });
    }

    const spec = await prisma.poleSpec.findUnique({ where: { id: params.id } });
    if (!spec) return NextResponse.json({ error: "Especificación no encontrada." }, { status: 404 });

    const created = await prisma.poleRecipeItem.create({
      data: {
        specId: params.id,
        materialId,
        cantidadPorPoste,
        notas: body.notas ? String(body.notas) : null,
      },
      include: { material: true },
    });
    return NextResponse.json(serializeRecipeItem(created), { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Ese material ya está en la receta de este poste. Editá la cantidad en vez de agregarlo de nuevo." },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo agregar el material a la receta." }, { status: 500 });
  }
}
