import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { calcularEjecutado } from "./movimientos";

// Servidor únicamente (usa Prisma) — separado de lib/movimientos.ts para
// que ese archivo (importado también desde componentes cliente vía
// lib/itemKinds.ts) no arrastre el cliente de Prisma al bundle del navegador.

/**
 * Recalcula `Project.spent` a partir de los items kind="change_order"
 * (Movimientos) del proyecto. Se llama después de crear/editar/eliminar
 * cualquier movimiento — ver app/api/projects/[id]/items/route.ts (POST)
 * y app/api/items/[itemId]/route.ts (PUT/DELETE; el PUT recalcula también
 * cuando solo cambia el estado, así "Marcar pagado" mueve el Ejecutado).
 * La suma en sí (tipo + estado: los "Pendiente" no cuentan) vive en
 * calcularEjecutado de lib/movimientos.ts, para que las pantallas y Memby
 * usen la misma regla. Sin $transaction a propósito: el resto de las rutas
 * de la app tampoco las usa, y el riesgo de una carrera entre dos escrituras
 * simultáneas es despreciable para el volumen de uso de esta app. `db`
 * permite correrlo dentro de una transacción cuando quien llama la necesita
 * (ver lib/items.ts).
 */
export async function recomputeProjectSpent(projectId: string, db: Prisma.TransactionClient = prisma): Promise<void> {
  const items = await db.projectItem.findMany({ where: { projectId, kind: "change_order" }, select: { status: true, data: true } });
  await db.project.update({ where: { id: projectId }, data: { spent: calcularEjecutado(items) } });
}
