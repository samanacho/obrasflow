import { normalizeText } from "../agent/format";
import { daysBetween, isValidYmd } from "../dates";

// Lectura del mensaje "Pedido de compra" del grupo de WhatsApp, sin IA, para
// el formato acordado con obra:
//
//   Pedido de compra
//   Obra: Sucursal Norte
//   Fecha: 04/10            (para cuándo lo necesitan; opcional)
//   - 50 bolsas de cemento
//   - 20 varillas 10 mm
//   Proveedor: Ferretería X  (opcional)
//   Nota: entregar a la mañana (opcional)
//
// Si no alcanza (no hay renglones con cantidad o no dice la obra), Memby le
// pide ayuda a Claude (lib/compras/extract.ts).

export interface ParsedLine {
  cantidad: number;
  unidad: string | null;
  descripcion: string;
}

export interface ParsedRequest {
  obra: string | null;
  proveedor: string | null;
  /** YYYY-MM-DD */
  fechaNecesaria: string | null;
  notas: string | null;
  lineas: ParsedLine[];
}

const HEADER = /^\s*[*_~]*\s*pedidos?\s+de\s+compras?\b[*_~:.\-\s]*/i;

/** ¿El mensaje es un pedido de compra? (tiene que empezar así, como se acordó con obra). */
export function isPurchaseRequest(text: string | null | undefined): boolean {
  return Boolean(text && HEADER.test(text));
}

const UNITS: [RegExp, string][] = [
  [/^bolsas?$/, "bolsa"],
  [/^varillas?$/, "varilla"],
  [/^barras?$/, "barra"],
  [/^m3$|^mts?3$|^metros? cubicos?$/, "m3"],
  [/^m2$|^mts?2$|^metros? cuadrados?$/, "m2"],
  [/^ml$|^metros? lineales?$/, "ml"],
  [/^m$|^mts?$|^metros?$/, "m"],
  [/^kg$|^kgs$|^kilos?$/, "kg"],
  [/^tn$|^ton$|^toneladas?$/, "tn"],
  [/^lts?$|^litros?$/, "litro"],
  [/^u$|^un$|^uds?$|^unid$|^unidad(es)?$/, "unidad"],
  [/^gl$|^global$/, "gl"],
  [/^rollos?$/, "rollo"],
  [/^cajas?$/, "caja"],
  [/^piezas?$|^pzas?$/, "pieza"],
  [/^baldes?$/, "balde"],
  [/^latas?$/, "lata"],
  [/^tambor(es)?$/, "tambor"],
  [/^camion(es)?$|^camionadas?$/, "camión"],
  [/^paquetes?$|^paq$/, "paquete"],
  [/^placas?$/, "placa"],
  [/^chapas?$/, "chapa"],
  [/^tiras?$/, "tira"],
  [/^juegos?$/, "juego"],
  [/^pares?$/, "par"],
  [/^docenas?$/, "docena"],
  [/^millar(es)?$/, "millar"],
  [/^tablas?$/, "tabla"],
  [/^tubos?$/, "tubo"],
  [/^caños?$|^canos?$/, "caño"],
];

function unitOf(word: string): string | null {
  const w = normalizeText(word).replace(/\.$/, "");
  for (const [re, u] of UNITS) if (re.test(w)) return u;
  return null;
}

function parseNumber(s: string): number {
  // "1.500" (miles) / "2,5" (decimal) / "2.5"
  const t = s.trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t.replace(",", "."));
}

const NUM = String.raw`(\d+(?:[.,]\d+)*)`;

