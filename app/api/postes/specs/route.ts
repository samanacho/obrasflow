import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializePoleSpec } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Lista el catálogo de especificaciones de poste, opcionalmente ?activo=true */
export async function GET(req: NextRequest) {
  const activo = req.nextUrl.searchParams.get("activo");
  const specs = await prisma.poleSpec.findMany({
    where: activo ? { activo: activo === "true" } : {},
    include: { lots: { select: { id: true } }, recipeItems: { include: { material: true } } },
    orderBy: { nombre: "asc" },
  });
  return NextResponse.json(specs.map(serializePoleSpec));
}

export async function POST(req: NextRequest) {
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

    const created = await prisma.poleSpec.create({
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
    return NextResponse.json(serializePoleSpec(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo crear la especificación." }, { status: 500 });
  }
}
