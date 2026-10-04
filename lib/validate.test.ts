import { describe, expect, it } from "vitest";
import { MAX_MONTO_GS, normalizeMovimientoData, parseProjectInput, ValidationError } from "./validate";

const base = {
  name: "Puente Río Claro",
  type: "civil",
  manager: "Ana",
  start: "2026-02-01",
  end: "2026-09-30",
  budget: 1_000_000,
  spent: 0,
  progress: 50.6,
};

describe("parseProjectInput", () => {
  it("normaliza una obra válida", () => {
    const p = parseProjectInput(base);
    expect(p.progress).toBe(51);
    expect(p.status).toBe("planificado");
    expect(p.code).toBeUndefined(); // sin "code" no se toca el que ya estaba
    expect(p.coordinates).toBeNull();
  });

  it("rechaza fechas que no existen y fin antes del inicio", () => {
    expect(() => parseProjectInput({ ...base, start: "2026-02-30" })).toThrow("Fecha de inicio inválida");
    expect(() => parseProjectInput({ ...base, end: "2026-13-01" })).toThrow("Fecha de fin inválida");
    expect(() => parseProjectInput({ ...base, start: "2026-10-01", end: "2026-09-30" })).toThrow("anterior a la de inicio");
  });

  it("rechaza un presupuesto que no entra en la base (ceros de más)", () => {
    expect(() => parseProjectInput({ ...base, budget: MAX_MONTO_GS + 1 })).toThrow("demasiado grande");
    expect(parseProjectInput({ ...base, budget: MAX_MONTO_GS }).budget).toBe(MAX_MONTO_GS);
  });

  it("otros campos obligatorios", () => {
    expect(() => parseProjectInput({ ...base, name: "  " })).toThrow(ValidationError);
    expect(() => parseProjectInput({ ...base, type: "otro" })).toThrow("Especificá el rubro");
    expect(() => parseProjectInput({ ...base, code: "A B" })).toThrow("código de obra");
    expect(() => parseProjectInput({ ...base, sector: "x" })).toThrow("Sector inválido");
    expect(() => parseProjectInput(null)).toThrow(ValidationError);
  });
});

describe("normalizeMovimientoData", () => {
  it("redondea a guaraníes enteros", () => {
    expect(normalizeMovimientoData({ tipo: "Gasto", monto: "1500000.6" })).toEqual({ data: { tipo: "Gasto", monto: 1500001 } });
  });
  it("rechaza texto y negativos (salvo una orden de cambio, que puede achicar el alcance)", () => {
    expect(normalizeMovimientoData({ tipo: "Gasto", monto: "abc" })).toHaveProperty("error");
    expect(normalizeMovimientoData({ tipo: "Gasto", monto: -500 })).toHaveProperty("error");
    expect(normalizeMovimientoData({ tipo: "Orden de cambio", monto: -500 })).toEqual({ data: { tipo: "Orden de cambio", monto: -500 } });
    expect(normalizeMovimientoData({ tipo: "Gasto", monto: 1e13 })).toHaveProperty("error");
  });
  it("sin monto o sin datos no se toca", () => {
    expect(normalizeMovimientoData(undefined)).toEqual({ data: {} });
    expect(normalizeMovimientoData({ tipo: "Gasto", monto: "" })).toEqual({ data: { tipo: "Gasto", monto: "" } });
    expect(normalizeMovimientoData([1])).toHaveProperty("error");
  });
});
