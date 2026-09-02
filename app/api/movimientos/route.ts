import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeMovimiento } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const ATTACHMENT_META_SELECT = { id: true, filename: true, mimeType: true, size: true, createdAt: true };

/**
 * Listado de Ejecución cruzado a TODAS las obras — a diferencia de
 * GET /api/projects/[id]/items?kind=change_order (una obra puntual), esto
 * es lo que alimenta /movimientos, al que se llega desde la card "Costos
 * vs. beneficios" de Inicio. Se ordena por createdAt acá (server-side); el
 * orden "por fecha del movimiento" real (que puede diferir de createdAt)
 * lo hace el cliente, mismo criterio que ya usa /ejecucion.
 */
export async function GET(_req: NextRequest) {
  const items = await prisma.projectItem.findMany({
    where: { kind: "change_order" },
    include: {
      project: { select: { name: true, type: true } },
      attachments: { select: ATTACHMENT_META_SELECT, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(items.map(serializeMovimiento));
}
