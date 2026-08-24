import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeHistoryEntry } from "@/lib/serialize";

export const dynamic = "force-dynamic";

interface Params {
  params: { entryId: string };
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const obraNombre = String(body.obraNombre ?? "").trim();
    if (!obraNombre) return NextResponse.json({ error: "El nombre de la obra es obligatorio." }, { status: 400 });

    const rating = body.rating !== undefined && body.rating !== null && body.rating !== "" ? Number(body.rating) : null;
    if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
      return NextResponse.json({ error: "La calificación debe ser entre 1 y 5." }, { status: 400 });
    }

    const updated = await prisma.contractorHistoryEntry.update({
      where: { id: params.entryId },
      data: {
        obraNombre,
        projectId: body.projectId ? String(body.projectId) : null,
        rating,
        comentario: body.comentario ? String(body.comentario) : null,
        fecha: body.fecha ? new Date(String(body.fecha)) : null,
      },
    });
    return NextResponse.json(serializeHistoryEntry(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.contractorHistoryEntry.delete({ where: { id: params.entryId } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar." }, { status: 500 });
  }
}
