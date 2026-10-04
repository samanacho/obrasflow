import type { ResidenteParte } from "./types";
import {
  CAMPOS, esColumnaFoto, msActualizado, normKey, normalizeParte, normTimestamp, numero, obraDelParte, porcentaje, texto,
  type Campo,
} from "./normalize";

// Lee el archivo que exporta Residente de Obra por obra (JSON o CSV) y lo
// deja en una forma única. Es tolerante: los nombres de las columnas/campos
// todavía no están cerrados con ellos (se aceptan sinónimos) y una fila mala
// no frena el resto: se saltea y se explica en `avisos`. Nunca tira error.
// Formato propuesto: docs/ejemplos/residente-export-ejemplo.{json,csv}.
// Sin Prisma: lo que se escribe en la base está en process.ts.

export interface ExportLeido {
  formato: "json" | "csv";
  /** Código de obra que trae el archivo (el primero, si trae varios). */
  obraCodigo: string | null;
  /** Todos los códigos de obra distintos que aparecen (para avisar si no es de esta obra). */
  obraCodigos: string[];
  obraNombre: string | null;
  /** % de avance de la obra calculado por Residente (0 a 100), si viene. */
  avancePct: number | null;
  /** Desde cuándo vale ese avance (ISO), si viene. */
  avanceAt: string | null;
  partes: ResidenteParte[];
  /** Partes o filas que no se pudieron leer (el motivo está en avisos). */
  descartados: number;
  avisos: string[];
}

const MAX_AVISOS = 60;

function cerrarAvisos(avisos: string[]): string[] {
  if (avisos.length <= MAX_AVISOS) return avisos;
  return [...avisos.slice(0, MAX_AVISOS), `… y ${avisos.length - MAX_AVISOS} avisos más.`];
}

/** Si un mismo parte aparece varias veces, se queda el de última modificación más nueva (a igualdad, el último del archivo). */
function sinRepetidos(partes: ResidenteParte[], avisos: string[]): ResidenteParte[] {
  const porId = new Map<string, { parte: ResidenteParte; veces: number }>();
  for (const p of partes) {
    const ya = porId.get(p.id);
    if (!ya) {
      porId.set(p.id, { parte: p, veces: 1 });
      continue;
    }
    ya.veces++;
    const a = msActualizado(ya.parte.actualizado_at) ?? -Infinity;
    const b = msActualizado(p.actualizado_at) ?? -Infinity;
    if (b >= a) ya.parte = p;
  }
  for (const [id, { veces }] of porId) {
    if (veces > 1) avisos.push(`El parte ${id} aparece ${veces} veces en el archivo: se tomó la versión más nueva.`);
  }
  return [...porId.values()].map((x) => x.parte);
}

function leerAvance(v: unknown): { pct: number | null; at: string | null } {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return {
      pct: porcentaje(o.porcentaje ?? o.pct ?? o.valor ?? o.value ?? o.avance ?? o.avance_obra),
      at: normTimestamp(o.fecha ?? o.calculado_at ?? o.actualizado_at ?? o.at ?? o.updated_at),
    };
  }
  return { pct: porcentaje(v), at: null };
}

// ── JSON ────────────────────────────────────────────────────────────────

const CLAVES_PARTES = ["partes", "partes_diarios", "partesdiarios", "daily_logs", "registros"];

function buscarPartes(o: Record<string, unknown>): unknown[] | null {
  for (const [k, v] of Object.entries(o)) if (CLAVES_PARTES.includes(normKey(k)) && Array.isArray(v)) return v;
  return null;
}

