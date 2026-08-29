import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializePoleLot } from "@/lib/serialize";
import { LOT_STATUS_ORDER } from "@/lib/poleFields";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const lot = await prisma.poleLot.findUnique({
    where: { id: params.id },
    include: { spec: { select: { nombre: true } }, tests: { orderBy: { fecha: "desc" } } },
  });
  if (!lot) return NextResponse.json({ error: "Lote no encontrado." }, { status: 404 });
  return NextResponse.json(serializePoleLot(lot));
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const specId = String(body.specId ?? "");
    if (!specId) return NextResponse.json({ error: "Elegí una especificación de poste." }, { status: 400 });
    const codigo = String(body.codigo ?? "").trim();
    if (!codigo) return NextResponse.json({ error: "El código de lote es obligatorio." }, { status: 400 });
    const cantidad = Number(body.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return NextResponse.json({ error: "La cantidad tiene que ser un entero mayor a 0." }, { status: 400 });
    }
    const cantidadDespachada = body.cantidadDespachada !== undefined ? Number(body.cantidadDespachada) : 0;
    if (!Number.isInteger(cantidadDespachada) || cantidadDespachada < 0) {
      return NextResponse.json({ error: "La cantidad despachada tiene que ser un entero mayor o igual a 0." }, { status: 400 });
    }
    if (cantidadDespachada > cantidad) {
      return NextResponse.json({ error: "No podés despachar más de lo que tiene el lote." }, { status: 400 });
    }
    const fechaColado = body.fechaColado ? String(body.fechaColado) : "";
    if (!fechaColado) return NextResponse.json({ error: "La fecha de colado es obligatoria." }, { status: 400 });
    const estado = LOT_STATUS_ORDER.includes(body.estado as any) ? String(body.estado) : "en_curado";

    const updated = await prisma.poleLot.update({
      where: { id: params.id },
      data: {
        specId,
        codigo,
        cantidad,
        cantidadDespachada,
        fechaColado: new Date(fechaColado),
        fechaDesmolde: body.fechaDesmolde ? new Date(String(body.fechaDesmolde)) : null,
        estado: estado as any,
        responsable: body.responsable ? String(body.responsable) : null,
        andeAprobado: Boolean(body.andeAprobado),
        andeFecha: body.andeFecha ? new Date(String(body.andeFecha)) : null,
        andeActa: body.andeActa ? String(body.andeActa) : null,
        andeInspector: body.andeInspector ? String(body.andeInspector) : null,
        notas: body.notas ? String(body.notas) : null,
      },
      include: { spec: { select: { nombre: true } }, tests: { orderBy: { fecha: "desc" } } },
    });
    return NextResponse.json(serializePoleLot(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Lote no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar el lote." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.poleLot.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Lote no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar el lote." }, { status: 500 });
  }
}
