import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeRawMaterial } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Lista el catálogo de materias primas, opcionalmente ?activo=true */
export async function GET(req: NextRequest) {
  const activo = req.nextUrl.searchParams.get("activo");
  const materials = await prisma.rawMaterial.findMany({
    where: activo ? { activo: activo === "true" } : {},
    include: {
      recipeItems: { select: { id: true } },
      consumptions: { select: { cantidadTotal: true, costoTotalGs: true } },
      purchases: { select: { cantidad: true } },
    },
    orderBy: { nombre: "asc" },
  });
  return NextResponse.json(materials.map(serializeRawMaterial));
}

export async function POST(req: NextRequest) {
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

    const created = await prisma.rawMaterial.create({
      data: {
        nombre,
        unidad,
        costoUnitarioGs,
        proveedor: body.proveedor ? String(body.proveedor) : null,
        notas: body.notas ? String(body.notas) : null,
        activo: body.activo !== false,
      },
    });
    return NextResponse.json(serializeRawMaterial(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo crear la materia prima." }, { status: 500 });
  }
}