function leerJson(text: string): ExportLeido {
  const r: ExportLeido = { formato: "json", obraCodigo: null, obraCodigos: [], obraNombre: null, avancePct: null, avanceAt: null, partes: [], descartados: 0, avisos: [] };
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    r.avisos.push("El archivo parece JSON pero no se pudo leer (está cortado o mal armado).");
    return r;
  }

  // Dónde están los partes: el archivo puede ser la lista directa, o un
  // objeto {obra, avance, partes}, o eso mismo envuelto en {data: …}.
  let crudos: unknown[] = [];
  const contenedores: Record<string, unknown>[] = [];
  if (Array.isArray(root)) crudos = root;
  else if (root && typeof root === "object") {
    const o = root as Record<string, unknown>;
    const candidatos = [o, o.data, o.export, o.resultado, o.result, o.obra].filter(
      (c): c is Record<string, unknown> => !!c && typeof c === "object" && !Array.isArray(c)
    );
    const conPartes = candidatos.find((c) => buscarPartes(c));
    if (conPartes) {
      crudos = buscarPartes(conPartes)!;
      contenedores.push(conPartes);
    } else if (Array.isArray(o.data)) crudos = o.data;
    else r.avisos.push("No encontramos la lista de partes en el archivo (se esperaba un campo \"partes\").");
    if (!contenedores.includes(o)) contenedores.push(o);
    if (o.data && typeof o.data === "object" && !Array.isArray(o.data) && !contenedores.includes(o.data as Record<string, unknown>)) {
      contenedores.push(o.data as Record<string, unknown>);
    }
  } else {
    r.avisos.push("El archivo JSON no trae partes.");
    return r;
  }

  // Obra y avance de la obra: en el contenedor, o dentro de su "obra".
  const codigos = new Set<string>();
  for (const c of contenedores) {
    const m = new Map(Object.entries(c).map(([k, v]) => [normKey(k), v]));
    const obra = m.get("obra");
    const fuentes = [m];
    if (obra && typeof obra === "object" && !Array.isArray(obra)) {
      fuentes.push(new Map(Object.entries(obra as Record<string, unknown>).map(([k, v]) => [normKey(k), v])));
    } else if (typeof obra === "string" && obra.trim()) codigos.add(obra.trim());
    for (const f of fuentes) {
      for (const k of CAMPOS.obra_codigo) {
        const v = f.get(k);
        if (k !== "obra" && (typeof v === "string" || typeof v === "number") && String(v).trim()) codigos.add(String(v).trim());
      }
      r.obraNombre ??= texto(f.get("nombre") ?? f.get("obra_nombre") ?? f.get("nombre_obra"));
      if (r.avancePct === null) {
        const crudo = [...CAMPOS.avance_obra, "avance"].map((k) => f.get(k)).find((v) => v !== undefined && v !== null && v !== "" && !Array.isArray(v));
        if (crudo !== undefined) {
          const a = leerAvance(crudo);
          if (a.pct === null) r.avisos.push(`El avance de la obra "${texto(crudo) ?? "?"}" no es un porcentaje entre 0 y 100: se ignoró.`);
          else {
            r.avancePct = a.pct;
            r.avanceAt = a.at ?? normTimestamp([...CAMPOS.avance_obra_fecha].map((k) => f.get(k)).find((v) => v));
          }
        }
      }
    }
  }

  const partes: ResidenteParte[] = [];
  crudos.forEach((raw, i) => {
    const p = normalizeParte(raw, r.avisos, `Parte n.º ${i + 1} del archivo: `);
    if (!p) {
      r.descartados++;
      return;
    }
    const cod = obraDelParte(raw as Record<string, unknown>);
    if (cod) codigos.add(cod);
    partes.push(p);
  });
  r.partes = sinRepetidos(partes, r.avisos);
  r.obraCodigos = [...codigos];
  r.obraCodigo = r.obraCodigos[0] ?? null;
  // Sin fecha propia del avance: vale la fecha en que se generó el archivo.
  if (r.avancePct !== null && !r.avanceAt) {
    for (const c of contenedores) {
      const m = new Map(Object.entries(c).map(([k, v]) => [normKey(k), v]));
      r.avanceAt ??= normTimestamp(m.get("generado_at") ?? m.get("exportado_at") ?? m.get("fecha_exportacion") ?? m.get("generated_at"));
    }
  }
  return r;
}

// ── CSV ─────────────────────────────────────────────────────────────────

