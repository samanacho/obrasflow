import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeProject } from "@/lib/serialize";
import { parseProjectInput, ValidationError } from "@/lib/validate";
import { resolveSitioId } from "@/lib/sitios";

export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "asc" },
    include: { sitio: { select: { nombre: true, responsable: true } } },
  });
  return NextResponse.json(projects.map(serializeProject));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sitioNombre, ...data } = parseProjectInput(body);
    const sitioId = await resolveSitioId(sitioNombre ?? null, data.manager);
    const created = await prisma.project.create({
      data: {
        ...data,
        sitioId,
        spent: 0, // un proyecto nuevo arranca sin movimientos cargados.
        start: new Date(data.start),
        end: new Date(data.end),
        sectorData: data.sectorData === null ? Prisma.JsonNull : data.sectorData,
      },
      include: { sitio: { select: { nombre: true, responsable: true } } },
    });
    return NextResponse.json(serializeProject(created), { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo crear el proyecto." }, { status: 500 });
  }
}
