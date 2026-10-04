import { describe, expect, it } from "vitest";
import { isPurchaseRequest, parseFecha, parseLine, parsePurchaseRequest } from "./parse";

describe("parseLine (renglones de un pedido de compra)", () => {
  it("formatos acordados con obra", () => {
    expect(parseLine("- 50 bolsas de cemento")).toEqual({ cantidad: 50, unidad: "bolsa", descripcion: "cemento" });
    expect(parseLine("- 20 varillas 10 mm")).toEqual({ cantidad: 20, unidad: "varilla", descripcion: "varillas 10 mm" });
    expect(parseLine("1.500 ladrillos")?.cantidad).toBe(1500);
    expect(parseLine("2,5 m3 de arena")).toEqual({ cantidad: 2.5, unidad: "m3", descripcion: "arena" });
    expect(parseLine("cemento: 50")).toEqual({ cantidad: 50, unidad: null, descripcion: "cemento" });
    expect(parseLine("Hierro del 8 - 30 varillas")).toEqual({ cantidad: 30, unidad: "varilla", descripcion: "Hierro del 8" });
    expect(parseLine("- arena lavada")).toBeNull();
  });

  it("un número que es una medida no se toma como cantidad", () => {
    expect(parseLine("10mm varilla x 20")).toEqual({ cantidad: 20, unidad: null, descripcion: "10mm varilla" });
    // Ambiguos: mejor no adivinar (antes daban cantidad 1 y 3).
    expect(parseLine("1/2 m3 de arena")).toBeNull();
    expect(parseLine("3 x 2 mts de malla")).toBeNull();
  });
});

describe("parseFecha", () => {
  const hoy = "2026-10-04";
  it("formatos comunes", () => {
    expect(parseFecha("04/10", hoy)).toBe("2026-10-04");
    expect(parseFecha("2026-10-04", hoy)).toBe("2026-10-04");
    expect(parseFecha("hoy", hoy)).toBe(hoy);
    expect(parseFecha("mañana", hoy)).toBe("2026-10-05");
    expect(parseFecha("4/10/26", hoy)).toBe("2026-10-04");
  });
  it("una fecha que no existe → null", () => {
    expect(parseFecha("31/02", hoy)).toBeNull();
  });
  it("sin año y muy en el pasado es del año que viene", () => {
    expect(parseFecha("05/01", "2026-12-20")).toBe("2027-01-05");
    expect(parseFecha("01/10", hoy)).toBe("2026-10-01"); // hace 3 días: mismo año
  });
});

describe("parsePurchaseRequest", () => {
  it("el formato de ejemplo completo", () => {
    const r = parsePurchaseRequest(
      ["*Pedido de compra*", "Obra: Sucursal Norte", "Fecha: 06/10", "- 50 bolsas de cemento", "- 20 varillas 10 mm", "Proveedor: Ferretería X", "Nota: a la mañana"].join("\n"),
      "2026-10-04"
    );
    expect(r.obra).toBe("Sucursal Norte");
    expect(r.proveedor).toBe("Ferretería X");
    expect(r.fechaNecesaria).toBe("2026-10-06");
    expect(r.lineas).toHaveLength(2);
    expect(r.notas).toBe("a la mañana");
  });
  it("reconoce el encabezado", () => {
    expect(isPurchaseRequest("*Pedido de compra*\n- 1 bolsa")).toBe(true);
    expect(isPurchaseRequest("Pedidos de compras:")).toBe(true);
    expect(isPurchaseRequest("hola, un pedido de compra")).toBe(false);
  });
});
