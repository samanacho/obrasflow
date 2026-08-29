import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializePoleLot } from "@/lib/serialize";
import { LOT_STATUS_ORDER } from "@/lib/poleFields";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

const LOT_INCLUDE = {
  spec: { select: { nombre: true } },
  tests: { orderBy: { fecha: "desc" as const } },
  materialConsumptions: { orderBy: { materialNombre: "asc" as const } },
};

export async function GET(_req: NextRequest, { params }: Params) {
  const lot = await prisma.poleLot.findUnique({ where: { id: params.id }, include: LOT_INCLUDE });
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
    // Default 1: de 101 postes producidos, 100 se entregan y 1 se rompe en
    // la fiscalización por las pruebas de la ANDE — ver comment en schema.prisma.
    const cantidadParaEnsayo = body.cantidadParaEnsayo !== undefined ? Number(body.cantidadParaEnsayo) : 1;
    if (!Number.isInteger(cantidadParaEnsayo) || cantidadParaEnsayo < 0) {
      return NextResponse.json({ error: "La cantidad para ensayo tiene que ser un entero mayor o igual a 0." }, { status: 400 });
    }
    if (cantidadParaEnsayo > cantidad) {
      return NextResponse.json({ error: "No puede haber más postes para ensayo que la cantidad total del lote." }, { status: 400 });
    }
    const cantidadDespachada = body.cantidadDespachada !== undefined ? Number(body.cantidadDespachada) : 0;
    if (!Number.isInteger(cantidadDespachada) || cantidadDespachada < 0) {
      return NextResponse.json({ error: "La cantidad despachada tiene que ser un entero mayor o igual a 0." }, { status: 400 });
    }
    if (cantidadDespachada > cantidad - cantidadParaEnsayo) {
      return NextResponse.json(
        { error: "No podés despachar más postes de los que quedan disponibles después de descontar los reservados para ensayo." },
        { status: 400 }
      );
    }
    const fechaColado = body.fechaColado ? String(body.fechaColado) : "";
    if (!fechaColado) return NextResponse.json({ error: "La fecha de colado es obligatoria." }, { status: 400 });
    const estado = LOT_STATUS_ORDER.includes(body.estado as any) ? String(body.estado) : "en_curado";

    // Si cambia la cantidad de postes del lote, se re-escala la cantidad y
    // costo total de cada consumo de materia prima YA registrado — pero
    // usando el costo unitario que ya estaba congelado en ese consumo, no
    // el costo actual del material. Editar un lote no debe re-tasar su
    // costo histórico a precios de hoy.
    const updated = await prisma.$transaction(async (tx) => {
      const lot = await tx.poleLot.update({
        where: { id: params.id },
        data: {
          specId,
          codigo,
          cantidad,
          cantidadParaEnsayo,
          cantidadDespachada,
          fechaColado: new Date(fechaColado),
          fechaDesmolde: body.fechaDesmolde ? new Date(String(body.fechaDesmolde)) : null,
          estado: estado as any,
          responsable: body.responsable ? String(body.responsable) : null,
          ciudadDestino: body.ciudadDestino ? String(body.ciudadDestino) : null,
          andeAprobado: Boolean(body.andeAprobado),
          andeFecha: body.andeFecha ? new Date(String(body.andeFecha)) : null,
          andeActa: body.andeActa ? String(body.andeActa) : null,
          andeInspector: body.andeInspector ? String(body.andeInspector) : null,
          numeracionAnde: body.numeracionAnde ? String(body.numeracionAnde) : null,
          notas: body.notas ? String(body.notas) : null,
        },
      });

      const consumptions = await tx.poleLotMaterialConsumption.findMany({ where: { lotId: params.id } });
      for (const c of consumptions) {
        const cantidadTotal = Number(c.cantidadPorPoste) * cantidad;
        await tx.poleLotMaterialConsumption.update({
          where: { id: c.id },
          data: { cantidadTotal, costoTotalGs: cantidadTotal * Number(c.costoUnitarioGs) },
        });
      }

      return tx.poleLot.findUniqueOrThrow({ where: { id: lot.id }, include: LOT_INCLUDE });
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
