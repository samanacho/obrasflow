import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeTool } from "@/lib/serialize";
import { syncToolMovement } from "@/lib/tools";

export const dynamic = "force-dynamic";

const ESTADOS = ["disponible", "en_uso", "en_reparacion", "de_baja"];

/** Lista herramientas del inventario, con filtros opcionales ?estado=&categoria=&q=. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const estado = sp.get("estado");
  const categoria = sp.get("categoria");
  const q = sp.get("q");

  const tools = await prisma.tool.findMany({
    where: {
      ...(estado ? { estado: estado as any } : {}),
      ...(categoria ? { categoria: { equals: categoria, mode: "insensitive" } } : {}),
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" } },
              { marcaModelo: { contains: q, mode: "insensitive" } },
              { responsable: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { proveedor: { select: { name: true } } },
    orderBy: { nombre: "asc" },
  });
  return NextResponse.json(tools.map(serializeTool));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const nombre = String(body.nombre ?? "").trim();
    if (!nombre) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

    const cantidad = Number.isFinite(Number(body.cantidad)) ? Math.round(Number(body.cantidad)) : 1;
    if (cantidad < 1) return NextResponse.json({ error: "La cantidad tiene que ser al menos 1." }, { status: 400 });

    const estado = ESTADOS.includes(String(body.estado)) ? String(body.estado) : "disponible";

    let costoUnitarioGs: number | null = null;
    if (body.costoUnitarioGs !== undefined && body.costoUnitarioGs !== null && body.costoUnitarioGs !== "") {
      const c = Number(body.costoUnitarioGs);
      if (!Number.isFinite(c) || c < 0) {
        return NextResponse.json({ error: "El costo unitario tiene que ser un número mayor o igual a cero." }, { status: 400 });
      }
      costoUnitarioGs = c;
    }

    const fechaAdquisicion = body.fechaAdquisicion ? String(body.fechaAdquisicion).trim() || null : null;
    if (fechaAdquisicion && !/^\d{4}-\d{2}-\d{2}$/.test(fechaAdquisicion)) {
      return NextResponse.json({ error: "Fecha de adquisición inválida." }, { status: 400 });
    }

    // El movimiento (si corresponde) se crea ANTES que la herramienta para
    // poder guardar el generalMovementId ya en el insert.
    const generalMovementId = await syncToolMovement({
      existingGeneralMovementId: null,
      nombre,
      cantidad,
      costoUnitarioGs,
      fechaAdquisicion,
    });

    try {
      const created = await prisma.tool.create({
        data: {
          nombre,
          categoria: body.categoria ? String(body.categoria).trim() || null : null,
          marcaModelo: body.marcaModelo ? String(body.marcaModelo).trim() || null : null,
          cantidad,
          estado: estado as any,
          costoUnitarioGs,
          proveedorId: body.proveedorId ? String(body.proveedorId) : null,
          fechaAdquisicion: fechaAdquisicion ? new Date(fechaAdquisicion) : null,
          responsable: body.responsable ? String(body.responsable).trim() || null : null,
          notas: body.notas ? String(body.notas).trim() || null : null,
          generalMovementId,
        },
        include: { proveedor: { select: { name: true } } },
      });
      return NextResponse.json(serializeTool(created), { status: 201 });
    } catch (toolErr) {
      // Si la herramienta no se pudo crear (ej. proveedorId inválido), no
      // dejamos huérfano el movimiento que ya se generó para ella.
      if (generalMovementId) await prisma.generalMovement.delete({ where: { id: generalMovementId } }).catch(() => {});
      throw toolErr;
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo crear la herramienta." }, { status: 500 });
  }
}
