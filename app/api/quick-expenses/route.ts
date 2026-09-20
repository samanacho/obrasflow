import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeQuickExpense } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * Capturas rápidas de gastos (ver model QuickExpense) — el "anotador" que
 * alimenta /registro-rapido. GET trae todas, más recientes primero; el
 * cliente separa pendientes/resueltas (no hay tantos registros como para
 * justificar el filtro server-side).
 */
export async function GET() {
  const items = await prisma.quickExpense.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(items.map(serializeQuickExpense));
}

/** Alta deliberadamente mínima — solo lo que se puede llenar en segundos sin frenar lo que se está haciendo. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const fecha = String(body.fecha ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
    }
    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json({ error: "El monto tiene que ser mayor a cero." }, { status: 400 });
    }
    const medioPago = String(body.medioPago ?? "").trim();
    if (!medioPago) {
      return NextResponse.json({ error: "El medio de pago es obligatorio." }, { status: 400 });
    }
    const nota = String(body.nota ?? "").trim() || null;

    const created = await prisma.quickExpense.create({
      data: { fecha: new Date(fecha), monto, medioPago, nota },
    });
    return NextResponse.json(serializeQuickExpense(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo guardar el registro rápido." }, { status: 500 });
  }
}
