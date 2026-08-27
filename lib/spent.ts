import { prisma } from "./prisma";
import { MOVIMIENTO_TIPOS } from "./movimientos";

// Servidor únicamente (usa Prisma) — separado de lib/movimientos.ts para
// que ese archivo (importado también desde componentes cliente vía
// lib/itemKinds.ts) no arrastre el cliente de Prisma al bundle del navegador.

const EFFECT_BY_TIPO = new Map<string, string>(MOVIMIENTO_TIPOS.map((t) => [t.value, t.effect]));

/**
 * Recalcula `Project.spent` a partir de los items kind="change_order"
 * (Movimientos) del proyecto. Se llama después de crear/editar/eliminar
 * cualquier movimiento — ver app/api/projects/[id]/items/route.ts (POST)
 * y app/api/items/[itemId]/route.ts (PUT/DELETE). Sin $transaction a
 * propósito: el resto de las rutas de la app tampoco las usa, y el riesgo
 * de una carrera entre dos escrituras simultáneas es despreciable para el
 * volumen de uso de esta app.
 */
export async function recomputeProjectSpent(projectId: string): Promise<void> {
  const items = await prisma.projectItem.findMany({ where: { projectId, kind: "change_order" } });
  let spent = 0;
  for (const item of items) {
    const data = item.data as any;
    const effect = EFFECT_BY_TIPO.get(String(data?.tipo ?? ""));
    const monto = Number(data?.monto ?? 0);
    if (!Number.isFinite(monto)) continue;
    if (effect === "add") spent += monto;
    else if (effect === "subtract") spent -= monto;
  }
  await prisma.project.update({ where: { id: projectId }, data: { spent: Math.max(0, spent) } });
}
