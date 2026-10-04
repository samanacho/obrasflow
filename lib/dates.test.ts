import { describe, expect, it } from "vitest";
import { daysBetween, fmtYmd, isValidYmd, parseLotDates, parseOptionalYmd, weekdayOf } from "./dates";

describe("isValidYmd", () => {
  it("acepta solo fechas que existen en el calendario", () => {
    expect(isValidYmd("2026-10-04")).toBe(true);
    expect(isValidYmd("2028-02-29")).toBe(true); // bisiesto
    expect(isValidYmd("2026-02-29")).toBe(false);
    expect(isValidYmd("2026-02-30")).toBe(false); // new Date() lo pasaba a 2 de marzo
    expect(isValidYmd("2026-13-01")).toBe(false);
    expect(isValidYmd("04/10/2026")).toBe(false);
    expect(isValidYmd("")).toBe(false);
    expect(isValidYmd(null)).toBe(false);
  });
});

describe("parseOptionalYmd", () => {
  it("vacío → null, válida → Date a medianoche UTC, cualquier otra cosa → undefined (400)", () => {
    expect(parseOptionalYmd(undefined)).toBeNull();
    expect(parseOptionalYmd("")).toBeNull();
    expect(parseOptionalYmd("2026-10-04")?.toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(parseOptionalYmd("2026-10-04T15:00:00Z")?.toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(parseOptionalYmd("abc")).toBeUndefined();
    expect(parseOptionalYmd("04/10/2026")).toBeUndefined(); // antes se leía como 10 de abril
  });
});

describe("parseLotDates", () => {
  it("exige la fecha de colado y valida las opcionales", () => {
    expect(parseLotDates({})).toEqual({ error: "La fecha de colado es inválida." });
    expect(parseLotDates({ fechaColado: "2026-10-04", fechaDesmolde: "x" })).toEqual({ error: "La fecha de desmolde es inválida." });
    const ok = parseLotDates({ fechaColado: "2026-10-04", andeFecha: "" });
    expect("error" in ok).toBe(false);
    if (!("error" in ok)) {
      expect(ok.fechaColado.toISOString().slice(0, 10)).toBe("2026-10-04");
      expect(ok.fechaDesmolde).toBeNull();
      expect(ok.andeFecha).toBeNull();
    }
  });
});

describe("días y formato", () => {
  it("cuenta días calendario sin huso horario", () => {
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
    expect(daysBetween("2026-10-04", "2026-10-04")).toBe(0);
    expect(daysBetween("2026-10-05", "2026-10-04")).toBe(-1);
  });
  it("día de la semana y DD/MM/YYYY", () => {
    expect(weekdayOf("2026-10-04")).toBe("domingo");
    expect(fmtYmd("2026-10-04T10:00:00Z")).toBe("04/10/2026");
    expect(fmtYmd("abc")).toBe("abc");
  });
});
