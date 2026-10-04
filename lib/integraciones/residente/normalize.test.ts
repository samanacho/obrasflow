import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normFecha, normTimestamp, normalizeParte, numero, porcentaje } from "./normalize";
import { leerExport, parseCsv } from "./importar";

// Lógica pura de Residente de Obra (sin base ni red). Corre con TZ=UTC:
// sin zona, la hora se toma como de Paraguay (UTC-3).

describe("normTimestamp", () => {
  it("AAAA-MM-DD HH:MM sin zona → hora de Paraguay", () => {
    expect(normTimestamp("2026-10-01 18:40")).toBe("2026-10-01T21:40:00.000Z");
  });

  it("DD/MM/AAAA HH:MM da lo mismo", () => {
    expect(normTimestamp("01/10/2026 18:40")).toBe("2026-10-01T21:40:00.000Z");
  });

  it("hora de un dígito, con y sin segundos", () => {
    expect(normTimestamp("2026-10-03 9:30:15")).toBe("2026-10-03T12:30:15.000Z");
    expect(normTimestamp("2026-10-03 9:30")).toBe("2026-10-03T12:30:00.000Z");
    expect(normTimestamp("03/10/2026 9:30:15")).toBe("2026-10-03T12:30:15.000Z");
  });

  it("respeta la zona si viene", () => {
    expect(normTimestamp("2026-10-01T18:40:00Z")).toBe("2026-10-01T18:40:00.000Z");
    expect(normTimestamp("2026-10-01 18:40:00-04:00")).toBe("2026-10-01T22:40:00.000Z");
  });

  it("número: segundos o milisegundos desde 1970", () => {
    expect(normTimestamp(1790000000)).toBe("2026-09-21T14:13:20.000Z");
    expect(normTimestamp(1790000000000)).toBe("2026-09-21T14:13:20.000Z");
  });

  it("solo la fecha → medianoche de Paraguay", () => {
    expect(normTimestamp("2026-10-01")).toBe("2026-10-01T03:00:00.000Z");
  });

  it("vacío o inválido → null", () => {
    expect(normTimestamp("")).toBeNull();
    expect(normTimestamp(null)).toBeNull();
    expect(normTimestamp("31/02/2026 10:00")).toBeNull();
    expect(normTimestamp("cualquier cosa")).toBeNull();
  });
});

describe("normFecha", () => {
  it("formatos aceptados → AAAA-MM-DD", () => {
    expect(normFecha("2026-10-01")).toBe("2026-10-01");
    expect(normFecha("01/10/2026")).toBe("2026-10-01");
    expect(normFecha("1-10-2026")).toBe("2026-10-01");
    expect(normFecha("01/10/26")).toBe("2026-10-01");
    expect(normFecha("2026-10-01T18:40:00Z")).toBe("2026-10-01");
  });

  it("fechas que no existen o no se entienden → null", () => {
    expect(normFecha("31/02/2026")).toBeNull();
    expect(normFecha("2026-13-01")).toBeNull();
    expect(normFecha("ayer")).toBeNull();
    expect(normFecha("")).toBeNull();
  });
});

describe("numero", () => {
  it("formato paraguayo y con punto decimal", () => {
    expect(numero("1.234,5")).toBe(1234.5);
    expect(numero("1234.5")).toBe(1234.5);
    expect(numero("12,5")).toBe(12.5);
    expect(numero("45")).toBe(45);
    expect(numero(" 1 234,5 ")).toBe(1234.5);
    expect(numero(7)).toBe(7);
  });

  it("solo punto se toma como decimal (así funciona hoy)", () => {
    expect(numero("1.234")).toBe(1.234);
  });

  it("lo que no es número → null", () => {
    expect(numero("")).toBeNull();
    expect(numero("abc")).toBeNull();
    expect(numero(Number.NaN)).toBeNull();
    expect(numero(Infinity)).toBeNull();
    expect(numero(null)).toBeNull();
  });
});

describe("porcentaje", () => {
  it("con o sin %", () => {
    expect(porcentaje("42,5 %")).toBe(42.5);
    expect(porcentaje("42%")).toBe(42);
    expect(porcentaje(100)).toBe(100);
    expect(porcentaje(0)).toBe(0);
  });

  it("fuera de 0 a 100 o inválido → null", () => {
    expect(porcentaje("101")).toBeNull();
    expect(porcentaje(-1)).toBeNull();
    expect(porcentaje("mucho")).toBeNull();
  });
});

