import type { ResidenteFoto, ResidenteParte } from "./types";

// Normaliza lo que manda Residente de Obra (webhook, archivo exportado o, más
// adelante, su API de solo lectura) a ResidenteParte. Los nombres de los
// campos todavía no están cerrados con ellos, así que se aceptan sinónimos
// (sin importar mayúsculas, tildes ni espacios). Nunca tira error: lo que no
// sirve se anota en `avisos`. Sin Prisma: se puede usar en cualquier lado.

/** "Última modificación (%)" → "ultima_modificacion_pct". */
export function normKey(k: string): string {
  return k
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/%/g, "_pct_")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Campo nuestro → nombres que aceptamos (normalizados con normKey, en orden de preferencia). */
export const CAMPOS = {
  id: ["parte_id", "id_parte", "id", "parte", "uuid"],
  fecha: ["fecha", "fecha_parte", "fecha_del_parte", "dia", "date"],
  autor: ["autor", "usuario", "residente", "cargado_por", "cerrado_por", "creado_por", "author"],
  observaciones: ["observaciones", "observacion", "obs", "trabajo", "trabajos", "trabajo_realizado", "descripcion", "notas", "comentarios"],
  clima: ["clima", "tiempo"],
  personal: ["dotacion", "dotacion_total", "personal", "cantidad_personas", "personas", "cantidad_personal", "operarios"],
  item: ["item", "item_avance", "rubro", "partida", "tarea"],
  cantidad: ["cantidad", "cantidad_avance", "avance_cantidad", "avance_item", "avance"],
  unidad: ["unidad", "unidad_medida", "um", "unid"],
  actualizado_at: ["actualizado_at", "actualizado", "ultima_modificacion", "updated_at", "modificado", "modificado_at", "fecha_modificacion", "last_modified"],
  fotos: ["fotos", "foto", "foto_url", "fotos_url", "url_foto", "url_fotos", "fotos_urls", "links_fotos"],
  url: ["url", "link", "url_parte", "link_parte", "enlace"],
  obra_codigo: ["obra_codigo", "codigo_obra", "codigo", "obra", "code"],
  obra_nombre: ["obra_nombre", "nombre_obra"],
  avance_obra: ["avance_obra", "avance_obra_pct", "avance_de_obra", "avance_general", "porcentaje_obra", "porcentaje", "avance_pct", "pct", "avance_total"],
  avance_obra_fecha: ["avance_obra_fecha", "fecha_avance", "avance_fecha", "avance_at", "avance_obra_at"],
} as const;

export type Campo = keyof typeof CAMPOS;

/** Columnas de foto numeradas: foto_1, foto2, foto_3_url… */
export function esColumnaFoto(k: string): boolean {
  return /^(foto|fotos|url_foto)_?\d+(_url)?$/.test(k);
}

const esVacio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Texto limpio o null. Objetos tipo {nombre} → su nombre. */
export function texto(v: unknown): string | null {
  if (esVacio(v)) return null;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && v) {
    const o = v as Record<string, unknown>;
    return texto(o.nombre ?? o.name ?? o.usuario ?? o.email ?? null);
  }
  return null;
}

/** "1.234,5" / "1234.5" / "45" → número. null si no se entiende. */
export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "42", "42 %", "42,5%" → 42.5 (0 a 100). null si no es un porcentaje válido. */
export function porcentaje(v: unknown): number | null {
  const n = numero(typeof v === "string" ? v.replace(/%/g, "") : v);
  return n !== null && n >= 0 && n <= 100 ? n : null;
}

function fechaValida(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** AAAA-MM-DD, DD/MM/AAAA, DD-MM-AAAA o DD/MM/AA → AAAA-MM-DD. null si no es una fecha real. */
export function normFecha(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  if (m) return fechaValida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:$|\s)/);
  if (m) return fechaValida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

/**
 * Fecha y hora → ISO (UTC). Sin zona horaria se toma la hora de Paraguay
 * (UTC-3 todo el año). Acepta ISO, "AAAA-MM-DD HH:MM[:SS]",
 * "DD/MM/AAAA HH:MM[:SS]" y números (segundos o milisegundos desde 1970).
 */
