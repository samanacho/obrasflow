import { createHmac } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { verifyMetaSignature } from "./signature";
import { isAffirmative, isNegative, parseButtonId } from "./confirm";
import { getAllowedNumbers, normalizePhone } from "./config";

describe("verifyMetaSignature (webhook de Meta)", () => {
  const body = '{"entry":[]}';
  const firma = "sha256=" + createHmac("sha256", "secreto").update(body).digest("hex");
  it("acepta la firma correcta (también en mayúsculas)", () => {
    expect(verifyMetaSignature(body, firma, "secreto")).toBe(true);
    expect(verifyMetaSignature(body, "sha256=" + firma.slice(7).toUpperCase(), "secreto")).toBe(true);
  });
  it("rechaza todo lo demás", () => {
    expect(verifyMetaSignature(body + " ", firma, "secreto")).toBe(false);
    expect(verifyMetaSignature(body, firma, "otro")).toBe(false);
    expect(verifyMetaSignature(body, firma.slice(7), "secreto")).toBe(false);
    expect(verifyMetaSignature(body, firma.slice(0, -1), "secreto")).toBe(false);
    expect(verifyMetaSignature(body, null, "secreto")).toBe(false);
  });
});

describe("confirmar escribiendo", () => {
  it("solo un sí o un no cortos", () => {
    for (const t of ["Sí!", "si dale", "OK", "confirmo"]) expect(isAffirmative(t)).toBe(true);
    expect(isAffirmative("sí, pero eran 600 mil")).toBe(false);
    for (const t of ["No", "cancelar", "NO GRACIAS"]) expect(isNegative(t)).toBe(true);
    expect(isNegative("no sé")).toBe(false);
  });
  it("botones", () => {
    expect(parseButtonId("confirm:abcdefghij12")).toEqual({ op: "confirm", actionId: "abcdefghij12" });
    expect(parseButtonId("confirm:abc")).toBeNull();
    expect(parseButtonId("borrar:abcdefghij12")).toBeNull();
  });
});

describe("números de teléfono", () => {
  const original = process.env.WHATSAPP_ALLOWED_NUMBERS;
  afterEach(() => {
    process.env.WHATSAPP_ALLOWED_NUMBERS = original;
  });
  it("normaliza como los manda WhatsApp", () => {
    expect(normalizePhone("+595 (0)981 123-456")).toBe("595981123456");
    expect(normalizePhone("00595981123456")).toBe("595981123456");
  });
  it("lista de autorizados con nombre", () => {
    process.env.WHATSAPP_ALLOWED_NUMBERS = "595981111111:Ignacio Samaniego, +595 982 222222:Hugo: socio";
    const m = getAllowedNumbers();
    expect(m.get("595981111111")).toBe("Ignacio Samaniego");
    expect(m.get("595982222222")).toBe("Hugo: socio");
  });
});
