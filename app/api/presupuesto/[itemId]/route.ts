import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logChanges } from "@/lib/history";
import { appSource } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

interface Params {
  params: { itemId: string };
}

/** Solo "no existe" es 404; cualquier otro problema es un error de verdad y se anota. */
function errorResponse(err: unknown, accion: string) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    return NextResponse.json({ error: "Ítem no encontrado." }, { status: 404 });
  }
  console.error(err);
  return NextResponse.json({ error: `No se pudo ${accion} el ítem.` }, { status: 500 });
}

/** Edita un ítem del presupuesto: { codigo?, descripcion?, unidad?, cantidad?, precioUnitario?, categoria? } */
export async function PATCH(req: NextRequest, { params }: Params) {
  const b = (await req.json().catch(() => null)) as Record<string, any> | null;
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const data: Record<string, unknown> = {};
  for (const k of ["codigo", "unidad", "categoria"]) if (k in b) data[k] = b[k] ? String(b[k]).trim() || null : null;
  if ("descripcion" in b) {
    const d = String(b.descripcion ?? "").trim();
    if (!d) return NextResponse.json({ error: "La descripción no puede quedar vacía." }, { status: 400 });
    data.descripcion = d;
  }
  for (const k of ["cantidad", "precioUnitario"]) {
    if (k in b) {
      const n = Number(b[k]);
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: "La cantidad y el precio tienen que ser números positivos." }, { status: 400 });
      data[k] = n;
    }
  }
  try {
    const it = await prisma.budgetItem.update({ where: { id: params.itemId }, data });
    // Historial de la obra (logChanges no tira error).
    await logChanges(prisma, it.projectId, [{ action: "registro_editado", detail: `Presupuesto por ítem: editado "${it.descripcion}"` }], await appSource());
    return NextResponse.json({ id: it.id });
  } catch (err) {
    return errorResponse(err, "guardar");
  }
}

/** Borra un ítem. Los pedidos que lo usaban quedan con ese renglón "fuera del presupuesto". */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const it = await prisma.budgetItem.delete({ where: { id: params.itemId } });
    // Historial de la obra (logChanges no tira error).
    await logChanges(prisma, it.projectId, [{ action: "registro_borrado", detail: `Presupuesto por ítem: borrado "${it.descripcion}"` }], await appSource());
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err, "borrar");
  }
}