export function normTimestamp(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e11 ? v : v * 1000;
    return new Date(ms).toISOString();
  }
  const s = texto(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const f = fechaValida(+m[3], +m[2], +m[1]);
    if (!f) return null;
    const hh = (m[4] ?? "00").padStart(2, "0");
    const d = new Date(`${f}T${hh}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[\sT](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (m) {
    const hora = m[2] ? (m[2].length < 5 ? "0" + m[2] : m[2]) : "00:00:00";
    const zona = m[3] ? m[3].toUpperCase() : "-03:00";
    const d = new Date(`${m[1]}T${hora}${zona}`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const esHttp = (u: unknown): u is string => typeof u === "string" && /^https?:\/\/\S+$/i.test(u.trim());

/** Links de fotos: texto con varios separados por | ; o espacios, lista de textos o de objetos {url, descripcion}. Solo http(s). */
export function normFotos(v: unknown, avisos?: string[], etiqueta = ""): ResidenteFoto[] {
  const out: ResidenteFoto[] = [];
  const vistos = new Set<string>();
  const agregar = (url: string, descripcion?: string | null) => {
    const u = url.trim();
    if (!u) return;
    if (!esHttp(u)) {
      avisos?.push(`${etiqueta}una foto no tiene un link válido (${String(u).slice(0, 60)}): se salteó.`);
      return;
    }
    if (vistos.has(u)) return;
    vistos.add(u);
    out.push(descripcion ? { url: u, descripcion } : { url: u });
  };
  const visitar = (x: unknown) => {
    if (esVacio(x)) return;
    if (typeof x === "string") x.split(/[|;\s]+/).forEach((u) => agregar(u));
    else if (Array.isArray(x)) x.forEach(visitar);
    else if (typeof x === "object" && x) {
      const o = x as Record<string, unknown>;
      const url = texto(o.url ?? o.link ?? o.href ?? o.enlace);
      if (url) agregar(url, texto(o.descripcion ?? o.description ?? o.titulo ?? o.nombre ?? o.nota));
    }
  };
  visitar(v);
  return out;
}

/** Busca el primer valor no vacío de un campo (por sus sinónimos) en un objeto con claves ya normalizadas. */
export function tomar(o: Map<string, unknown>, campo: Campo): unknown {
  for (const k of CAMPOS[campo]) {
    const v = o.get(k);
    if (!esVacio(v)) return v;
  }
  return undefined;
}

/** Claves que normalizeParte entiende (el resto va a `extra`). */
const CLAVES_PARTE = new Set<string>([
  ...CAMPOS.id, ...CAMPOS.fecha, ...CAMPOS.autor, ...CAMPOS.observaciones, ...CAMPOS.clima, ...CAMPOS.personal,
  ...CAMPOS.actualizado_at, ...CAMPOS.fotos, ...CAMPOS.url, ...CAMPOS.obra_codigo, ...CAMPOS.obra_nombre,
  "avance", "avances", "avance_items", "items", "dotacion", "subcontratistas", "extra",
]);

function itemsDeAvance(v: unknown, avisos: string[], etiqueta: string): NonNullable<ResidenteParte["avance"]> {
  if (!Array.isArray(v)) return [];
  const out: NonNullable<ResidenteParte["avance"]> = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = new Map(Object.entries(x as Record<string, unknown>).map(([k, val]) => [normKey(k), val]));
    const item = texto(tomar(o, "item") ?? o.get("nombre") ?? o.get("descripcion"));
    const cantidad = numero(tomar(o, "cantidad") ?? o.get("valor"));
    if (!item) continue;
    if (cantidad === null) {
      avisos.push(`${etiqueta}el ítem "${item}" no trae una cantidad válida: se salteó.`);
      continue;
    }
    out.push({ item, cantidad, unidad: texto(tomar(o, "unidad")) });
  }
  return out;
}

function dotacionDesglosada(v: unknown): NonNullable<ResidenteParte["dotacion"]> {
  if (!Array.isArray(v)) return [];
  const out: NonNullable<ResidenteParte["dotacion"]> = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const quien = texto(o.subcontratista ?? o.nombre ?? o.empresa ?? o.rol ?? o.categoria);
    const cantidad = numero(o.cantidad ?? o.personas ?? o.cant);
    if (quien && cantidad !== null) out.push({ subcontratista: quien, cantidad });
  }
  return out;
}

/** Lo que trae el parte sobre su obra (para comprobar que el archivo es de esta obra). */
export function obraDelParte(raw: Record<string, unknown>): string | null {
  const o = new Map(Object.entries(raw).map(([k, v]) => [normKey(k), v]));
  const obra = o.get("obra");
  if (obra && typeof obra === "object") return texto((obra as Record<string, unknown>).codigo ?? (obra as Record<string, unknown>).code);
  return texto(tomar(o, "obra_codigo"));
}

/**
 * Convierte un parte "crudo" (como venga) en ResidenteParte. Devuelve null
 * (y anota el motivo en avisos) si le falta el id o la fecha.
 */
export function normalizeParte(raw: unknown, avisos: string[], etiqueta = ""): ResidenteParte | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    avisos.push(`${etiqueta}no es un parte (formato inesperado): se salteó.`);
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const o = new Map(Object.entries(obj).map(([k, v]) => [normKey(k), v]));

  const id = texto(tomar(o, "id"));
  if (!id) {
    avisos.push(`${etiqueta}no tiene el id del parte: se salteó.`);
    return null;
  }
  const fechaCruda = tomar(o, "fecha");
  const fecha = normFecha(fechaCruda);
  if (!fecha) {
    avisos.push(`Parte ${id}: ${fechaCruda ? `la fecha "${texto(fechaCruda)}" no se entiende` : "no tiene fecha"}: se salteó.`);
    return null;
  }
  const et = `Parte ${id} (${fecha}): `;

  const parte: ResidenteParte = { id, fecha };
  const autor = texto(tomar(o, "autor"));
  if (autor) parte.autor = autor;
  const obs = texto(tomar(o, "observaciones"));
  if (obs) parte.observaciones = obs;
  const clima = texto(tomar(o, "clima"));
  if (clima) parte.clima = clima;

  const actRaw = tomar(o, "actualizado_at");
  if (actRaw !== undefined) {
    const ts = normTimestamp(actRaw);
    if (ts) parte.actualizado_at = ts;
    else avisos.push(`${et}la última modificación "${texto(actRaw)}" no se entiende: se ignoró.`);
  }

  // Dotación: número/texto (cantidad de personas) o lista por subcontratista.
  const dotLista = dotacionDesglosada(o.get("dotacion") ?? o.get("subcontratistas"));
  if (dotLista.length) parte.dotacion = dotLista;
  const personal = [...CAMPOS.personal].map((k) => o.get(k)).find((v) => !esVacio(v) && !Array.isArray(v));
  if (personal !== undefined) {
    const n = numero(personal);
    parte.personal = n !== null ? n : texto(personal);
  } else if (dotLista.length) {
    parte.personal = dotLista.reduce((acc, d) => acc + d.cantidad, 0);
  }

  const avance = itemsDeAvance(o.get("avance") ?? o.get("avances") ?? o.get("avance_items") ?? o.get("items"), avisos, et);
  if (avance.length) parte.avance = avance;

  // Fotos: una cantidad, o links (en una o varias columnas/campos).
  const fotosCrudas = [...CAMPOS.fotos.map((k) => o.get(k)), ...[...o.keys()].filter(esColumnaFoto).map((k) => o.get(k))].filter(
    (v) => !esVacio(v)
  );
  if (fotosCrudas.length === 1 && typeof fotosCrudas[0] === "number") parte.fotos = fotosCrudas[0];
  else if (fotosCrudas.length === 1 && typeof fotosCrudas[0] === "string" && /^\d+$/.test(fotosCrudas[0].trim())) parte.fotos = Number(fotosCrudas[0]);
  else if (fotosCrudas.length) {
    const fotos = normFotos(fotosCrudas, avisos, et);
    if (fotos.length) parte.fotos = fotos;
  }

  const url = texto(tomar(o, "url"));
  if (url && esHttp(url)) parte.url = url;

  // Lo que no reconocemos se guarda igual, para no perder nada mientras se cierra el formato.
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = normKey(k);
    if (CLAVES_PARTE.has(nk) || esColumnaFoto(nk) || esVacio(v)) continue;
    extra[k] = v;
  }
  if (obj.extra && typeof obj.extra === "object" && !Array.isArray(obj.extra)) Object.assign(extra, obj.extra);
  if (Object.keys(extra).length) parte.extra = extra;

  return parte;
}

/** Fecha y hora de la última edición en milisegundos, o null. */
export function msActualizado(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
}
