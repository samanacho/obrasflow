import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

// Un turno por número a la vez. Meta manda cada mensaje en un webhook
// aparte, así que una foto y el texto que la sigue llegan a dos funciones
// distintas: sin esto correrían en paralelo, cada una sin ver a la otra, y
// podrían proponer el mismo pago dos veces.
//
// Es un lease en una fila (no un advisory lock de Postgres): no ocupa una
// conexión mientras el modelo piensa y funciona igual detrás del pooler.

/** Más largo que maxDuration del webhook: si la función muere a mitad, el lock vence solo poco después. */
const LEASE_MS = 75_000;
const POLL_MS = 800;

/** Espera el turno hasta `waitUntilMs` (epoch ms). Devuelve el token del lock, o null si no llegó a tomarlo. */
export async function acquirePhoneLock(phone: string, waitUntilMs: number): Promise<string | null> {
  const token = randomUUID();
  for (;;) {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + LEASE_MS);
    const row = await prisma.whatsAppLock.findUnique({ where: { phone } });
    if (!row) {
      try {
        await prisma.whatsAppLock.create({ data: { phone, token, lockedUntil } });
        return token;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    } else if (row.lockedUntil < now) {
      // Condicional: si otro lo tomó entre el findUnique y acá, no se pisa.
      const res = await prisma.whatsAppLock.updateMany({ where: { phone, lockedUntil: { lt: now } }, data: { token, lockedUntil } });
      if (res.count === 1) return token;
    }
    if (Date.now() + POLL_MS > waitUntilMs) return null;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export async function releasePhoneLock(phone: string, token: string): Promise<void> {
  await prisma.whatsAppLock
    .updateMany({ where: { phone, token }, data: { lockedUntil: new Date(0) } })
    .catch((err) => console.error("WhatsApp: no se pudo liberar el lock", err));
}
