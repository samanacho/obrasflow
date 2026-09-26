// Formato de ida y vuelta entre el conector de Memby (PC) y la app en Vercel
// (/api/memby/db). JSON no tiene fechas, bytes, decimales ni BigInt: se
// marcan con una clave "$tipo" y se reconstruyen del otro lado. Sin Prisma
// acá, para que lo puedan importar las dos puntas.

type Revive = { decimal?: (s: string) => unknown };

export function encodeWire(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, function (this: any, key, v) {
      // JSON.stringify ya llamó a toJSON (Date → string, Buffer → {type,data}):
      // se mira el valor original para saber qué era.
      const raw = this?.[key];
      if (raw instanceof Date) return { $date: raw.toISOString() };
      if (raw instanceof Uint8Array) return { $bytes: Buffer.from(raw).toString("base64") };
      if (typeof raw === "bigint") return { $bigint: raw.toString() };
      if (raw && typeof raw === "object" && typeof raw.toFixed === "function" && typeof raw.isZero === "function") {
        return { $decimal: raw.toString() };
      }
      if (v && typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) {
        return { $bytes: Buffer.from(v.data).toString("base64") };
      }
      return v;
    })
  );
}

export function decodeWire(value: unknown, revive: Revive = {}): any {
  if (Array.isArray(value)) return value.map((v) => decodeWire(v, revive));
  if (!value || typeof value !== "object") return value;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 1) {
    if (typeof o.$date === "string") return new Date(o.$date);
    if (typeof o.$bytes === "string") return Buffer.from(o.$bytes, "base64");
    if (typeof o.$bigint === "string") return BigInt(o.$bigint);
    if (typeof o.$decimal === "string") return revive.decimal ? revive.decimal(o.$decimal) : o.$decimal;
  }
  return Object.fromEntries(keys.map((k) => [k, decodeWire(o[k], revive)]));
}

/** Operaciones de Prisma que el conector puede pedir (sin SQL crudo ni transacciones interactivas). */
export const REMOTE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
  "create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany",
]);
