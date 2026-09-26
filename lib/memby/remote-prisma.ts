import { Prisma, type PrismaClient } from "@prisma/client";
import { decodeWire, encodeWire, REMOTE_OPS } from "./wire";

// Cliente "Prisma remoto" para el conector de Memby en la PC: en vez de
// conectarse a la base, cada prisma.<modelo>.<operación>(args) se manda a
// /api/memby/db de la app en Vercel, que la corre contra la base de
// producción. Así Memby registra directo en producción sin que la PC tenga
// la contraseña de la base (solo MEMBY_CONNECTOR_KEY). Se activa con
// MEMBY_REMOTE_URL (ver lib/prisma.ts).
//
// Límites: no hay $transaction ni SQL crudo. Lo que necesita transacción
// (confirmar una propuesta) corre entero en Vercel: /api/memby/execute.

export class RemoteDbError extends Error {
  code?: string;
  meta?: unknown;
  constructor(message: string, code?: string, meta?: unknown) {
    super(message);
    this.name = "RemoteDbError";
    this.code = code;
    this.meta = meta;
  }
}

const TIMEOUT_MS = 30_000;

export async function callMemby(baseUrl: string, key: string, path: string, body: unknown): Promise<any> {
  let lastErr: unknown;
  // Un reintento solo ante fallas de red (no ante errores de la base: una
  // escritura que llegó no se repite).
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${key}` },
        body: JSON.stringify(encodeWire(body)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      const message = json?.error ?? `HTTP ${res.status} en ${path}`;
      // Mismo tipo de error que la base local: el código chequea
      // `instanceof Prisma.PrismaClientKnownRequestError && code === "P2002"`
      // (mensajes o locks repetidos) y tiene que seguir funcionando igual.
      if (typeof json?.code === "string" && /^P\d{4}$/.test(json.code)) {
        throw new Prisma.PrismaClientKnownRequestError(message, { code: json.code, clientVersion: Prisma.prismaVersion.client, meta: json.meta });
      }
      throw new RemoteDbError(message, json?.code, json?.meta);
    }
    return decodeWire(json?.result, { decimal: (s) => new Prisma.Decimal(s) });
  }
  throw new RemoteDbError(`Sin conexión con ObrasFlow (${baseUrl}): ${(lastErr as Error)?.message ?? lastErr}`);
}

export function createRemotePrisma(baseUrl: string, key: string): PrismaClient {
  const models = new Map<string, unknown>();
  const client = new Proxy({} as Record<string | symbol, unknown>, {
    get(_t, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop === "$connect" || prop === "$disconnect") return async () => {};
      if (prop === "then") return undefined; // no es una promesa
      if (prop.startsWith("$")) {
        return () => {
          throw new RemoteDbError(`${prop} no está disponible en el conector remoto de Memby.`);
        };
      }
      if (!models.has(prop)) {
        models.set(
          prop,
          new Proxy({}, {
            get(_m, op) {
              if (typeof op !== "string" || !REMOTE_OPS.has(op)) return undefined;
              return (args?: unknown) => callMemby(baseUrl, key, "/api/memby/db", { model: prop, op, args: args ?? {} });
            },
          })
        );
      }
      return models.get(prop);
    },
  });
  return client as unknown as PrismaClient;
}
