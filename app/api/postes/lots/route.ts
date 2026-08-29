import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializePoleLot } from "@/lib/serialize";
import { LOT_STATUS_ORDER } from "@/lib/poleFields";

export const dynamic = "force-dynamic";

/** Lista lotes, opcionalmente ?specId=&estado= */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const specId = sp.get("specId");
  const estado = sp.get("estado");

  const lots = await prisma.poleLot.findMany({
    where: {
      ...(specId ? { specId } : {}),
      ...(estado ? { estado: estado as any } : {}),
    },
    include: { spec: { select: { nombre: true } }, tests: { orderBy: { fecha: "desc" } } },
    orderBy: { fechaColado: "desc" },
  });
  return NextResponse.json(lots.map(serializePoleLot));
}

export async function POST(req: NextRequest) {
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
    const fechaColado = body.fechaColado ? String(body.fechaColado) : "";
    if (!fechaColado) return NextResponse.json({ error: "La fecha de colado es obligatoria." }, { status: 400 });
    const estado = LOT_STATUS_ORDER.includes(body.estado as any) ? String(body.estado) : "en_curado";

    const created = await prisma.poleLot.create({
      data: {
        specId,
        codigo,
        cantidad,
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
      include: { spec: { select: { nombre: true } }, tests: true },
    });
    return NextResponse.json(serializePoleLot(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo crear el lote." }, { status: 500 });
  }
}
