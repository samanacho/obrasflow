import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeGeneralMovement } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const TIPOS = ["ingreso", "egreso"];

/**
 * Movimientos de caja de la empresa SIN obra asociada (ver GeneralMovement
 * en prisma/schema.prisma) — ej. un servicio aparte, un gasto administrativo,
 * intereses bancarios. Se cargan/editan desde /movimientos (mezclados en la
 * misma tabla que los movimientos de obra de GET /api/movimientos) y su neto
 * ("ingreso" suma, "egreso" resta) se suma al KPI "Costos vs. beneficios" de
 * Inicio.
 */
export async function GET() {
  const items = await prisma.generalMovement.findMany({ orderBy: { fecha: "desc" } });
  return NextResponse.json(items.map(serializeGeneralMovement));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const fecha = String(body.fecha ?? "").trim();
    if (!fecha) return NextResponse.json({ error: "La fecha es obligatoria." }, { status: 400 });

    const tipo = String(body.tipo ?? "");
    if (!TIPOS.includes(tipo)) {
      return NextResponse.json({ error: 'El tipo tiene que ser "ingreso" o "egreso".' }, { status: 400 });
    }

    const concepto = String(body.concepto ?? "").trim();
    if (!concepto) return NextResponse.json({ error: "El concepto es obligatorio." }, { status: 400 });

    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json({ error: "El monto tiene que ser mayor a cero." }, { status: 400 });
    }

    // Quién CONSIGUIÓ el ingreso (distinto de procesadoPor) — obligatorio
    // para tipo="ingreso", se usa para el reparto de beneficios de
    // /personal (ver lib/profitShare.ts).
    const responsable = body.responsable ? String(body.responsable).trim() || null : null;
    if (tipo === "ingreso" && !responsable) {
      return NextResponse.json({ error: "El responsable es obligatorio para un ingreso." }, { status: 400 });
    }

    const created = await prisma.generalMovement.create({
      data: {
        fecha: new Date(fecha),
        tipo: tipo as any,
        concepto,
        categoria: body.categoria ? String(body.categoria) : null,
        monto,
        medioPago: body.medioPago ? String(body.medioPago) : null,
        estado: body.estado ? String(body.estado) : null,
        procesadoPor: body.procesadoPor ? String(body.procesadoPor) : null,
        responsable,
        notas: body.notas ? String(body.notas) : null,
      },
    });
    return NextResponse.json(serializeGeneralMovement(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo crear el movimiento." }, { status: 500 });
  }
}
