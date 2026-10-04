import { describe, expect, it } from "vitest";
import { estaEnPersonal, usuariosPersonal } from "./personal";

describe("usuariosPersonal (quién ve Personal, desde PERSONAL_USUARIOS)", () => {
  it("sin definir o vacía: null (rige la regla del primer usuario)", () => {
    for (const v of [undefined, "", "   ", ",", " , ,"]) expect(usuariosPersonal(v)).toBeNull();
  });
  it("separa por coma y normaliza como al ingresar", () => {
    expect(usuariosPersonal(" Ignacio , hugo.r ,,")).toEqual(["ignacio", "hugo.r"]);
    expect(usuariosPersonal("Ignácio")).toEqual(["ignacio"]);
  });
  it("sin repetidos", () => {
    expect(usuariosPersonal("ignacio,IGNACIO")).toEqual(["ignacio"]);
  });
});

describe("estaEnPersonal", () => {
  const lista = ["ignacio", "hugo"];
  it("acepta a los de la lista aunque escriban distinto", () => {
    expect(estaEnPersonal("ignacio", lista)).toBe(true);
    expect(estaEnPersonal(" Hugo ", lista)).toBe(true);
  });
  it("rechaza al resto y al usuario vacío", () => {
    expect(estaEnPersonal("pedro", lista)).toBe(false);
    expect(estaEnPersonal("", lista)).toBe(false);
    expect(estaEnPersonal("ignacio2", lista)).toBe(false);
  });
});
