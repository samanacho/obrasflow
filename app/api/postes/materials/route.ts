import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeRawMaterial } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Lista el catálogo de materias primas, opcionalmente ?activo=true */
export async function GET(req: NextRequest) {
  const activo = req.nextUrl.searchParams.get("activo");
  const where = activo ? { activo: activo === "true" } : {};
  // Totales sumados en la base: traer cada consumo y compra para sumarlos acá
  // crece sin límite con los lotes fabricados.
  const [materials, consumos, compras] = await Promise.all([
    prisma.rawMaterial.findMany({
      where,
      include: { _count: { select: { recipeItems: true } } },
      orderBy: { nombre: "asc" },
    }),
    prisma.poleLotMaterialConsumption.groupBy({
      by: ["materialId"],
      where: { material: where },
      _sum: { cantidadTotal: true, costoTotalGs: true },
    }),
    prisma.materialPurchase.groupBy({ by: ["materialId"], where: { material: where }, _sum: { cantidad: true } }),
  ]);
  const consumoPor = new Map(consumos.map((c) => [c.materialId, c._sum]));
  const compraPor = new Map(compras.map((c) => [c.materialId, c._sum]));
  return NextResponse.json(
    materials.map((m) =>
      serializeRawMaterial({
        ...m,
        sumas: {
          consumido: Number(consumoPor.get(m.id)?.cantidadTotal ?? 0),
          costoConsumido: Number(consumoPor.get(m.id)?.costoTotalGs ?? 0),
          comprado: Number(compraPor.get(m.id)?.cantidad ?? 0),
        },
      })
    )
  );
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
