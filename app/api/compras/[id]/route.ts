import { NextRequest, NextResponse } from "next/server";
import { CompraError, getOrder, serializeOrder, updateOrder } from "@/lib/compras/core";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const o = await getOrder(params.id);
  if (!o) return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
  return NextResponse.json(await serializeOrder(o));
}

/** Cambios mientras no está pagado: { projectId?, supplierId?, proveedorNombre?, notas?, fechaNecesaria?, lines? } */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const b = (await req.json()) as Record<string, any>;
    const o = await updateOrder(params.id, {
      ...("projectId" in b ? { projectId: b.projectId ? String(b.projectId) : null } : {}),
      ...("supplierId" in b ? { supplierId: b.supplierId ? String(b.supplierId) : null } : {}),
      ...("proveedorNombre" in b ? { proveedorNombre: b.proveedorNombre ? String(b.proveedorNombre) : null } : {}),
      ...("notas" in b ? { notas: b.notas ? String(b.notas) : null } : {}),
      ...("fechaNecesaria" in b
        ? { fechaNecesaria: /^\d{4}-\d{2}-\d{2}$/.test(b.fechaNecesaria ?? "") ? new Date(`${b.fechaNecesaria}T12:00:00-03:00`) : null }
        : {}),
      ...(Array.isArray(b.lines)
        ? {
            lines: b.lines.map((l: any) => ({
              descripcion: String(l.descripcion ?? ""),
              unidad: l.unidad ? String(l.unidad) : null,
              cantidad: Number(l.cantidad),
              // null explícito = "no está en el presupuesto"; undefined = emparejar solo.
              budgetItemId: l.budgetItemId === null ? null : l.budgetItemId ? String(l.budgetItemId) : undefined,
            })),
          }
        : {}),
    });
    return NextResponse.json(await serializeOrder(o));
  } catch (err) {
    if (err instanceof CompraError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "No se pudo guardar el pedido." }, { status: 500 });
  }
}