/** Separador más probable según la primera línea (fuera de comillas): ; , o tabulación. */
function detectarSeparador(text: string): string {
  const cuenta: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let enComillas = false;
  for (const ch of text) {
    if (ch === '"') enComillas = !enComillas;
    else if (!enComillas && (ch === "\n" || ch === "\r")) break;
    else if (!enComillas && ch in cuenta) cuenta[ch]++;
  }
  const [mejor, veces] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  return veces > 0 ? mejor : ",";
}

/** CSV con comillas (campos con separadores, comillas dobles "" y saltos de línea adentro). */
export function parseCsv(text: string, sep = detectarSeparador(text)): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (enComillas) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += ch;
    } else if (ch === '"' && campo.trim() === "") {
      campo = "";
      enComillas = true;
    } else if (ch === sep) {
      fila.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else campo += ch;
  }
  if (campo !== "" || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

function leerCsv(text: string): ExportLeido {
  const r: ExportLeido = { formato: "csv", obraCodigo: null, obraCodigos: [], obraNombre: null, avancePct: null, avanceAt: null, partes: [], descartados: 0, avisos: [] };
  const filas = parseCsv(text);
  const encabezado = filas.shift();
  if (!encabezado || encabezado.every((h) => !h.trim())) {
    r.avisos.push("El CSV está vacío o no tiene la fila de títulos.");
    return r;
  }

  // Qué columna es cada cosa: por sinónimos, en orden de preferencia.
  const claves = encabezado.map((h) => normKey(h));
  const columnas = new Map<Campo, number[]>();
  const usadas = new Set<number>();
  for (const campo of Object.keys(CAMPOS) as Campo[]) {
    const idx: number[] = [];
    for (const sin of CAMPOS[campo]) {
      claves.forEach((k, i) => {
        if (k === sin && !usadas.has(i)) idx.push(i);
      });
    }
    if (campo === "fotos") claves.forEach((k, i) => esColumnaFoto(k) && !usadas.has(i) && !idx.includes(i) && idx.push(i));
    idx.forEach((i) => usadas.add(i));
    if (idx.length) columnas.set(campo, idx);
  }
  const sinUsar = claves.map((_, i) => i).filter((i) => !usadas.has(i) && encabezado[i].trim());
  if (sinUsar.length) {
    r.avisos.push(`Columnas que no reconocimos (se guardan igual, pero no se muestran): ${sinUsar.map((i) => `"${encabezado[i].trim()}"`).join(", ")}.`);
  }
  if (!columnas.has("id")) r.avisos.push('Falta la columna con el id del parte (ej. "parte_id"): sin eso no se puede importar.');
  if (!columnas.has("fecha")) r.avisos.push('Falta la columna "fecha".');

  const valor = (fila: string[], campo: Campo): string | undefined => {
    for (const i of columnas.get(campo) ?? []) {
      const v = fila[i]?.trim();
      if (v) return v;
    }
    return undefined;
  };

  // Una fila por parte, o una fila por ítem de avance de cada parte: se agrupa por id.
  interface Grupo { filas: string[][]; primeraLinea: number }
  const grupos = new Map<string, Grupo>();
  const codigos = new Set<string>();
  let avanceCrudo: string | undefined;
  let avanceFechaCruda: string | undefined;
  filas.forEach((fila, i) => {
    const linea = i + 2;
    if (fila.every((c) => !c.trim())) return;
    const cod = valor(fila, "obra_codigo");
    if (cod) codigos.add(cod);
    r.obraNombre ??= valor(fila, "obra_nombre") ?? null;
    const av = valor(fila, "avance_obra");
    if (av) {
      avanceCrudo = av;
      avanceFechaCruda = valor(fila, "avance_obra_fecha") ?? avanceFechaCruda;
    }
    const id = valor(fila, "id");
    if (!id) {
      // Filas que solo traen el avance de la obra (sin parte) no son un error.
      if (!av || valor(fila, "fecha")) {
        r.avisos.push(`Fila ${linea}: no tiene el id del parte: se salteó.`);
        r.descartados++;
      }
      return;
    }
    const g = grupos.get(id);
    if (g) g.filas.push(fila);
    else grupos.set(id, { filas: [fila], primeraLinea: linea });
  });

  const partes: ResidenteParte[] = [];
  for (const [id, g] of grupos) {
    const primero = (campo: Campo) => g.filas.map((f) => valor(f, campo)).find((v) => v !== undefined);
    const crudo: Record<string, unknown> = { parte_id: id };
    for (const campo of ["fecha", "autor", "observaciones", "clima", "personal", "url"] as const) {
      const v = primero(campo);
      if (v !== undefined) crudo[campo] = v;
    }
    // Última modificación: la más nueva de sus filas.
    const tss = g.filas.map((f) => valor(f, "actualizado_at")).filter((v): v is string => !!v);
    if (tss.length) {
      const leidos = tss.map((t) => ({ t, ms: msActualizado(normTimestamp(t)) }));
      const valido = leidos.filter((x) => x.ms !== null).sort((a, b) => b.ms! - a.ms!)[0];
      crudo.actualizado_at = valido ? valido.t : tss[0];
    }
    // Ítems de avance (uno por fila), sin repetir.
    const items: { item: string; cantidad: string | undefined; unidad: string | undefined }[] = [];
    const vistos = new Set<string>();
    for (const f of g.filas) {
      const item = valor(f, "item");
      if (!item) continue;
      const it = { item, cantidad: valor(f, "cantidad"), unidad: valor(f, "unidad") };
      const k = JSON.stringify(it);
      if (vistos.has(k)) continue;
      vistos.add(k);
      if (it.cantidad === undefined || numero(it.cantidad) === null) {
        r.avisos.push(`Parte ${id}: el ítem "${item}" no trae una cantidad válida: se salteó.`);
        continue;
      }
      items.push(it);
    }
    if (items.length) crudo.avance = items;
    // Fotos: todas las columnas de foto de todas sus filas.
    const fotos = g.filas.flatMap((f) => (columnas.get("fotos") ?? []).map((i) => f[i]?.trim()).filter(Boolean));
    if (fotos.length) crudo.fotos = fotos.join("|");
    // Lo no reconocido, para no perderlo.
    const extra: Record<string, string> = {};
    for (const i of sinUsar) {
      const v = g.filas.map((f) => f[i]?.trim()).find(Boolean);
      if (v) extra[encabezado[i].trim()] = v;
    }
    if (Object.keys(extra).length) crudo.extra = extra;

    const p = normalizeParte(crudo, r.avisos, `Fila ${g.primeraLinea}: `);
    if (p) partes.push(p);
    else r.descartados++;
  }

  if (avanceCrudo !== undefined) {
    const pct = porcentaje(avanceCrudo);
    if (pct === null) r.avisos.push(`El avance de la obra "${avanceCrudo}" no es un porcentaje entre 0 y 100: se ignoró.`);
    else {
      r.avancePct = pct;
      r.avanceAt = normTimestamp(avanceFechaCruda);
    }
  }
  r.partes = partes;
  r.obraCodigos = [...codigos];
  r.obraCodigo = r.obraCodigos[0] ?? null;
  return r;
}

/** Lee el archivo exportado (texto ya decodificado). Detecta solo si es JSON o CSV. */
export function leerExport(text: string): ExportLeido {
  const limpio = text.replace(/^﻿/, "");
  const r = /^\s*[[{]/.test(limpio) ? leerJson(limpio) : leerCsv(limpio);
  // Si el avance no trae fecha, se toma la última modificación más nueva de
  // sus partes (para no pisar el avance con el de un archivo más viejo).
  if (r.avancePct !== null && !r.avanceAt) {
    const ms = r.partes.map((p) => msActualizado(p.actualizado_at)).filter((n): n is number => n !== null);
    if (ms.length) r.avanceAt = new Date(Math.max(...ms)).toISOString();
  }
  r.avisos = cerrarAvisos(r.avisos);
  return r;
}

/** Decodifica el archivo: UTF-8 (con o sin BOM); si no es UTF-8 válido, Windows-1252 (CSV guardado con Excel). */
export function decodificar(buf: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(buf);
    } catch {
      return new TextDecoder("utf-8").decode(buf);
    }
  }
}