describe("normalizeParte", () => {
  it("id numérico → texto", () => {
    const avisos: string[] = [];
    const p = normalizeParte({ id: 123, fecha: "01/10/2026", autor: " Juan " }, avisos);
    expect(p).toMatchObject({ id: "123", fecha: "2026-10-01", autor: "Juan" });
    expect(avisos).toEqual([]);
  });

  it("fotos con link no http se saltean con aviso", () => {
    const avisos: string[] = [];
    const p = normalizeParte({ id: "p1", fecha: "2026-10-01", fotos: ["https://x.example/a", "ftp://x.example/b", "javascript:alert(1)"] }, avisos);
    expect(p?.fotos).toEqual([{ url: "https://x.example/a" }]);
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toContain("una foto no tiene un link válido");
  });

  it("sin id o con fecha mala → null y aviso", () => {
    const avisos: string[] = [];
    expect(normalizeParte({ fecha: "2026-10-01" }, avisos)).toBeNull();
    expect(normalizeParte({ id: "p2", fecha: "31/02/2026" }, avisos)).toBeNull();
    expect(normalizeParte("no es un parte", avisos)).toBeNull();
    expect(avisos).toHaveLength(3);
  });

  it("última modificación normalizada y lo no reconocido en extra", () => {
    const avisos: string[] = [];
    const p = normalizeParte({ parte_id: "p3", fecha: "2026-10-03", actualizado_at: "2026-10-03 9:30:15", otra_cosa: "x" }, avisos);
    expect(p?.actualizado_at).toBe("2026-10-03T12:30:15.000Z");
    expect(p?.extra).toEqual({ otra_cosa: "x" });
  });
});

describe("leerExport con el CSV de ejemplo", () => {
  const ruta = fileURLToPath(new URL("../../../docs/ejemplos/residente-export-ejemplo.csv", import.meta.url));
  const r = leerExport(readFileSync(ruta, "utf8"));

  it("lee la obra, el avance y los partes", () => {
    expect(r.formato).toBe("csv");
    expect(r.obraCodigos).toEqual(["OBRA-PRUEBA"]);
    expect(r.obraCodigo).toBe("OBRA-PRUEBA");
    expect(r.avancePct).toBe(42.5);
    // Sin fecha propia del avance: la última modificación más nueva de los partes.
    expect(r.avanceAt).toBe("2026-10-02T20:05:00.000Z");
    expect(r.descartados).toBe(0);
    expect(r.partes.map((p) => p.id)).toEqual(["prt_0001", "prt_0002", "prt_0003"]);
  });

  it("junta las filas de un mismo parte (ítems de avance y fotos)", () => {
    const p = r.partes[0];
    expect(p).toMatchObject({
      id: "prt_0001",
      fecha: "2026-10-01",
      autor: "Juan Benítez",
      clima: "Soleado, 31 °C",
      personal: 12,
      actualizado_at: "2026-10-01T21:40:00.000Z",
      url: "https://residente-de-obra.example/partes/prt_0001",
    });
    expect(p.avance).toEqual([
      { item: "Losa 2º piso", cantidad: 45, unidad: "m²" },
      { item: "Columnas 3º piso", cantidad: 6, unidad: "u" },
    ]);
    expect(p.fotos).toEqual([
      { url: "https://residente-de-obra.example/fotos/f_0001" },
      { url: "https://residente-de-obra.example/fotos/f_0002" },
    ]);
  });

  it("parte sin ítems de avance y con una sola foto", () => {
    const p = r.partes[2];
    expect(p.avance).toBeUndefined();
    expect(p.fotos).toEqual([{ url: "https://residente-de-obra.example/fotos/f_0003" }]);
    expect(p.actualizado_at).toBe("2026-10-02T20:05:00.000Z");
  });
});

describe("parseCsv", () => {
  it("comillas dobles escapadas", () => {
    expect(parseCsv('a,"dijo ""hola""",c')).toEqual([["a", 'dijo "hola"', "c"]]);
  });

  it("salto de línea entre comillas", () => {
    expect(parseCsv('a;"línea 1\nlínea 2";c\n1;2;3')).toEqual([
      ["a", "línea 1\nlínea 2", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("CRLF y salto final", () => {
    expect(parseCsv("a;b\r\n1;2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("separador por tabulación", () => {
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
