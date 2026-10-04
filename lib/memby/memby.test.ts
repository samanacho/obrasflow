import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { decodeWire, encodeWire } from "./wire";
import { isRetryable } from "./remote-prisma";

describe("wire (conector de Memby ↔ Vercel)", () => {
  it("ida y vuelta de fechas, bytes, BigInt y decimales", () => {
    const original = {
      fecha: new Date("2026-10-04T12:00:00Z"),
      archivo: Buffer.from("hola"),
      grande: BigInt("9007199254740993"),
      monto: new Prisma.Decimal("1500000.50"),
      lista: [{ d: new Date(0) }, null],
      nada: undefined,
    };
    const vuelta = decodeWire(encodeWire(original), { decimal: (s) => new Prisma.Decimal(s) });
    expect(vuelta.fecha).toEqual(original.fecha);
    expect(Buffer.from(vuelta.archivo).toString()).toBe("hola");
    expect(vuelta.grande).toBe(original.grande);
    expect(vuelta.monto.toString()).toBe("1500000.5");
    expect(vuelta.lista[0].d).toEqual(new Date(0));
    expect(vuelta.lista[1]).toBeNull();
    expect("nada" in vuelta).toBe(false);
  });
  it("un objeto con más claves no se confunde con un tipo", () => {
    expect(decodeWire({ $date: "x", otra: 1 })).toEqual({ $date: "x", otra: 1 });
  });
});

describe("isRetryable (reintentos ante cortes de red)", () => {
  it("solo las lecturas se repiten", () => {
    for (const op of ["findUnique", "findMany", "count", "aggregate"]) expect(isRetryable("/api/memby/db", { model: "x", op })).toBe(true);
  });
  it("una escritura que pudo haber llegado no se repite", () => {
    for (const op of ["create", "update", "updateMany", "upsert", "delete", "deleteMany"]) expect(isRetryable("/api/memby/db", { model: "x", op })).toBe(false);
    expect(isRetryable("/api/memby/execute", { actionId: "a" })).toBe(false);
    expect(isRetryable("/api/memby/db", null)).toBe(false);
  });
});
