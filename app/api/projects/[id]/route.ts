import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeProject } from "@/lib/serialize";
import { MAX_MONTO_GS, parseProjectInput, ValidationError } from "@/lib/validate";
import { reprocessPending } from "@/lib/integraciones/residente/process";
import { SOURCE as RESIDENTE_SOURCE } from "@/lib/integraciones/residente/types";
import { resolveSitioId } from "@/lib/sitios";
import { diffProject, logChanges } from "@/lib/history";
import { appSource } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

const SITIO_INCLUDE = { sitio: { select: { nombre: true, responsable: true } } } as const;

/** Anota en el historial de la obra cada campo que cambió (nunca tira error). */
async function logFieldChanges(projectId: string, before: Parameters<typeof diffProject>[0], after: Parameters<typeof diffProject>[1]) {
  const diffs = diffProject(before, after);
  await logChanges(prisma, projectId, diffs.map((d) => ({ action: "campo" as const, ...d })), await appSource());
}

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
    // Versión anterior, para anotar en el historial qué cambió.
    const before = await prisma.project.findUnique({ where: { id: params.id } });
    // El avance de las obras de Residente de Obra lo marca esa app (al
    // importar): el formulario de edición no lo puede pisar.
    if (before?.progressSource === RESIDENTE_SOURCE) data.progress = before.progress;
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
    if (before) await logFieldChanges(params.id, before, updated);
    // Si se le acaba de poner el código, aplicar los partes de Residente de Obra que esperaban esta obra.
    if (updated.code && updated.code !== before?.code) await reprocessPending();
    return NextResponse.json(serializeProject(updated));
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Ya hay otra obra con ese código de obra." }, { status: 409 });
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
    if (typeof body.status === "string") {
      if (!["planificado", "en_curso", "pausado", "finalizado"].includes(body.status)) {
        return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
      }
      data.status = body.status;
    }
    // Ubicación desde el mapa de Inicio: "lat,lng" o null para quitarla.
    if (body.coordinates === null) data.coordinates = null;
    else if (typeof body.coordinates === "string") {
      if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(body.coordinates.trim())) {
        return NextResponse.json({ error: "Ubicación inválida." }, { status: 400 });
      }
      data.coordinates = body.coordinates.trim();
    }
    if (typeof body.progress === "number") {
      const progress = Math.max(0, Math.min(100, Math.round(body.progress)));
      const actual = await prisma.project.findUnique({ where: { id: params.id }, select: { progress: true, progressSource: true } });
      if (actual?.progressSource === RESIDENTE_SOURCE) {
        // El avance lo marca Residente de Obra. Si solo se pidió cambiar el
        // avance, se avisa; si viene junto con otra cosa (ej. el estado), se
        // guarda lo demás y el avance queda como está.
        const otros = ["status", "coordinates", "budget", "sitioNombre"].some((k) => body[k] !== undefined);
        if (!otros && progress !== actual.progress) {
          return NextResponse.json(
            { error: "El avance de esta obra lo calcula Residente de Obra y se actualiza al importar sus partes. No se cambia a mano." },
            { status: 409 }
          );
        }
      } else {
        data.progress = progress;
      }
    }
    if (body.budget !== undefined) {
      const budget = Number(body.budget);
      if (!Number.isFinite(budget) || budget < 0) {
        return NextResponse.json({ error: "Presupuesto inválido." }, { status: 400 });
      }
      if (budget > MAX_MONTO_GS) {
        return NextResponse.json({ error: "El presupuesto es demasiado grande: revisá que no sobren ceros." }, { status: 400 });
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

    // Versión anterior, para anotar en el historial qué cambió.
    const before = await prisma.project.findUnique({ where: { id: params.id } });
    const updated = await prisma.project.update({ where: { id: params.id }, data, include: SITIO_INCLUDE });
    if (before) await logFieldChanges(params.id, before, updated);
    // Si se le acaba de poner el código, aplicar los partes de Residente de Obra que esperaban esta obra.
    if (updated.code && updated.code !== before?.code) await reprocessPending();
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
