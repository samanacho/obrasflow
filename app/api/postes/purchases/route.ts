import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeMaterialPurchase } from "@/lib/serialize";
import type { PurchaseDocType } from "@/lib/types";

export const dynamic = "force-dynamic";

const PURCHASE_DOC_TYPES: PurchaseDocType[] = ["factura", "orden_compra", "remision", "otro"];

/** Lista compras de materia prima, opcionalmente ?materialId= */
export async function GET(req: NextRequest) {
  const materialId = req.nextUrl.searchParams.get("materialId");
  const purchases = await prisma.materialPurchase.findMany({
    where: materialId ? { materialId } : {},
    include: { material: true },
    orderBy: { fecha: "desc" },
  });
  return NextResponse.json(purchases.map(serializeMaterialPurchase));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const materialId = String(body.materialId ?? "").trim();
    if (!materialId) return NextResponse.json({ error: "La materia prima es obligatoria." }, { status: 400 });
    const material = await prisma.rawMaterial.findUnique({ where: { id: materialId } });
    if (!material) return NextResponse.json({ error: "Materia prima no encontrada." }, { status: 400 });

    const fecha = String(body.fecha ?? "").trim();
    if (!fecha) return NextResponse.json({ error: "La fecha es obligatoria." }, { status: 400 });

    const cantidad = Number(body.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return NextResponse.json({ error: "La cantidad tiene que ser un número mayor a 0." }, { status: 400 });
    }

    const costoUnitarioGs = Number(body.costoUnitarioGs);
    if (!Number.isFinite(costoUnitarioGs) || costoUnitarioGs <= 0) {
      return NextResponse.json({ error: "El costo unitario tiene que ser un número mayor a 0." }, { status: 400 });
    }

    const tipoDocumento: PurchaseDocType = PURCHASE_DOC_TYPES.includes(body.tipoDocumento as PurchaseDocType)
      ? (body.tipoDocumento as PurchaseDocType)
      : "factura";

    const created = await prisma.materialPurchase.create({
      data: {
        materialId,
        fecha: new Date(fecha),
        cantidad,
        costoUnitarioGs,
        costoTotalGs: cantidad * costoUnitarioGs,
        proveedor: body.proveedor ? String(body.proveedor) : null,
        tipoDocumento,
        numeroDocumento: body.numeroDocumento ? String(body.numeroDocumento) : null,
        notas: body.notas ? String(body.notas) : null,
      },
      include: { material: true },
    });
    return NextResponse.json(serializeMaterialPurchase(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo registrar la compra." }, { status: 500 });
  }
}
