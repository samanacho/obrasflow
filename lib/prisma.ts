import { PrismaClient } from "@prisma/client";
import { createRemotePrisma } from "./memby/remote-prisma";

// Evita crear una nueva instancia de PrismaClient en cada hot-reload de
// desarrollo, y reutiliza la conexión entre invocaciones de la misma
// función serverless en Vercel.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// El conector de Memby en la PC trabaja contra producción a través de la app
// en Vercel (MEMBY_REMOTE_URL + MEMBY_CONNECTOR_KEY), sin conexión directa a
// la base. La app (local o en Vercel) nunca define MEMBY_REMOTE_URL.
const remoteUrl = process.env.MEMBY_REMOTE_URL?.trim();
const remoteKey = process.env.MEMBY_CONNECTOR_KEY?.trim();

export const prisma =
  globalForPrisma.prisma ??
  (remoteUrl && remoteKey
    ? createRemotePrisma(remoteUrl, remoteKey)
    : new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      }));

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** true en el conector de Memby cuando trabaja contra la app en Vercel. */
export const isRemoteDb = Boolean(remoteUrl && remoteKey);
