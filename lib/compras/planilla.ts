import { parseNumero } from "./labels";

// Lectura de un presupuesto pegado desde Excel (o leído de un .xlsx/.csv):
// busca la fila de títulos, reconoce qué columna es cada cosa por el nombre
// y arma los ítems. Las filas con descripción pero sin cantidad ni precio
// ("1. OBRAS PRELIMINARES") se toman como títulos de grupo: pasan a ser la
// categoría de los ítems que siguen. Sin dependencias: corre en el navegador.

export type Campo = "codigo" | "descripcion" | "unidad" | "cantidad" | "precioUnitario" | "total" | "categoria";

export const CAMPO_LABEL: Record<Campo, string> = {
  codigo: "Código",
  descripcion: "Descripción",
  unidad: "Unidad",
  cantidad: "Cantidad",
  precioUnitario: "Precio unitario",
  total: "Total",
  categoria: "Categoría",
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Qué campo es una columna según su título (null si no se reconoce). */
function campoDeTitulo(t: string): Campo | null {
  const s = sinTildes(t).replace(/[.:]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (/total|^importe|^monto|^parcial/.test(s)) return "total";
  if (/^(precio|costo|valor)\b.*unit|^p ?u$|^p ?unit|^unitario|^precio\b|^costo$/.test(s)) return "precioUnitario";
  if (/^cant|^qty|^cnt/.test(s)) return "cantidad";
  if (/^(unid|und|ud$|um$|u$|medida|u ?m$)/.test(s)) return "unidad";
  if (/descrip|detalle|concepto|material|designacion|rubro|partida/.test(s)) return "descripcion";
  if (/^(cod|item|n(ro|°|º|o)?$|num|#)/.test(s)) return "codigo";
  if (/^(categ|grupo|capitulo|seccion)/.test(s)) return "categoria";
  return null;
}

export interface FilaPlanilla {
  /** Número de fila en lo pegado o en la planilla (1 = primera). */
  fila: number;
  tipo: "item" | "titulo" | "error";
  codigo: string | null;
  descripcion: string;
  unidad: string | null;
  cantidad: number | null;
  precioUnitario: number | null;
  categoria: string | null;
  error?: string;
}

export interface ResultadoPlanilla {
  columnas: (Campo | null)[];
  /** true si se encontró la fila de títulos; si no, se supuso un orden. */
  conTitulos: boolean;
  filas: FilaPlanilla[];
}

/** Texto pegado de Excel (tabulado) o CSV (punto y coma o coma) → celdas. */
export function celdasDeTexto(texto: string): string[][] {
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n");
  const sep = lineas.some((l) => l.includes("\t")) ? "\t" : lineas.some((l) => l.includes(";")) ? ";" : ",";
  return lineas.map((l) => partir(l, sep));
}

/** Parte una línea respetando comillas ("1.234,5" queda entero). */
function partir(linea: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (comillas && linea[i + 1] === '"') { cur += '"'; i++; } else comillas = !comillas;
    } else if (c === sep && !comillas) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

const vacia = (fila: unknown[]) => fila.every((c) => String(c ?? "").trim() === "");

/** Orden supuesto cuando no hay títulos, según cuántas columnas tiene. */
function ordenSupuesto(n: number): (Campo | null)[] {
  if (n <= 3) return ["descripcion", "cantidad", "precioUnitario"];
  if (n === 4) return ["descripcion", "unidad", "cantidad", "precioUnitario"];
  if (n === 5) return ["codigo", "descripcion", "unidad", "cantidad", "precioUnitario"];
  return ["codigo", "descripcion", "unidad", "cantidad", "precioUnitario", "total"];
}

export function leerPlanilla(celdas: unknown[][]): ResultadoPlanilla {
  const filas = celdas.map((f) => (Array.isArray(f) ? f : []));
  // Fila de títulos: entre las primeras 15, la que reconoce más columnas (al menos descripción y otra).
  let header = -1;
  let columnas: (Campo | null)[] = [];
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const cols = filas[i].map((c) => (typeof c === "string" ? campoDeTitulo(c) : null));
    const reconocidas = cols.filter(Boolean).length;
    if (cols.includes("descripcion") && reconocidas >= 2 && reconocidas > columnas.filter(Boolean).length) {
      header = i;
      columnas = cols;
    }
  }
  const conTitulos = header >= 0;
  if (conTitulos) {
    // Una columna repetida (dos "Precio") cuenta solo la primera vez.
    const vistos = new Set<Campo>();
    columnas = columnas.map((c) => (c && !vistos.has(c) ? (vistos.add(c), c) : null));
  } else {
    const ancho = Math.max(0, ...filas.filter((f) => !vacia(f)).map((f) => f.length));
    columnas = ordenSupuesto(ancho);
  }

  const idx = (c: Campo) => columnas.indexOf(c);
  const tomar = (f: unknown[], c: Campo) => (idx(c) >= 0 ? f[idx(c)] : undefined);
  const texto = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

  const out: FilaPlanilla[] = [];
  let categoria: string | null = null;
  for (let i = header + 1; i < filas.length; i++) {
    const f = filas[i];
    if (vacia(f)) continue;
    const descripcion = texto(tomar(f, "descripcion"));
    const codigo = texto(tomar(f, "codigo")) || null;
    const unidad = texto(tomar(f, "unidad")) || null;
    const cantRaw = tomar(f, "cantidad");
    const precioRaw = tomar(f, "precioUnitario");
    const cantidad = parseNumero(cantRaw);
    let precioUnitario = parseNumero(precioRaw);
    const total = parseNumero(tomar(f, "total"));
    if (precioUnitario === null && total !== null && cantidad) precioUnitario = Math.round(total / cantidad);
    const catCol = texto(tomar(f, "categoria")) || null;
    const base = { fila: i + 1, codigo, descripcion, unidad, cantidad, precioUnitario, categoria: catCol ?? categoria };

    if (!descripcion) {
      if (texto(cantRaw) || texto(precioRaw)) out.push({ ...base, tipo: "error", error: "Falta la descripción" });
      continue;
    }
    if (/^(sub\s*)?total(es)?\b/i.test(sinTildes(descripcion))) continue; // filas de totales de la planilla
    const sinCant = !texto(cantRaw);
    const sinPrecio = !texto(precioRaw) && total === null;
    if (sinCant && sinPrecio) {
      categoria = descripcion.replace(/^[\d.\s)-]+/, "").trim() || descripcion;
      out.push({ ...base, tipo: "titulo", categoria });
      continue;
    }
    if (cantidad === null || cantidad < 0) { out.push({ ...base, tipo: "error", error: sinCant ? "Falta la cantidad" : "La cantidad no es un número" }); continue; }
    if (precioUnitario === null || precioUnitario < 0) { out.push({ ...base, tipo: "error", error: sinPrecio ? "Falta el precio" : "El precio no es un número" }); continue; }
    out.push({ ...base, tipo: "item" });
  }
  return { columnas, conTitulos, filas: out };
}
