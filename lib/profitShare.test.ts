import { describe, expect, it } from "vitest";
import { buildBeneficioSources, splitSource, summarizeProfitShare } from "./profitShare";
import { fmtGs } from "./agent/format";
import type { GeneralMovementDTO, ProjectDTO } from "./types";

const obra = (o: Partial<ProjectDTO>) => ({ id: "o", name: "Obra", budget: 0, spent: 0, manager: "Ana", sitioId: null, ...o }) as ProjectDTO;
const mov = (o: Partial<GeneralMovementDTO>) => ({ id: "m", concepto: "x", fecha: "2026-10-01", monto: 0, responsable: null, ...o }) as GeneralMovementDTO;

describe("reparto de beneficios", () => {
  it("15 % para el responsable y el resto 55/45 entre socios", () => {
    const s = splitSource({ id: "o", kind: "obra", label: "", href: "", fecha: null, beneficio: 1_000_000, responsable: "Ana" });
    expect(s.responsableMonto).toBeCloseTo(150_000);
    expect(s.restante).toBeCloseTo(850_000);
    expect(s.partnerMontos.map((p) => p.monto)).toEqual([467_500, 382_500].map((n) => expect.closeTo(n)));
  });
  it("un egreso general no toca el 15 % de nadie", () => {
    const s = splitSource({ id: "e", kind: "egreso", label: "", href: "", fecha: null, beneficio: -100, responsable: null });
    expect(s.responsableMonto).toBeCloseTo(0);
    expect(s.partnerMontos.map((p) => p.monto)).toEqual([expect.closeTo(-55), expect.closeTo(-45)]);
  });
  it("las obras de un mismo sitio son una sola fuente", () => {
    const fuentes = buildBeneficioSources(
      [obra({ id: "a", sitioId: "s", budget: 100, sitioNombre: "Sitio X", sitioResponsable: "Luis" } as any), obra({ id: "b", sitioId: "s", budget: 50 }), obra({ id: "c", budget: 10 })],
      [mov({ id: "i", tipo: "ingreso", monto: 30 } as any), mov({ id: "g", tipo: "egreso", monto: 5 } as any)]
    );
    expect(fuentes.map((f) => [f.kind, f.beneficio])).toEqual([["obra", 10], ["sitio", 150], ["ingreso", 30], ["egreso", -5]]);
    expect(fuentes[1].responsable).toBe("Luis");
  });
  it("el total suma todas las fuentes", () => {
    const r = summarizeProfitShare([obra({ budget: 1000, spent: 400 })], [mov({ tipo: "egreso", monto: 100 } as any)]);
    expect(r.totalBeneficio).toBe(500);
    expect(r.porResponsable.get("Ana")).toBeCloseTo(90);
  });
});

describe("fmtGs (textos de Memby)", () => {
  it("guaraníes enteros con punto de miles", () => {
    expect(fmtGs(1_500_000)).toBe("Gs. 1.500.000");
    expect(fmtGs(-500)).toBe("-Gs. 500");
    expect(fmtGs(1499.6)).toBe("Gs. 1.500");
  });
});
