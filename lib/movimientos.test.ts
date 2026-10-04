import { describe, expect, it } from "vitest";
import {
  aporteAlEjecutado,
  calcularEjecutado,
  cuentaEnEjecutado,
  efectoDelTipo,
  efectoMovimiento,
  esPendiente,
  resumenPendientes,
} from "./movimientos";

describe("cuentaEnEjecutado", () => {
  it("solo un Pendiente queda afuera (sin importar mayúsculas ni espacios)", () => {
    expect(cuentaEnEjecutado("Pendiente")).toBe(false);
    expect(cuentaEnEjecutado(" pendiente ")).toBe(false);
    expect(cuentaEnEjecutado("PENDIENTE")).toBe(false);
    expect(esPendiente("Pendiente")).toBe(true);
  });

  it("Pagado, Conciliado y los registros viejos sin estado cuentan", () => {
    expect(cuentaEnEjecutado("Pagado")).toBe(true);
    expect(cuentaEnEjecutado("Conciliado")).toBe(true);
    expect(cuentaEnEjecutado(null)).toBe(true);
    expect(cuentaEnEjecutado(undefined)).toBe(true);
    expect(cuentaEnEjecutado("")).toBe(true);
    expect(cuentaEnEjecutado("   ")).toBe(true);
  });
});

describe("efectoMovimiento", () => {
  it("toma el efecto del tipo cuando está pagado", () => {
    expect(efectoMovimiento("Gasto", "Pagado")).toBe(1);
    expect(efectoMovimiento("Adelanto", null)).toBe(1);
    expect(efectoMovimiento("Pago / certificación de avance", "Conciliado")).toBe(1);
    expect(efectoMovimiento("Devolución", "Pagado")).toBe(-1);
    expect(efectoMovimiento("Orden de cambio", "Pagado")).toBe(0);
    expect(efectoMovimiento("Ingreso de capital", "Pagado")).toBe(0);
    expect(efectoMovimiento("Tipo inventado", "Pagado")).toBe(0);
    expect(efectoMovimiento(undefined, "Pagado")).toBe(0);
  });

  it("un pendiente no mueve nada, sea del tipo que sea", () => {
    expect(efectoMovimiento("Gasto", "Pendiente")).toBe(0);
    expect(efectoMovimiento("Devolución", "pendiente")).toBe(0);
    expect(efectoDelTipo("Gasto")).toBe(1); // pero pagado sí sumaría
  });
});

describe("calcularEjecutado", () => {
  it("suma gastos pagados, resta devoluciones y saltea pendientes", () => {
    const items = [
      { status: "Pagado", data: { tipo: "Gasto", monto: 1_000_000 } },
      { status: null, data: { tipo: "Adelanto", monto: 500_000 } },
      { status: "Conciliado", data: { tipo: "Devolución", monto: 200_000 } },
      { status: "Pendiente", data: { tipo: "Gasto", monto: 9_000_000 } },
      { status: "Pagado", data: { tipo: "Orden de cambio", monto: 7_000_000 } },
      { status: "Pagado", data: { tipo: "Gasto", monto: "no es número" } },
      { status: "Pagado", data: null },
    ];
    expect(calcularEjecutado(items)).toBe(1_300_000);
  });

  it("nunca da negativo", () => {
    expect(calcularEjecutado([{ status: "Pagado", data: { tipo: "Devolución", monto: 100 } }])).toBe(0);
    expect(calcularEjecutado([])).toBe(0);
  });

  it("marcar pagado un pendiente lo suma", () => {
    const pendiente = { status: "Pendiente", data: { tipo: "Gasto", monto: 300 } };
    expect(aporteAlEjecutado(pendiente)).toBe(0);
    expect(aporteAlEjecutado({ ...pendiente, status: "Pagado" })).toBe(300);
  });
});

describe("resumenPendientes", () => {
  it("cuenta solo los pendientes que sumarían o restarían al pagarse", () => {
    const r = resumenPendientes([
      { status: "Pendiente", data: { tipo: "Gasto", monto: 1_000 } },
      { status: "Pendiente", data: { tipo: "Adelanto", monto: 500 } },
      { status: "Pendiente", data: { tipo: "Orden de cambio", monto: 99_999 } },
      { status: "Pagado", data: { tipo: "Gasto", monto: 7_000 } },
    ]);
    expect(r).toEqual({ cantidad: 2, monto: 1_500 });
  });
});
