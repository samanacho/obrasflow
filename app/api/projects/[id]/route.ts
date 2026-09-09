import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeProject } from "@/lib/serialize";
import { parseProjectInput, ValidationError } from "@/lib/validate";
import { resolveSitioId } from "@/lib/sitios";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

const SITIO_INCLUDE = { sitio: { select: { nombre: true, responsable: true } } } as const;

export async function GET(_req: NextRequest, { params }: Params) {
  const project = await prisma.project.findUnique({ where: { id: params.id }, include: SITIO_INCLUDE });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
  return NextResponse.json(serializeProject(project));
}

/** Reemplazo completo del proyecto (usado por el formulario de edición). */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json();
    const { sitioNombre, ...data } = parseProjectInput(body);
    const sitioId = await resolveSitioId(sitioNombre ?? null, data.manager);
    const updated = await prisma.project.update({
      where: { id: params.id },
      data: {
        ...data,
        sitioId,
        // El Ejecutado se recalcula solo a partir de Movimientos (ver
        // lib/spent.ts) — nunca se pisa desde el formulario general de
        // edición, aunque el payload lo siga incluyendo sin cambios.
        spent: undefined,
        start: new Date(data.start),
        end: new Date(data.end),
        sectorData: data.sectorData === null ? Prisma.JsonNull : data.sectorData,
      },
      include: SITIO_INCLUDE,
    });
    return NextResponse.json(serializeProject(updated));
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar el proyecto." }, { status: 500 });
  }
}

/**
 * Actualización parcial (usado por los botones de mover estado en el
 * Kanban, y por el editor rápido de presupuesto de la ficha de la obra).
 * `budget` es solo el número: nada más se recalcula en el servidor
 * porque nada más lo guarda por separado — % ejecutado, saldo disponible,
 * los gráficos de /ejecucion y las alertas de "sobre presupuesto" de
 * Inicio se calculan siempre en vivo a partir de este mismo valor, así
 * que quedan al día apenas se vuelve a pedir el proyecto.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof body.status === "string") data.status = body.status;
    if (typeof body.progress === "number") data.progress = Math.max(0, Math.min(100, Math.round(body.progress)));
    if (body.budget !== undefined) {
      const budget = Number(body.budget);
      if (!Number.isFinite(budget) || budget < 0) {
        return NextResponse.json({ error: "Presupuesto inválido." }, { status: 400 });
      }
      data.budget = budget;
    }
    // Asignar/desasignar Sitio sin pasar por el formulario completo (usado
    // por la ficha del Sitio para agregar/quitar frentes).
    if (typeof body.sitioNombre === "string" || body.sitioNombre === null) {
      const current = await prisma.project.findUnique({ where: { id: params.id }, select: { manager: true } });
      if (!current) return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
      data.sitioId = await resolveSitioId(body.sitioNombre as string | null, current.manager);
    }

    const updated = await prisma.project.update({ where: { id: params.id }, data, include: SITIO_INCLUDE });
    return NextResponse.json(serializeProject(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar el proyecto." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.project.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar el proyecto." }, { status: 500 });
  }
}
