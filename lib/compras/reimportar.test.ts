import { describe, expect, it } from "vitest";
import { armarPlan, compararConExistentes, decisionSugerida, type FilaNueva, type ItemExistente } from "./reimportar";

const fila = (o: Partial<FilaNueva>): FilaNueva => ({ codigo: null, descripcion: "Cemento", unidad: "bolsa", cantidad: 100, precioUnitario: 60_000, categoria: null, ...o });
const item = (o: Partial<ItemExistente>): ItemExistente => ({ ...fila({}), id: "c1", pedidos: 0, pedido: 0, ...o });

describe("compararConExistentes", () => {
  it("el ejemplo del cemento: cambió la cantidad → se pregunta, y por defecto se actualiza el mismo ítem", () => {
    const existentes = [item({ id: "cem", pedidos: 1, pedido: 50 }), item({ id: "are", descripcion: "Arena", unidad: "m3", cantidad: 10, precioUnitario: 150_000 })];
    const c = compararConExistentes(existentes, [fila({ cantidad: 120 }), fila({ descripcion: "Arena", unidad: "m3", cantidad: 10, precioUnitario: 150_000 })]);
    expect(c.filas.map((f) => f.tipo)).toEqual(["cambio", "igual"]);
    expect(c.filas[0].cambios).toEqual([{ campo: "cantidad", antes: 100, despues: 120 }]);
    expect(decisionSugerida(c.filas[0])).toEqual({ accion: "actualizar", id: "cem" });
    expect(c.faltantes).toEqual([]);

    const r = armarPlan(c, c.filas.map(decisionSugerida), new Set());
    expect(r).toEqual({ plan: { agregar: [], actualizar: [{ ...fila({ cantidad: 120 }), id: "cem" }], borrar: [] } });
  });

  it("el código manda sobre la descripción", () => {
    const c = compararConExistentes([item({ id: "a", codigo: "1.1", descripcion: "Cemento CP-II" })], [fila({ codigo: "1.1.", descripcion: "Cemento Portland" })]);
    expect(c.filas[0]).toMatchObject({ tipo: "cambio", por: "codigo" });
  });

  it("sin código, compara la descripción sin tildes ni mayúsculas", () => {
    const c = compararConExistentes([item({ descripcion: "Excavación  manual" })], [fila({ descripcion: "excavacion manual" })]);
    expect(c.filas[0]).toMatchObject({ tipo: "igual", por: "descripcion" });
  });

  it("varios candidatos: desempata por capítulo y, si no alcanza, pregunta", () => {
    const existentes = [item({ id: "x", categoria: "Fundación" }), item({ id: "y", categoria: "Mampostería" })];
    expect(compararConExistentes(existentes, [fila({ categoria: "Mampostería" })]).filas[0]).toMatchObject({ tipo: "igual" });
    const amb = compararConExistentes(existentes, [fila({})]);
    expect(amb.filas[0].tipo).toBe("ambiguo");
    expect(decisionSugerida(amb.filas[0])).toBeNull();
    expect(armarPlan(amb, [null], new Set())).toEqual({ error: 'Falta decidir qué hacer con "Cemento".' });
    expect(armarPlan(amb, [{ accion: "actualizar", id: "y" }], new Set())).toMatchObject({ plan: { actualizar: [{ id: "y" }] } });
  });

  it("lo nuevo se agrega y lo que ya no está se ofrece para borrar (si no tiene pedidos)", () => {
    const existentes = [item({ id: "viejo", descripcion: "Pintura" }), item({ id: "conPedido", descripcion: "Ladrillo", pedidos: 2 })];
    const c = compararConExistentes(existentes, [fila({ descripcion: "Arena" })]);
    expect(c.filas[0].tipo).toBe("nuevo");
    expect(c.faltantes.map((f) => f.id)).toEqual(["viejo", "conPedido"]);
    expect(armarPlan(c, c.filas.map(decisionSugerida), new Set(["viejo"]))).toMatchObject({ plan: { agregar: [{ descripcion: "Arena" }], borrar: ["viejo"] } });
    expect(armarPlan(c, c.filas.map(decisionSugerida), new Set(["conPedido"]))).toHaveProperty("error");
  });

  it("avisa si la cantidad nueva es menor a lo ya pedido", () => {
    const c = compararConExistentes([item({ pedido: 80, pedidos: 1 })], [fila({ cantidad: 60 })]);
    expect(c.filas[0].avisos[0]).toContain("Ya se pidieron 80");
  });

  it("dos filas no pueden actualizar el mismo ítem", () => {
    const c = compararConExistentes([item({ id: "c" })], [fila({ cantidad: 1 }), fila({ cantidad: 2 })]);
    expect(c.filas[1].avisos).toContain("Otra fila de la planilla también coincide con este ítem.");
    expect(armarPlan(c, c.filas.map(decisionSugerida), new Set())).toHaveProperty("error");
    expect(armarPlan(c, [{ accion: "actualizar", id: "c" }, { accion: "agregar" }], new Set())).toMatchObject({ plan: { actualizar: [{ cantidad: 1 }], agregar: [{ cantidad: 2 }] } });
  });

  it("el precio se compara en guaraníes enteros", () => {
    const c = compararConExistentes([item({ precioUnitario: 60_000 })], [fila({ precioUnitario: 60_000.4 })]);
    expect(c.filas[0].tipo).toBe("igual");
  });
});
