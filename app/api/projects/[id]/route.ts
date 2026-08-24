import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeProject } from "@/lib/serialize";
import { parseProjectInput, ValidationError } from "@/lib/validate";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });
  return NextResponse.json(serializeProject(project));
}

/** Reemplazo completo del proyecto (usado por el formulario de edición). */
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json();
    const data = parseProjectInput(body);
    const updated = await prisma.project.update({
      where: { id: params.id },
      data: {
        ...data,
        start: new Date(data.start),
        end: new Date(data.end),
      },
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

/** Actualización parcial (usado por los botones de mover estado en el Kanban). */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof body.status === "string") data.status = body.status;
    if (typeof body.progress === "number") data.progress = Math.max(0, Math.min(100, Math.round(body.progress)));

    const updated = await prisma.project.update({ where: { id: params.id }, data });
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
