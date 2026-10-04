import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CompraError, ESTADOS_PEDIDO, ORDER_INCLUDE, createOrder, serializeOrder } from "@/lib/compras/core";

export const dynamic = "force-dynamic";

/** Pedidos de compra (más nuevos primero) y cuántos hay en cada estado. Filtros: ?status=, ?projectId=, ?faltaFactura=1 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const projectId = sp.get("projectId");
  const faltaFactura = sp.get("faltaFactura") === "1";
  const where = {
    ...(status && (ESTADOS_PEDIDO as readonly string[]).includes(status) ? { status } : {}),
    ...(projectId ? { projectId } : {}),
    ...(faltaFactura ? { status: "pagado", facturaNumero: null } : {}),
  };
  const [orders, grouped, sinFactura] = await Promise.all([
    prisma.purchaseOrder.findMany({ where, include: ORDER_INCLUDE, orderBy: { numero: "desc" }, take: 500 }),
    prisma.purchaseOrder.groupBy({ by: ["status"], where: projectId ? { projectId } : {}, _count: true }),
    prisma.purchaseOrder.count({ where: { status: "pagado", facturaNumero: null, ...(projectId ? { projectId } : {}) } }),
  ]);
  const counts: Record<string, number> = Object.fromEntries(ESTADOS_PEDIDO.map((s) => [s, 0]));
  for (const g of grouped) counts[g.status] = g._count;
  counts.faltaFactura = sinFactura;
  return NextResponse.json({ orders: await Promise.all(orders.map((o) => serializeOrder(o, false))), counts });
}

/** Pedido cargado desde la app. Body: { projectId, solicitante, notas?, fechaNecesaria?, supplierId?, proveedorNombre?, lines: [{descripcion, unidad?, cantidad, budgetItemId?}] } */
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as Record<string, any>;
    if (!b.projectId) return NextResponse.json({ error: "Elegí la obra." }, { status: 400 });
    const order = await createOrder({
      projectId: String(b.projectId),
      solicitante: String(b.solicitante ?? "").trim() || "Desde la app",
      origen: "app",
      notas: b.notas ? String(b.notas) : null,
      fechaNecesaria: /^\d{4}-\d{2}-\d{2}$/.test(b.fechaNecesaria ?? "") ? new Date(`${b.fechaNecesaria}T12:00:00-03:00`) : null,
      supplierId: b.supplierId ? String(b.supplierId) : null,
      proveedorNombre: b.proveedorNombre ? String(b.proveedorNombre) : null,
      lines: Array.isArray(b.lines)
        ? b.lines.map((l: any) => ({ descripcion: String(l.descripcion ?? ""), unidad: l.unidad ? String(l.unidad) : null, cantidad: Number(l.cantidad), budgetItemId: l.budgetItemId ? String(l.budgetItemId) : null }))
        : [],
    });
    return NextResponse.json(await serializeOrder(order), { status: 201 });
  } catch (err) {
    if (err instanceof CompraError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "No se pudo guardar el pedido." }, { status: 500 });
  }
}
