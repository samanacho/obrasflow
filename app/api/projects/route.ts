import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeProject } from "@/lib/serialize";
import { parseProjectInput, ValidationError } from "@/lib/validate";
import { reprocessPending } from "@/lib/integraciones/residente/process";
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
    // Obra nueva: sin "sitioNombre" en el pedido queda sin Sitio.
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
    // Partes de Residente de Obra que llegaron antes de que existiera esta obra.
    // La obra ya quedó guardada: si esto falla se anota, pero no se responde error.
    if (created.code) await reprocessPending().catch((err) => console.error("No se pudieron reprocesar los partes de Residente de Obra:", err));
    return NextResponse.json(serializeProject(created), { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Ya hay otra obra con ese código de obra." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo crear el proyecto." }, { status: 500 });
  }
}
