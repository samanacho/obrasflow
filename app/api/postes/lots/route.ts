import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializePoleLot } from "@/lib/serialize";
import { LOT_STATUS_ORDER } from "@/lib/poleFields";

export const dynamic = "force-dynamic";

const LOT_INCLUDE = {
  spec: { select: { nombre: true } },
  tests: { orderBy: { fecha: "desc" as const } },
  materialConsumptions: { orderBy: { materialNombre: "asc" as const } },
};

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
    include: LOT_INCLUDE,
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
    // Default 1: de 101 postes producidos, 100 se entregan y 1 se rompe en
    // la fiscalización por las pruebas de la ANDE — ver comment en schema.prisma.
    const cantidadParaEnsayo = body.cantidadParaEnsayo !== undefined ? Number(body.cantidadParaEnsayo) : 1;
    if (!Number.isInteger(cantidadParaEnsayo) || cantidadParaEnsayo < 0) {
      return NextResponse.json({ error: "La cantidad para ensayo tiene que ser un entero mayor o igual a 0." }, { status: 400 });
    }
    if (cantidadParaEnsayo > cantidad) {
      return NextResponse.json({ error: "No puede haber más postes para ensayo que la cantidad total del lote." }, { status: 400 });
    }
    const fechaColado = body.fechaColado ? String(body.fechaColado) : "";
    if (!fechaColado) return NextResponse.json({ error: "La fecha de colado es obligatoria." }, { status: 400 });
    const estado = LOT_STATUS_ORDER.includes(body.estado as any) ? String(body.estado) : "en_curado";

    // Al crear el lote se congela el consumo de materia prima: se toma la
    // receta de la especificación TAL COMO ESTÁ en este momento (cantidad
    // por poste y costo unitario actual de cada material) y se guarda una
    // copia fija por lote — así el costo de este lote no se mueve después
    // aunque cambie el precio de mercado o se edite la receta. Ver el
    // comment de PoleLotMaterialConsumption en schema.prisma.
    const created = await prisma.$transaction(async (tx) => {
      const lot = await tx.poleLot.create({
        data: {
          specId,
          codigo,
          cantidad,
          cantidadParaEnsayo,
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

      const recipeItems = await tx.poleRecipeItem.findMany({ where: { specId }, include: { material: true } });
      if (recipeItems.length > 0) {
        await tx.poleLotMaterialConsumption.createMany({
          data: recipeItems.map((ri) => {
            const cantidadPorPoste = Number(ri.cantidadPorPoste);
            const costoUnitarioGs = Number(ri.material.costoUnitarioGs);
            const cantidadTotal = cantidadPorPoste * cantidad;
            return {
              lotId: lot.id,
              materialId: ri.materialId,
              materialNombre: ri.material.nombre,
              unidad: ri.material.unidad,
              cantidadPorPoste,
              costoUnitarioGs,
              cantidadTotal,
              costoTotalGs: cantidadTotal * costoUnitarioGs,
            };
          }),
        });
      }

      return tx.poleLot.findUniqueOrThrow({ where: { id: lot.id }, include: LOT_INCLUDE });
    });

    return NextResponse.json(serializePoleLot(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo crear el lote." }, { status: 500 });
  }
}