/** "50 bolsas de cemento", "cemento x 50 bolsas", "Cemento: 50", "50 cemento" → renglón. */
export function parseLine(raw: string): ParsedLine | null {
  const line = raw.replace(/^\s*(?:[-•*·>]|\d+[.)])\s+/, "").replace(/[*_~]/g, "").trim();
  if (!line) return null;
  // Un número al principio que es una medida y no la cantidad ("1/2 m3 de
  // arena", "10mm varilla x 20", "3 x 2 mts de malla"): se prueba solo el
  // patrón de cantidad al final; si tampoco sirve, el renglón no se adivina.
  const medidaAlPrincipio = new RegExp(`^${NUM}\\s*(?:/|[x×]\\s*\\d|(?:mm|cm|pulg)\\b|")`, "i").test(line);
  // Cantidad al principio.
  let m = medidaAlPrincipio ? null : new RegExp(`^${NUM}\\s*([a-zA-ZñÑáéíóú0-9.]+)?\\s*(.*)$`).exec(line);
  if (m) {
    const cantidad = parseNumber(m[1]);
    const maybeUnit = m[2] ?? "";
    const unidad = maybeUnit ? unitOf(maybeUnit) : null;
    let descripcion = (unidad ? m[3] : `${maybeUnit} ${m[3]}`).replace(/^\s*(de|del)\s+/i, "").trim();
    if (!descripcion && !unidad && maybeUnit) descripcion = maybeUnit;
    // "20 varillas 10mm": la unidad es también el material (si lo que sigue es solo una medida, va junto).
    if (unidad && maybeUnit && (!descripcion || /^[\d.,/]+\s*(mm|cm|m|"|pulg)?(\s|$)/i.test(descripcion))) descripcion = `${maybeUnit} ${descripcion}`.trim();
    if (cantidad > 0 && descripcion) return { cantidad, unidad, descripcion };
  }
  // Cantidad al final: "cemento x 50 bolsas", "cemento: 50", "cemento - 50 u".
  m = new RegExp(`^(.+?)\\s*(?:[x×:=-]|\\bcant(?:idad)?\\.?)\\s*${NUM}\\s*([a-zA-ZñÑáéíóú0-9.]+)?\\s*$`, "i").exec(line);
  if (m) {
    const cantidad = parseNumber(m[2]);
    const unidad = m[3] ? unitOf(m[3]) : null;
    const descripcion = m[1].trim();
    if (cantidad > 0 && descripcion) return { cantidad, unidad, descripcion: unidad || !m[3] ? descripcion : `${descripcion} ${m[3]}` };
  }
  return null;
}

/** "04/10", "4/10/2026", "2026-10-04", "hoy", "mañana" → YYYY-MM-DD (hora de Paraguay). */
export function parseFecha(s: string, today: string): string | null {
  const t = normalizeText(s);
  const [y, mo, d] = today.split("-").map(Number);
  const base = new Date(Date.UTC(y, mo - 1, d));
  const add = (n: number) => new Date(base.getTime() + n * 86400000).toISOString().slice(0, 10);
  if (/^hoy\b/.test(t)) return today;
  if (/^(manana|mañana)\b/.test(t)) return add(1);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/.exec(t);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = m[3] ? Number(m[3]) : y;
    if (yy < 100) yy += 2000;
    const ymd = (year: number) => `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    // "31/02" no existe (JS lo pasaba en silencio al 3 de marzo).
    if (!isValidYmd(ymd(yy))) return null;
    // Sin año, "05/01" escrito en diciembre es del año que viene (no de hace 11 meses).
    if (!m[3] && daysBetween(today, ymd(yy)) < -60 && isValidYmd(ymd(yy + 1))) return ymd(yy + 1);
    return ymd(yy);
  }
  return null;
}

const KEY = /^\s*[*_]*\s*(obra|proyecto|proveedor|casa de materiales|ferreteria|fecha|para|para el|para cuando|entrega|nota|notas|obs|observacion|observaciones)\s*[*_]*\s*[:\-]\s*(.*)$/i;

export function parsePurchaseRequest(text: string, today: string): ParsedRequest {
  const out: ParsedRequest = { obra: null, proveedor: null, fechaNecesaria: null, notas: null, lineas: [] };
  const notas: string[] = [];
  const rows = text.replace(HEADER, "").split(/\r?\n/);
  for (const row of rows) {
    const r = row.trim();
    if (!r) continue;
    const k = KEY.exec(normalizeText(r).startsWith("ferreter") ? r.replace(/ferreter[ií]a/i, "ferreteria") : r);
    if (k) {
      const key = normalizeText(k[1]);
      const val = k[2].replace(/[*_~]/g, "").trim();
      if (!val) continue;
      if (key === "obra" || key === "proyecto") out.obra = val;
      else if (key === "proveedor" || key === "casa de materiales" || key === "ferreteria") out.proveedor = val;
      else if (key.startsWith("fecha") || key.startsWith("para") || key === "entrega") out.fechaNecesaria = parseFecha(val, today) ?? out.fechaNecesaria;
      else notas.push(val);
      continue;
    }
    const line = parseLine(r);
    if (line) out.lineas.push(line);
    else if (out.lineas.length || out.obra) notas.push(r.replace(/[*_~]/g, ""));
  }
  out.notas = notas.join(" · ") || null;
  return out;
}
