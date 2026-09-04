import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeGeneralMovement } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const TIPOS = ["ingreso", "egreso"];

interface Params {
  params: { id: string };
}

export async function PUT(req: NextRequest, { params }: Params) {
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

    const updated = await prisma.generalMovement.update({
      where: { id: params.id },
      data: {
        fecha: new Date(fecha),
        tipo: tipo as any,
        concepto,
        categoria: body.categoria ? String(body.categoria) : null,
        monto,
        medioPago: body.medioPago ? String(body.medioPago) : null,
        estado: body.estado ? String(body.estado) : null,
        procesadoPor: body.procesadoPor ? String(body.procesadoPor) : null,
        notas: body.notas ? String(body.notas) : null,
      },
    });
    return NextResponse.json(serializeGeneralMovement(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Movimiento no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar el movimiento." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.generalMovement.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Movimiento no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar el movimiento." }, { status: 500 });
  }
}
