import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeTool } from "@/lib/serialize";
import { syncToolMovement } from "@/lib/tools";

export const dynamic = "force-dynamic";

const ESTADOS = ["disponible", "en_uso", "en_reparacion", "de_baja"];

interface Params {
  params: { id: string };
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const existing = await prisma.tool.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Herramienta no encontrada." }, { status: 404 });

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

    const generalMovementId = await syncToolMovement({
      existingGeneralMovementId: existing.generalMovementId,
      nombre,
      cantidad,
      costoUnitarioGs,
      fechaAdquisicion,
    });

    // Igual que en el alta: si el movimiento se creó recién y la herramienta no
    // se puede guardar (ej. proveedor borrado), no queda un egreso suelto.
    const movimientoNuevo = !existing.generalMovementId && generalMovementId ? generalMovementId : null;
    const updated = await prisma.tool
      .update({
        where: { id: params.id },
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
      })
      .catch(async (toolErr) => {
        if (movimientoNuevo) await prisma.generalMovement.delete({ where: { id: movimientoNuevo } }).catch(() => {});
        throw toolErr;
      });
    return NextResponse.json(serializeTool(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Herramienta no encontrada." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar la herramienta." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const existing = await prisma.tool.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Herramienta no encontrada." }, { status: 404 });

    // Se borra primero el movimiento (si había uno) — el FK de Tool tiene
    // onDelete: SetNull, así que esto no rompe nada aunque la herramienta
    // todavía la referencie en este instante. Todo o nada: no queda un gasto
    // sin su herramienta. deleteMany no falla si el movimiento ya no existe.
    const generalMovementId = existing.generalMovementId;
    await prisma.$transaction(async (tx) => {
      if (generalMovementId) await tx.generalMovement.deleteMany({ where: { id: generalMovementId } });
      await tx.tool.delete({ where: { id: params.id } });
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Herramienta no encontrada." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar la herramienta." }, { status: 500 });
  }
}
