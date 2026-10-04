import { describe, expect, it } from "vitest";
import { CompraError, compararPresupuesto, requiereNuevaAprobacion, validarIva, validarPago, type ItemPresupuesto, type RenglonComparable } from "./calculos";

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

  it("rechaza montos infinitos o que no entran en la base", () => {
    const aprobado = { status: "aprobado", numero: 1, projectId: "obra" };
    expect(() => validarPago(aprobado, Infinity)).toThrow(CompraError);
    expect(() => validarPago(aprobado, 1_000_000_000_000)).toThrow("demasiado grande");
    expect(validarPago(aprobado, 999_999_999_999)).toBe(999_999_999_999);
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

describe("validarIva", () => {
  it("acepta el IVA que corresponde al total, con margen de redondeo", () => {
    expect(() => validarIva(1_100_000, 100_000, null)).not.toThrow();
    expect(() => validarIva(1_050_000, null, 50_000)).not.toThrow();
    expect(() => validarIva(1_000_000, 90_910, null)).not.toThrow();
    expect(() => validarIva(1_000_000, null, null)).not.toThrow();
  });

  it("rechaza un IVA más grande que lo posible para ese total", () => {
    expect(() => validarIva(1_100_000, 110_000, null)).toThrow(CompraError);
    expect(() => validarIva(1_050_000, null, 100_000)).toThrow("IVA 5 %");
  });
});

describe("requiereNuevaAprobacion (editar un pedido aprobado)", () => {
  const r = (over: Partial<RenglonComparable> = {}): RenglonComparable => ({ descripcion: "Cemento", unidad: "bolsa", cantidad: 50, budgetItemId: "cem", ...over });
  const antes = { projectId: "obra1", lines: [r(), r({ descripcion: "Varilla 10mm", unidad: null, cantidad: 20, budgetItemId: null })] };

  it("sin cambios de materiales ni obra no pide aprobar de nuevo", () => {
    expect(requiereNuevaAprobacion(antes, { projectId: "obra1", lines: antes.lines.map((l) => ({ ...l })) })).toBe(false);
  });
  it("espacios, mayúsculas, el orden de los renglones o 50 vs 50,0 no cuentan", () => {
    const mismos = [r({ descripcion: "Varilla  10mm ", unidad: null, cantidad: 20.0, budgetItemId: null }), r({ descripcion: "cemento", unidad: " Bolsa" })];
    expect(requiereNuevaAprobacion(antes, { projectId: "obra1", lines: mismos })).toBe(false);
  });
  it("cambiar una cantidad pide aprobar de nuevo", () => {
    expect(requiereNuevaAprobacion(antes, { projectId: "obra1", lines: [r({ cantidad: 60 }), antes.lines[1]] })).toBe(true);
    expect(requiereNuevaAprobacion(antes, { projectId: "obra1", lines: [r({ cantidad: 50.5 }), antes.lines[1]] })).toBe(true);
  });
  it("cambiar, agregar o sacar un material pide aprobar de nuevo", () => {
    expect(requiereNuevaAprobacion(antes, { projectId: "obra1", lines: [r({ descripcion: "Cal" }), antes.lines[1]] })).toBe(true);
    expect(requiereNuevaAprobacion(antes, { projectId: "obra1", lines: [...antes.lines, r({ descripcion: "Arena" })] })).toBe(true);
    expect(requiereNuevaAprobacion(antes, { projectId: "obra1", lines: [antes.lines[0]] })).toBe(true);
  });
  it("cambiar la unidad o el ítem del presupuesto pide aprobar de nuevo", () => {
    expect(requiereNuevaAprobacion(antes, { projectId: "obra1", lines: [r({ unidad: "kg" }), antes.lines[1]] })).toBe(true);
    expect(requiereNuevaAprobacion(antes, { projectId: "obra1", lines: [r({ budgetItemId: null }), antes.lines[1]] })).toBe(true);
  });
  it("cambiar la obra (o quitarla) pide aprobar de nuevo", () => {
    expect(requiereNuevaAprobacion(antes, { projectId: "obra2", lines: antes.lines })).toBe(true);
    expect(requiereNuevaAprobacion(antes, { projectId: null, lines: antes.lines })).toBe(true);
  });
});
