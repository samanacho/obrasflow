import type { Prisma, ProjectItem } from "@prisma/client";
import { prisma } from "./prisma";
import { ITEM_KINDS } from "./itemKinds";
import { recomputeProjectSpent } from "./spent";

// Servidor únicamente (usa Prisma). Único camino para crear un ProjectItem:
// lo usan la API (app/api/projects/[id]/items/route.ts) y el agente de
// WhatsApp (lib/agent/actions.ts), así los dos dejan exactamente el mismo
// rastro (feed de actividad + Ejecutado recalculado).

export async function createProjectItem(
  input: {
    projectId: string;
    kind: string;
    title: string;
    status?: string | null;
    data?: Prisma.InputJsonValue;
  },
  /** Pasos extra dentro de la MISMA transacción (el agente marca ahí la captura rápida que clasifica). */
  alsoInTx?: (tx: Prisma.TransactionClient, created: ProjectItem) => Promise<void>
): Promise<ProjectItem> {
  const config = ITEM_KINDS[input.kind];
  if (!config) throw new Error(`Módulo inválido: "${input.kind}".`);

  // Todo o nada: si algo falla, no queda un movimiento sin su Ejecutado
  // recalculado (ni uno que el agente reporte como "no registrado").
  return prisma.$transaction(async (tx) => {
    const created = await tx.projectItem.create({
      data: {
        projectId: input.projectId,
        kind: input.kind,
        title: input.title,
        status: input.status ? String(input.status) : config.defaultStatus ?? null,
        data: input.data ?? {},
      },
    });

    // Feed de actividad automático (excepto para el propio feed).
    if (input.kind !== "activity") {
      await tx.projectItem.create({
        data: {
          projectId: input.projectId,
          kind: "activity",
          title: `${config.icon} Se agregó ${config.singular}: "${input.title}"`,
          data: {},
        },
      });
    }

    // Movimientos: el Ejecutado de la ficha se recalcula solo a partir de
    // estos items, así que hay que actualizarlo cada vez que se carga uno.
    if (input.kind === "change_order") await recomputeProjectSpent(input.projectId, tx);

    if (alsoInTx) await alsoInTx(tx, created);
    return created;
  });
}
