import { PrismaClient } from "@prisma/client";

// Evita crear una nueva instancia de PrismaClient en cada hot-reload de
// desarrollo, y reutiliza la conexión entre invocaciones de la misma
// función serverless en Vercel.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
