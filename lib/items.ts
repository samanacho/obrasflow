import type { Prisma, ProjectItem } from "@prisma/client";
import { prisma } from "./prisma";
import { ITEM_KINDS } from "./itemKinds";
import { recomputeProjectSpent } from "./spent";
import { logChanges, sourceFromData } from "./history";
import { fmtGs } from "./agent/format";

// Servidor únicamente (usa Prisma). Único camino para crear un ProjectItem:
// lo usan la API (app/api/projects/[id]/items/route.ts) y el agente de
// WhatsApp (lib/agent/actions.ts), así los dos dejan exactamente el mismo
// rastro (feed de actividad + Ejecutado recalculado + historial de cambios).

export async function createProjectItem(
  input: {
    projectId: string;
    kind: string;
    title: string;
    status?: string | null;
    data?: Prisma.InputJsonValue;
    /** Solo para registros que vienen de otro sistema (ver lib/integraciones/). */
    externalSource?: string;
    externalId?: string;
    /** Quién lo cargó, para el historial (nombre de quien ingresó). Si no, se deduce de data.procesadoPor. */
    source?: string;
  },
  /** Pasos extra dentro de la MISMA transacción (el agente marca ahí la captura rápida que clasifica). */
  alsoInTx?: (tx: Prisma.TransactionClient, created: ProjectItem) => Promise<void>
): Promise<ProjectItem> {
  const config = ITEM_KINDS[input.kind];
  if (!config) throw new Error(`Módulo inválido: "${input.kind}".`);

  // Todo o nada: si algo falla, no queda un movimiento sin su Ejecutado
  // recalculado (ni uno que el agente reporte como "no registrado").
  const created = await prisma.$transaction(async (tx) => {
    const created = await tx.projectItem.create({
      data: {
        projectId: input.projectId,
        kind: input.kind,
        title: input.title,
        status: input.status ? String(input.status) : config.defaultStatus ?? null,
        data: input.data ?? {},
        externalSource: input.externalSource ?? null,
        externalId: input.externalId ?? null,
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

  // Historial de cambios de la obra — se anota recién cuando el guardado ya
  // quedó firme (fuera de la transacción), así un problema con el historial
  // nunca puede deshacer el registro. logChanges no tira error.
  if (input.kind !== "activity") {
    const data = (input.data ?? {}) as Record<string, unknown>;
    const monto = input.kind === "change_order" && data.monto !== undefined && data.monto !== null && data.monto !== "" ? Number(data.monto) : NaN;
    await logChanges(
      prisma,
      input.projectId,
      [
        {
          action: "registro_agregado",
          detail: `${config.icon} ${config.singular}: "${input.title}"` + (Number.isFinite(monto) ? ` · ${fmtGs(monto)}` : ""),
        },
      ],
      input.source ?? sourceFromData(input.data)
    );
  }
  return created;
}
