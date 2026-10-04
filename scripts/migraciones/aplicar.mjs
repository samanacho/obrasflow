// Migraciones de DATOS que corren una sola vez por base, en el deploy de
// Vercel (vercel.json → buildCommand), después de `prisma db push` (así la
// tabla DataMigration ya existe) y antes de `next build`.
//
// Cada migración tiene un id fijo y deja una marca en DataMigration al
// aplicarse: si la marca ya está, no hace nada. Producción y cada preview
// tienen su propia base (copia de Neon), así que cada una se migra una vez.
//
// Si algo falla, sale con código 1: el deploy se corta y la transacción
// deshace todo, así no queda una migración a medias.
//
// Uso (lo corre el deploy; a mano solo contra una base de prueba):
//   . ./scripts/resolve-db-env.sh && node scripts/migraciones/aplicar.mjs

import { PrismaClient } from "@prisma/client";

/**
 * @typedef {{ id: string, descripcion: string, aplicar: (tx: import("@prisma/client").Prisma.TransactionClient) => Promise<string> }} Migracion
 */

/** @type {Migracion[]} En orden; nunca cambiar el id de una que ya corrió. */
const MIGRACIONES = [
  {
    id: "2026-10-04-gastos-pendientes-a-pagado",
    descripcion: "Movimientos de Ejecución en Pendiente pasan a Pagado (decisión del dueño, 2026-10-04)",
    // Desde este cambio un movimiento "Pendiente" no suma al Ejecutado. Muchos
    // quedaron en Pendiente solo por el estado por defecto aunque ya estaban
    // pagados, así que todos los de hoy pasan a Pagado y desde acá rige la regla.
    //
    // No hace falta recalcular Project.spent: antes del cambio TODOS los
    // movimientos sumaban sin importar el estado, y después de esta migración
    // ya no queda ninguno en Pendiente, así que la suma da exactamente lo mismo
    // que el Ejecutado que la base ya tiene guardado.
    aplicar: async (tx) => {
      const candidatos = await tx.projectItem.findMany({
        where: { kind: "change_order", status: { not: null } },
        select: { id: true, status: true },
      });
      // Misma regla que esPendiente() de lib/movimientos.ts (sin mayúsculas ni
      // espacios); acá se repite porque este script es JS plano y no puede
      // importar TypeScript.
      const ids = candidatos.filter((c) => String(c.status ?? "").trim().toLowerCase() === "pendiente").map((c) => c.id);
      if (ids.length === 0) return "0 movimientos pasados a Pagado (no había pendientes)";
      const r = await tx.projectItem.updateMany({ where: { id: { in: ids } }, data: { status: "Pagado" } });
      return `${r.count} movimiento${r.count === 1 ? "" : "s"} pasado${r.count === 1 ? "" : "s"} a Pagado`;
    },
  },
];

async function main() {
  // La conexión directa (la misma que usa `prisma db push`), no la del pooler:
  // una transacción larga va mejor sin pgbouncer en el medio.
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL;
  if (!url) throw new Error("No hay URL de la base (¿se corrió antes scripts/resolve-db-env.sh?).");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    for (const m of MIGRACIONES) {
      try {
        const detalle = await prisma.$transaction(
          async (tx) => {
            const ya = await tx.dataMigration.findUnique({ where: { id: m.id } });
            if (ya) return null;
            const detalle = await m.aplicar(tx);
            // Si dos deploys corren a la vez contra la misma base, el segundo
            // choca acá (id repetido) y su transacción se deshace entera.
            await tx.dataMigration.create({ data: { id: m.id, detalle } });
            return detalle;
          },
          { timeout: 60_000, maxWait: 15_000 }
        );
        if (detalle === null) console.log(`migraciones: ${m.id} — ya estaba aplicada, nada que hacer.`);
        else console.log(`migraciones: ${m.id} — aplicada: ${detalle}.`);
      } catch (err) {
        // P2002 = id repetido: otro deploy la aplicó en el mismo momento (esta quedó deshecha).
        if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
          console.log(`migraciones: ${m.id} — la aplicó otro deploy al mismo tiempo, nada que hacer.`);
          continue;
        }
        throw err;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("migraciones: FALLÓ, no se aplicó nada de la migración que estaba corriendo:", err);
  process.exit(1);
});
