import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeQuickExpense } from "@/lib/serialize";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/**
 * Edición parcial — se usa para: corregir un dato antes de clasificar
 * (fecha/monto/medioPago/nota), y para marcar `resuelto: true` una vez que
 * ese pago ya se cargó como movimiento de obra o gasto general (ver
 * app/registro-rapido/page.tsx). Solo se tocan los campos que vienen en el
 * body.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (typeof body.fecha === "string") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
        return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
      }
      data.fecha = new Date(body.fecha);
    }
    if (body.monto !== undefined) {
      const monto = Number(body.monto);
      if (!Number.isFinite(monto) || monto <= 0) {
        return NextResponse.json({ error: "El monto tiene que ser mayor a cero." }, { status: 400 });
      }
      data.monto = monto;
    }
    if (typeof body.medioPago === "string") data.medioPago = body.medioPago.trim();
    if (body.nota !== undefined) data.nota = body.nota === null ? null : String(body.nota).trim() || null;
    if (typeof body.resuelto === "boolean") data.resuelto = body.resuelto;

    const updated = await prisma.quickExpense.update({ where: { id: params.id }, data });
    return NextResponse.json(serializeQuickExpense(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar el registro." }, { status: 500 });
  }
}

/** Descarta una captura (duplicada, cargada por error) — no afecta ningún movimiento ya clasificado. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.quickExpense.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar el registro." }, { status: 500 });
  }
}
