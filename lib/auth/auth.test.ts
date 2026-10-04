import { afterEach, describe, expect, it } from "vitest";
import { newSession, readSession, safeReturnPath, signSession } from "./token";
import { localRequestAllowed } from "./local";
import { DUMMY_HASH, hashPassword, normalizeUsername, passwordProblem, verifyPassword } from "./password";
import { volverSeguro } from "../ui/session";

describe("safeReturnPath / volverSeguro (a dónde volver después de ingresar)", () => {
  it("deja las rutas internas", () => {
    expect(safeReturnPath("/compras?estado=pendiente")).toBe("/compras?estado=pendiente");
  });
  it("nunca manda a otro sitio", () => {
    for (const p of [null, "", "compras", "//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "https://evil.com", "/a\\b"]) {
      expect(safeReturnPath(p)).toBe("/");
    }
    // El navegador borra el tab: "/\t/evil.com" era "//evil.com".
    expect(new URL(safeReturnPath("/\t/evil.com"), "https://app.test").origin).toBe("https://app.test");
  });
  it("no vuelve a la propia pantalla de ingreso", () => {
    expect(volverSeguro("/ingresar?volver=/x")).toBe("/");
    expect(volverSeguro("/obras")).toBe("/obras");
  });
});

describe("localRequestAllowed (app local sin login)", () => {
  it("acepta lo que viene de la propia PC", () => {
    expect(localRequestAllowed("GET", "localhost:3000", null, null)).toBe(true);
    expect(localRequestAllowed("POST", "127.0.0.1:3000", "http://localhost:3000", "same-origin")).toBe(true);
    expect(localRequestAllowed("POST", "localhost", null, null)).toBe(true); // scripts de la PC (sin Origin)
  });
  it("rechaza pedidos de otras páginas web y Host ajenos (DNS rebinding)", () => {
    expect(localRequestAllowed("POST", "127.0.0.1:3000", "https://evil.com", "cross-site")).toBe(false);
    expect(localRequestAllowed("POST", "127.0.0.1:3000", "https://evil.com", null)).toBe(false);
    expect(localRequestAllowed("POST", "127.0.0.1:3000", null, "cross-site")).toBe(false);
    expect(localRequestAllowed("POST", "127.0.0.1:3000", "null", null)).toBe(false);
    expect(localRequestAllowed("GET", "evil.com", null, null)).toBe(false);
    expect(localRequestAllowed("GET", null, null, null)).toBe(false);
  });
});

describe("sesión firmada", () => {
  const original = process.env.AUTH_SECRET;
  afterEach(() => {
    process.env.AUTH_SECRET = original;
  });

  it("ida y vuelta, y cualquier cambio la invalida", async () => {
    process.env.AUTH_SECRET = "secreto-de-prueba";
    const s = newSession({ id: "u1", name: "Ana" }, true);
    const token = await signSession(s);
    expect(await readSession(token)).toEqual(s);

    const [body, sig] = token.split(".");
    const otro = Buffer.from(JSON.stringify({ ...s, uid: "u2" })).toString("base64url");
    expect(await readSession(`${otro}.${sig}`)).toBeNull();
    expect(await readSession(`${body}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(await readSession("sinpunto")).toBeNull();
    expect(await readSession("x".repeat(2001))).toBeNull();
    expect(await readSession(undefined)).toBeNull();

    process.env.AUTH_SECRET = "otro-secreto";
    expect(await readSession(token)).toBeNull();
  });

  it("'Recordarme' alarga solo el plazo de renovación", () => {
    const corta = newSession({ id: "u", name: "A" }, false);
    const larga = newSession({ id: "u", name: "A" }, true);
    expect(corta.rexp).toBe(corta.exp);
    expect(larga.rexp - larga.exp).toBeGreaterThan(25 * 24 * 3600);
  });
});

describe("contraseñas", () => {
  it("verifica la correcta y rechaza el resto sin tirar error", async () => {
    const h = await hashPassword("una-clave-larga");
    expect(await verifyPassword("una-clave-larga", h)).toBe(true);
    expect(await verifyPassword("otra", h)).toBe(false);
    expect(await verifyPassword("x", DUMMY_HASH)).toBe(false);
    expect(await verifyPassword("x", "sin-dos-puntos")).toBe(false);
  });
  it("reglas y usuario", () => {
    expect(passwordProblem("1234567")).not.toBeNull();
    expect(passwordProblem("12345678")).toBeNull();
    expect(passwordProblem("x".repeat(201))).not.toBeNull();
    expect(normalizeUsername("José Pérez")).toBe("joseperez");
    expect(normalizeUsername("  A.B-c_1 ")).toBe("a.b-c_1");
  });
});
