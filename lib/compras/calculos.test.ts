import { describe, expect, it } from "vitest";
import { CompraError, compararPresupuesto, validarPago, type ItemPresupuesto } from "./calculos";

const item = (over: Partial<ItemPresupuesto>): ItemPresupuesto => ({
  id: "cemento",
  codigo: null,
  descripcion: "Cemento Portland",
  unidad: "bolsa",
  cantidad: 100,
  precioUnitario: 60_000,
  categoria: null,
  orden: 0,
  ...over,
});

describe("validarPago", () => {
  it("solo deja pagar un pedido aprobado y con obra", () => {
    expect(() => validarPago({ status: "pendiente", numero: 1, projectId: "obra" }, 100)).toThrow("Primero hay que aprobar");
    for (const status of ["rechazado", "pagado", "anulado"]) {
      expect(() => validarPago({ status, numero: 7, projectId: "obra" }, 100)).toThrow(CompraError);
    }
    expect(() => validarPago({ status: "aprobado", numero: 1, projectId: null }, 100)).toThrow("Elegí a qué obra");
  });

  it("redondea a guaraníes enteros y rechaza montos en cero o negativos", () => {
    const aprobado = { status: "aprobado", numero: 1, projectId: "obra" };
    expect(validarPago(aprobado, 1_500_000.6)).toBe(1_500_001);
    expect(() => validarPago(aprobado, 0)).toThrow("mayor a cero");
    expect(() => validarPago(aprobado, -5)).toThrow("mayor a cero");
    expect(() => validarPago(aprobado, Number.NaN)).toThrow("mayor a cero");
  });
});

describe("compararPresupuesto", () => {
  it("lo gastado usa el precio real cargado o, si falta, el del presupuesto; lo aprobado sin pagar no es gasto", () => {
    const r = compararPresupuesto(
      [item({})],
      [
        { budgetItemId: "cemento", cantidad: 10, precioUnitario: 62_000, status: "pagado" },
        { budgetItemId: "cemento", cantidad: 5, precioUnitario: null, status: "pagado" },
        { budgetItemId: "cemento", cantidad: 20, precioUnitario: null, status: "aprobado" },
      ]
    );
    const fila = r.items[0];
    expect(fila.pedido).toBe(35);
    expect(fila.comprado).toBe(15);
    expect(fila.gastado).toBe(10 * 62_000 + 5 * 60_000);
    expect(fila.precioReal).toBe(62_000);
    expect(r.totales).toEqual({ presupuestado: 6_000_000, pedido: 35 * 60_000, gastado: 920_000 });
  });

  it("avisa cuando se pide más de lo presupuestado, cuando falta poco y cuando el precio sube más de 5 %", () => {
    const r = compararPresupuesto(
      [item({ id: "pasado" }), item({ id: "cerca" }), item({ id: "precio" }), item({ id: "ok" })],
      [
        { budgetItemId: "pasado", cantidad: 101, precioUnitario: null, status: "aprobado" },
        { budgetItemId: "cerca", cantidad: 90, precioUnitario: null, status: "aprobado" },
        { budgetItemId: "precio", cantidad: 10, precioUnitario: 63_001, status: "pagado" },
        { budgetItemId: "ok", cantidad: 10, precioUnitario: 63_000, status: "pagado" },
      ]
    );
    expect(r.items.map((f) => [f.id, f.alerta])).toEqual([
      ["pasado", "pasado"],
      ["cerca", "cerca"],
      ["precio", "precio"],
      ["ok", "ok"],
    ]);
  });

  it("una obra sin pedidos queda en cero y suma bien el presupuesto con decimales", () => {
    const r = compararPresupuesto([item({ cantidad: 2.5, precioUnitario: 33_333 }), item({ id: "arena", cantidad: 3, precioUnitario: 150_000 })], []);
    expect(r.items.every((f) => f.pedido === 0 && f.gastado === 0 && f.alerta === "ok")).toBe(true);
    expect(r.items[0].total).toBe(83_333);
    expect(r.totales).toEqual({ presupuestado: Math.round(2.5 * 33_333 + 450_000), pedido: 0, gastado: 0 });
  });
});
