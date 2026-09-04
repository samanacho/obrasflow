import { prisma } from "./prisma";

// Servidor únicamente (usa Prisma) — separado por el mismo motivo que
// lib/spent.ts: evita arrastrar el cliente de Prisma a un bundle de cliente
// si algún día algo de lib/tools.ts se necesitara importar desde ahí.

/**
 * Crea, actualiza o borra el GeneralMovement (egreso) enlazado a una
 * herramienta de Inventario, según costoUnitarioGs * cantidad — el usuario
 * eligió explícitamente que esto sea automático (ver Tool.generalMovement
 * en prisma/schema.prisma). Se llama desde POST /api/tools y PUT
 * /api/tools/[id], siempre DESPUÉS de validar el body y ANTES de guardar la
 * herramienta, para poder escribir el generalMovementId resultante en el
 * mismo prisma.tool.create/update.
 *
 * - Si el costo total es > 0: crea el movimiento (si no había uno) o
 *   actualiza monto/concepto/categoría del que ya estaba enlazado. La fecha
 *   del movimiento solo se toca si vino `fechaAdquisicion` en este guardado
 *   — si no, se deja como estaba (no la pisa a "hoy" en cada edición).
 * - Si el costo total es 0 (o se sacó): si había un movimiento enlazado, se
 *   borra — la herramienta deja de tener un egreso asociado.
 *
 * Devuelve el generalMovementId final (o null) para guardar en la herramienta.
 */
export async function syncToolMovement(params: {
  existingGeneralMovementId: string | null;
  nombre: string;
  cantidad: number;
  costoUnitarioGs: number | null;
  fechaAdquisicion: string | null; // "YYYY-MM-DD" o null
}): Promise<string | null> {
  const { existingGeneralMovementId, nombre, cantidad, costoUnitarioGs, fechaAdquisicion } = params;
  const totalCost = costoUnitarioGs && costoUnitarioGs > 0 ? costoUnitarioGs * cantidad : 0;
  const fecha = fechaAdquisicion ? new Date(fechaAdquisicion) : undefined;

  if (totalCost > 0) {
    const data = {
      tipo: "egreso" as const,
      concepto: `Adquisición: ${nombre}`,
      categoria: "Herramientas y equipos",
      monto: totalCost,
      ...(fecha ? { fecha } : {}),
    };
    if (existingGeneralMovementId) {
      await prisma.generalMovement.update({ where: { id: existingGeneralMovementId }, data });
      return existingGeneralMovementId;
    }
    const created = await prisma.generalMovement.create({
      data: { ...data, fecha: fecha ?? new Date(), estado: "Pagado" },
    });
    return created.id;
  }

  if (existingGeneralMovementId) {
    // best-effort: si ya lo habían borrado a mano desde /movimientos, el
    // FK de Tool.generalMovementId ya está en null igual (onDelete: SetNull).
    await prisma.generalMovement.delete({ where: { id: existingGeneralMovementId } }).catch(() => {});
  }
  return null;
}
