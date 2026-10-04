import { describe, expect, it } from "vitest";
import { fmtCant, fmtMiles, leerMonto, parseGs, parseNumero } from "./labels";

describe("parseNumero (cantidades y números escritos a mano)", () => {
  it("formato de Paraguay e internacional", () => {
    expect(parseNumero("1.500.000")).toBe(1_500_000);
    expect(parseNumero("Gs. 45.000")).toBe(45_000);
    expect(parseNumero("1.234,50")).toBe(1234.5);
    expect(parseNumero("1,234.50")).toBe(1234.5);
    expect(parseNumero("1 500 000")).toBe(1_500_000);
    expect(parseNumero("2,5")).toBe(2.5);
    expect(parseNumero(3)).toBe(3);
    // Empieza con "0.": es decimal, no miles (antes "0.500" daba 500).
    expect(parseNumero("0.500")).toBe(0.5);
    expect(parseNumero("0.250 kg")).toBe(0.25);
  });
  it("lo que no es número → null", () => {
    expect(parseNumero("")).toBeNull();
    expect(parseNumero("-")).toBeNull();
    expect(parseNumero(Number.NaN)).toBeNull();
    expect(parseNumero("abc")).toBeNull();
  });
});

describe("parseGs (montos en guaraníes)", () => {
  it("una coma seguida de 3 dígitos es separador de miles", () => {
    expect(parseGs("150,000")).toBe(150_000); // parseNumero da 150
    expect(parseGs("1,500,000")).toBe(1_500_000);
    expect(parseGs("Gs. 150,000")).toBe(150_000);
  });
  it("el resto igual que parseNumero", () => {
    expect(parseGs("1.500.000")).toBe(1_500_000);
    expect(parseGs("45.000")).toBe(45_000);
    expect(parseGs("1.234,50")).toBe(1234.5);
    expect(parseGs("")).toBeNull();
    expect(parseGs(1500)).toBe(1500);
  });
});

describe("leerMonto (campo de monto mientras se escribe)", () => {
  it("puntos, comas y espacios son miles", () => {
    expect(leerMonto("1.500.000")).toBe(1_500_000);
    expect(leerMonto("1,500,000")).toBe(1_500_000);
    expect(leerMonto("1 500 000")).toBe(1_500_000);
    expect(leerMonto("Gs. 45.000")).toBe(45_000);
    expect(leerMonto("")).toBeNull();
    expect(leerMonto("abc")).toBeNull();
  });
  it("negativo solo si se permite", () => {
    expect(leerMonto("-500")).toBe(500);
    expect(leerMonto("-500", true)).toBe(-500);
  });
});

describe("formato", () => {
  it("miles con punto", () => {
    expect(fmtMiles(1_500_000)).toBe("1.500.000");
    expect(fmtCant(-1500.5)).toBe("-1.500,5");
  });
});
