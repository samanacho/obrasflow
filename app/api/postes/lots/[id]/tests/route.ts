import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeQualityTest } from "@/lib/serialize";
import { parseOptionalYmd } from "@/lib/dates";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const tipo = String(body.tipo ?? "").trim();
    if (!tipo) return NextResponse.json({ error: "Elegí el tipo de ensayo." }, { status: 400 });
    const resultado = String(body.resultado ?? "").trim();
    if (!resultado) return NextResponse.json({ error: "Elegí el resultado." }, { status: 400 });
    const fecha = parseOptionalYmd(body.fecha);
    if (fecha === null) return NextResponse.json({ error: "La fecha es obligatoria." }, { status: 400 });
    if (fecha === undefined) return NextResponse.json({ error: "La fecha es inválida." }, { status: 400 });

    const lot = await prisma.poleLot.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!lot) return NextResponse.json({ error: "Lote no encontrado." }, { status: 404 });

    const created = await prisma.poleQualityTest.create({
      data: {
        lotId: params.id,
        tipo,
        resultado,
        fecha,
        valorMedido: body.valorMedido ? String(body.valorMedido) : null,
        responsable: body.responsable ? String(body.responsable) : null,
        observaciones: body.observaciones ? String(body.observaciones) : null,
      },
    });
    return NextResponse.json(serializeQualityTest(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo cargar el ensayo." }, { status: 500 });
  }
}
