import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Agregados livianos para las tarjetas y accesos rápidos del Dashboard —
 * evita que el frontend tenga que pedir los items de cada proyecto uno por uno. */
export async function GET() {
  const [contractorsActive, ratedHistory, openRelevamientos, pendingCotizaciones, pendingMilestones] = await Promise.all([
    prisma.contractor.count({ where: { status: "activo" } }),
    prisma.contractorHistoryEntry.findMany({ where: { rating: { not: null } }, select: { rating: true } }),
    prisma.projectItem.count({ where: { kind: "rfi", status: { in: ["Pendiente", "En proceso"] } } }),
    prisma.projectItem.count({ where: { kind: "cotizacion", status: "Pendiente" } }),
    prisma.projectItem.count({ where: { kind: "milestone", status: { not: "Cumplido" } } }),
  ]);

  const avgRating = ratedHistory.length
    ? ratedHistory.reduce((sum, h) => sum + (h.rating ?? 0), 0) / ratedHistory.length
    : null;

  return NextResponse.json({
    contractorsActive,
    contractorsAvgRating: avgRating,
    openRelevamientos,
    pendingCotizaciones,
    pendingMilestones,
  });
}
