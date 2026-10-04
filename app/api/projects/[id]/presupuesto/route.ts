import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { budgetComparison } from "@/lib/compras/core";
import { logChanges } from "@/lib/history";
import { appSource } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/** Presupuesto por ítem de la obra con lo pedido, comprado y gastado de cada uno. */
export async function GET(_req: NextRequest, { params }: Params) {
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Obra no encontrada." }, { status: 404 });
  return NextResponse.json(await budgetComparison(params.id));
}

/**
 * Agrega ítems (uno cargado a mano o varios importados de una planilla).
 * Body: { items: [{codigo?, descripcion, unidad?, cantidad, precioUnitario, categoria?}], reemplazar?: boolean }
 * "reemplazar" borra antes los ítems que NO tengan pedidos vinculados.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Obra no encontrada." }, { status: 404 });
    const b = (await req.json().catch(() => ({}))) as { items?: unknown; reemplazar?: boolean };
    if (b.items !== undefined && !Array.isArray(b.items)) return NextResponse.json({ error: "La lista de ítems es inválida." }, { status: 400 });
    const rows = ((b.items ?? []) as any[])
      .filter((i) => i && typeof i === "object")
      .map((i) => ({
        codigo: i.codigo ? String(i.codigo).trim() || null : null,
        descripcion: String(i.descripcion ?? "").trim(),
        unidad: i.unidad ? String(i.unidad).trim() || null : null,
        cantidad: Number(i.cantidad),
        precioUnitario: Number(i.precioUnitario),
        categoria: i.categoria ? String(i.categoria).trim() || null : null,
      }))
      .filter((i) => i.descripcion);
    const bad = rows.findIndex((r) => !Number.isFinite(r.cantidad) || r.cantidad < 0 || !Number.isFinite(r.precioUnitario) || r.precioUnitario < 0);
    if (bad >= 0) return NextResponse.json({ error: `Fila ${bad + 1} ("${rows[bad].descripcion}"): la cantidad y el precio tienen que ser números.` }, { status: 400 });
    if (!rows.length) return NextResponse.json({ error: "No hay ítems para agregar." }, { status: 400 });
    if (rows.length > 2000) return NextResponse.json({ error: "Son demasiados ítems (máximo 2000 por vez)." }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      let borrados = 0;
      if (b.reemplazar) {
        const del = await tx.budgetItem.deleteMany({ where: { projectId: params.id, lines: { none: {} } } });
        borrados = del.count;
      }
      const last = await tx.budgetItem.aggregate({ where: { projectId: params.id }, _max: { orden: true } });
      const start = (last._max.orden ?? -1) + 1;
      await tx.budgetItem.createMany({ data: rows.map((r, i) => ({ ...r, projectId: params.id, orden: start + i })) });
      return { agregados: rows.length, borrados };
    });
    await logChanges(prisma, params.id, [{ action: "registro_agregado", detail: `Presupuesto por ítem: ${result.agregados} ítem(s) agregado(s)${result.borrados ? `, ${result.borrados} reemplazado(s)` : ""}` }], await appSource());
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo guardar el presupuesto." }, { status: 500 });
  }
}
