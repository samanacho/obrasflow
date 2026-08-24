import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeHistoryEntry } from "@/lib/serialize";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const entries = await prisma.contractorHistoryEntry.findMany({
    where: { contractorId: params.id },
    orderBy: { fecha: "desc" },
  });
  return NextResponse.json(entries.map(serializeHistoryEntry));
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const obraNombre = String(body.obraNombre ?? "").trim();
    if (!obraNombre) return NextResponse.json({ error: "El nombre de la obra es obligatorio." }, { status: 400 });

    const rating = body.rating !== undefined && body.rating !== null && body.rating !== "" ? Number(body.rating) : null;
    if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
      return NextResponse.json({ error: "La calificación debe ser entre 1 y 5." }, { status: 400 });
    }

    const created = await prisma.contractorHistoryEntry.create({
      data: {
        contractorId: params.id,
        obraNombre,
        projectId: body.projectId ? String(body.projectId) : null,
        rating,
        comentario: body.comentario ? String(body.comentario) : null,
        fecha: body.fecha ? new Date(String(body.fecha)) : null,
      },
    });
    return NextResponse.json(serializeHistoryEntry(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo agregar la obra al historial." }, { status: 500 });
  }
}
