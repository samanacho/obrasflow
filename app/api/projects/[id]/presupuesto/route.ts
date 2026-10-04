import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { budgetComparison } from "@/lib/compras/core";
import { logChanges } from "@/lib/history";
import { appSource } from "@/lib/auth/server";
import type { ItemExistente } from "@/lib/compras/reimportar";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/**
 * Presupuesto por ítem de la obra con lo pedido, comprado y gastado de cada uno.
 * Con ?para=importar: los ítems con cuántos pedidos tienen, para comparar
 * contra una planilla nueva (lib/compras/reimportar.ts).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Obra no encontrada." }, { status: 404 });
  if (req.nextUrl.searchParams.get("para") === "importar") {
    const items = await prisma.budgetItem.findMany({
      where: { projectId: params.id },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { lines: true } },
        lines: { where: { order: { status: { in: ["aprobado", "pagado"] } } }, select: { cantidad: true } },
      },
    });
    const out: ItemExistente[] = items.map((i) => ({
      id: i.id,
      codigo: i.codigo,
      descripcion: i.descripcion,
      unidad: i.unidad,
      cantidad: Number(i.cantidad),
      precioUnitario: Number(i.precioUnitario),
      categoria: i.categoria,
      pedidos: i._count.lines,
      pedido: i.lines.reduce((s, l) => s + Number(l.cantidad), 0),
    }));
    return NextResponse.json(out);
  }
  return NextResponse.json(await budgetComparison(params.id));
}

type Fila = { codigo: string | null; descripcion: string; unidad: string | null; cantidad: number; precioUnitario: number; categoria: string | null };

function leerFilas(raw: unknown): Fila[] | { error: string } {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return { error: "La lista de ítems es inválida." };
  const rows = (raw as any[])
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
  if (bad >= 0) return { error: `Fila ${bad + 1} ("${rows[bad].descripcion}"): la cantidad y el precio tienen que ser números.` };
  return rows;
}

/**
 * Guarda ítems del presupuesto. Dos formas:
 *  - { items, reemplazar? }: agrega (un ítem cargado a mano o una planilla
 *    en una obra sin presupuesto). "reemplazar" borra antes los ítems sin pedidos.
 *  - { agregar, actualizar: [{id, ...}], borrar: [id] }: lo que el usuario
 *    decidió al volver a importar una planilla sobre la que ya estaba.
 * Todo o nada.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Obra no encontrada." }, { status: 404 });
    const b = (await req.json().catch(() => ({}))) as { items?: unknown; reemplazar?: boolean; agregar?: unknown; actualizar?: unknown; borrar?: unknown };

    const conPlan = b.agregar !== undefined || b.actualizar !== undefined || b.borrar !== undefined;
    const agregar = leerFilas(conPlan ? b.agregar : b.items);
    if ("error" in agregar) return NextResponse.json({ error: agregar.error }, { status: 400 });
    const actualizarFilas = leerFilas(conPlan ? b.actualizar : undefined);
    if ("error" in actualizarFilas) return NextResponse.json({ error: actualizarFilas.error }, { status: 400 });
    const actualizar = actualizarFilas.map((f, i) => ({ ...f, id: String(((b.actualizar as any[])[i] ?? {}).id ?? "") }));
    const borrar = conPlan && Array.isArray(b.borrar) ? (b.borrar as unknown[]).map(String) : [];

    const total = agregar.length + actualizar.length + borrar.length;
    if (!total) return NextResponse.json({ error: "No hay cambios para guardar." }, { status: 400 });
    if (total > 4000 || agregar.length > 2000) return NextResponse.json({ error: "Son demasiados ítems (máximo 2000 por vez)." }, { status: 400 });

    // Los ítems a actualizar o borrar tienen que ser de esta obra; los que tienen pedidos no se borran.
    const ids = [...actualizar.map((a) => a.id), ...borrar];
    const propios = ids.length
      ? await prisma.budgetItem.findMany({ where: { id: { in: ids }, projectId: params.id }, select: { id: true, descripcion: true, _count: { select: { lines: true } } } })
      : [];
    const porId = new Map(propios.map((p) => [p.id, p]));
    if (ids.some((id) => !porId.has(id))) {
      return NextResponse.json({ error: "Algunos ítems cambiaron mientras revisabas (¿los editó otra persona?). Volvé a abrir la importación." }, { status: 409 });
    }
    const conPedidos = borrar.map((id) => porId.get(id)!).find((p) => p._count.lines > 0);
    if (conPedidos) return NextResponse.json({ error: `"${conPedidos.descripcion}" tiene pedidos vinculados: no se puede borrar.` }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      let borrados = 0;
      if (!conPlan && b.reemplazar) {
        borrados = (await tx.budgetItem.deleteMany({ where: { projectId: params.id, lines: { none: {} } } })).count;
      }
      if (borrar.length) {
        borrados += (await tx.budgetItem.deleteMany({ where: { id: { in: borrar }, projectId: params.id, lines: { none: {} } } })).count;
      }
      for (const { id, ...data } of actualizar) await tx.budgetItem.update({ where: { id }, data });
      if (agregar.length) {
        const last = await tx.budgetItem.aggregate({ where: { projectId: params.id }, _max: { orden: true } });
        const start = (last._max.orden ?? -1) + 1;
        await tx.budgetItem.createMany({ data: agregar.map((r, i) => ({ ...r, projectId: params.id, orden: start + i })) });
      }
      return { agregados: agregar.length, actualizados: actualizar.length, borrados };
    });

    const partes = [
      result.agregados && `${result.agregados} ítem(s) agregado(s)`,
      result.actualizados && `${result.actualizados} actualizado(s)`,
      result.borrados && `${result.borrados} borrado(s)`,
    ].filter(Boolean);
    await logChanges(prisma, params.id, [{ action: "registro_agregado", detail: `Presupuesto por ítem: ${partes.join(", ")}` }], await appSource());
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo guardar el presupuesto." }, { status: 500 });
  }
}
