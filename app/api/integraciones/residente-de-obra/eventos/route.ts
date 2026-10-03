import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reprocessPending } from "@/lib/integraciones/residente/process";
import { SOURCE } from "@/lib/integraciones/residente/types";

export const dynamic = "force-dynamic";

/** Últimos eventos recibidos de Residente de Obra y cuántos quedaron pendientes. */
export async function GET() {
  const [eventos, pendientes] = await Promise.all([
    prisma.integrationEvent.findMany({
      where: { source: SOURCE },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, event: true, status: true, error: true, projectId: true, createdAt: true, processedAt: true },
    }),
    prisma.integrationEvent.count({ where: { source: SOURCE, status: { in: ["sin_obra", "error"] } } }),
  ]);
  return NextResponse.json({ configurado: Boolean(process.env.RESIDENTE_WEBHOOK_SECRET?.trim()), pendientes, eventos });
}

/** Reprocesa los eventos pendientes (ej. después de cargarle el código a una obra). */
export async function POST() {
  return NextResponse.json(await reprocessPending());
}
