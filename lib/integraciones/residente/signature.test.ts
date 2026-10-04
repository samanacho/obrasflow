import { describe, expect, it } from "vitest";
import { signBody, verifySignature } from "./signature";

// Firma del webhook de Residente de Obra: "sha256=<HMAC del cuerpo crudo>".

const secreto = "secreto-de-prueba";
const cuerpo = JSON.stringify({ id: "evt_1", event: "parte.cerrado", data: { obra: { codigo: "OBRA-PRUEBA" } } });

describe("verifySignature", () => {
  it("acepta la firma correcta", () => {
    expect(verifySignature(cuerpo, signBody(cuerpo, secreto), secreto)).toBe(true);
  });

  it("acepta la firma con espacios alrededor", () => {
    expect(verifySignature(cuerpo, `  ${signBody(cuerpo, secreto)} `, secreto)).toBe(true);
  });

  it("sin header → no", () => {
    expect(verifySignature(cuerpo, null, secreto)).toBe(false);
    expect(verifySignature(cuerpo, "", secreto)).toBe(false);
  });

  it("largo distinto → no (sin tirar error)", () => {
    expect(verifySignature(cuerpo, "sha256=abc", secreto)).toBe(false);
  });

  it("otro secreto o cuerpo cambiado → no", () => {
    expect(verifySignature(cuerpo, signBody(cuerpo, "otro"), secreto)).toBe(false);
    expect(verifySignature(cuerpo + " ", signBody(cuerpo, secreto), secreto)).toBe(false);
  });
});
