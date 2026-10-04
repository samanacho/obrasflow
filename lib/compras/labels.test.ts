import { describe, expect, it } from "vitest";
import { fmtCant, fmtMiles, parseGs, parseNumero } from "./labels";

describe("parseNumero (cantidades y números escritos a mano)", () => {
  it("formato de Paraguay e internacional", () => {
    expect(parseNumero("1.500.000")).toBe(1_500_000);
    expect(parseNumero("Gs. 45.000")).toBe(45_000);
    expect(parseNumero("1.234,50")).toBe(1234.5);
    expect(parseNumero("1,234.50")).toBe(1234.5);
    expect(parseNumero("1 500 000")).toBe(1_500_000);
    expect(parseNumero("2,5")).toBe(2.5);
    expect(parseNumero(3)).toBe(3);
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

describe("formato", () => {
  it("miles con punto", () => {
    expect(fmtMiles(1_500_000)).toBe("1.500.000");
    expect(fmtCant(-1500.5)).toBe("-1.500,5");
  });
});
