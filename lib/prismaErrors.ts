import { Prisma } from "@prisma/client";

/**
 * True si `err` es una violación de integridad referencial al intentar
 * borrar una fila que todavía está referenciada por otra tabla (RESTRICT).
 *
 * Ojo con esto: contra Postgres nativo (no relationMode="prisma"), Prisma
 * NO necesariamente mapea esta violación a un P-code "conocido" como P2003
 * o P2014 — puede llegar como PrismaClientUnknownRequestError envolviendo
 * el ConnectorError crudo del motor (SQLSTATE 23001 "restrict_violation" /
 * 23503 "foreign_key_violation"). Se descubrió esto en producción al borrar
 * un PoleSpec con lotes cargados: el código real NO era P2003 ni P2014,
 * y el guard silenciosamente caía al 500 genérico en vez de avisar bien.
 * Por eso acá se detecta por texto del mensaje como respaldo, no solo por
 * código.
 */
export function isForeignKeyRestrictError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2014")) {
    return true;
  }
  const message = err instanceof Error ? err.message : "";
  return /foreign key constraint/i.test(message) || /violates .* constraint/i.test(message);
}
