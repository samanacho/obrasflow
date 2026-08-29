import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeQualityTest } from "@/lib/serialize";

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
    const fecha = body.fecha ? String(body.fecha) : "";
    if (!fecha) return NextResponse.json({ error: "La fecha es obligatoria." }, { status: 400 });

    const created = await prisma.poleQualityTest.create({
      data: {
        lotId: params.id,
        tipo,
        resultado,
        fecha: new Date(fecha),
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
