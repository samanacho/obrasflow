import { describe, expect, it } from "vitest";
import { celdasDeTexto, leerPlanilla } from "./planilla";

describe("leerPlanilla (presupuesto pegado de Excel)", () => {
  it("reconoce títulos, grupos y subtotales", () => {
    const r = leerPlanilla([
      ["Código", "Descripción", "Unidad", "Cantidad", "Precio unitario"],
      ["1", "OBRAS PRELIMINARES", "", "", ""],
      ["1.1", "Cemento", "bolsa", "100", "60.000"],
      ["", "Subtotal", "", "", "6.000.000"],
    ]);
    expect(r.conTitulos).toBe(true);
    expect(r.filas.map((f) => f.tipo)).toEqual(["titulo", "item"]);
    expect(r.filas[1]).toMatchObject({ descripcion: "Cemento", cantidad: 100, precioUnitario: 60_000, categoria: "OBRAS PRELIMINARES" });
  });

  it("'Cant. total' es la cantidad, no el total", () => {
    const r = leerPlanilla([
      ["Descripción", "Cant. total", "Precio unitario"],
      ["Cemento", "100", "60.000"],
    ]);
    expect(r.columnas).toEqual(["descripcion", "cantidad", "precioUnitario"]);
    expect(r.filas[0].tipo).toBe("item");
  });

  it("precios en guaraníes con coma de miles y precio sacado del total", () => {
    const r = leerPlanilla([
      ["Descripción", "Cantidad", "Precio unitario", "Total"],
      ["Arena", "3", "150,000", ""],
      ["Piedra", "3", "", "1.000.000"],
    ]);
    expect(r.filas[0].precioUnitario).toBe(150_000);
    expect(r.filas[1].precioUnitario).toBe(333_333);
  });

  it("sin títulos supone el orden por cantidad de columnas", () => {
    const r = leerPlanilla([["Cemento", "bolsa", "100", "60000"]]);
    expect(r.conTitulos).toBe(false);
    expect(r.filas[0]).toMatchObject({ descripcion: "Cemento", unidad: "bolsa", cantidad: 100, precioUnitario: 60_000 });
  });

  it("un capítulo con su subtotal es título de grupo, no un ítem sin cantidad", () => {
    const r = leerPlanilla([
      ["Código", "Descripción", "Unidad", "Cantidad", "Precio unitario", "Total"],
      ["1", "OBRAS PRELIMINARES", "", "", "", "15.000.000"],
      ["1.1", "Limpieza del terreno", "m2", "500", "30.000", "15.000.000"],
      ["2", "Excavación", "m3", "", "", "2.000.000"], // con unidad: es un ítem al que le falta la cantidad
    ]);
    expect(r.filas.map((f) => f.tipo)).toEqual(["titulo", "item", "error"]);
    expect(r.filas[0].categoria).toBe("OBRAS PRELIMINARES");
    expect(r.filas[1]).toMatchObject({ cantidad: 500, precioUnitario: 30_000, categoria: "OBRAS PRELIMINARES" });
    expect(r.filas[2].error).toBe("Falta la cantidad");
  });
});

describe("celdasDeTexto", () => {
  it("respeta comillas y detecta el separador", () => {
    expect(celdasDeTexto('a;"1.234,5";3')).toEqual([["a", "1.234,5", "3"]]);
    expect(celdasDeTexto("a\tb\r\nc\td")).toEqual([["a", "b"], ["c", "d"]]);
  });
});
