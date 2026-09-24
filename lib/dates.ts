/**
 * Fecha de hoy como "YYYY-MM-DD" según el reloj LOCAL del usuario.
 *
 * No usar `new Date().toISOString().slice(0, 10)` para esto: toISOString
 * está en UTC, y en Paraguay (UTC-3) entre las 21:00 y la medianoche ya
 * devuelve la fecha de MAÑANA — justo el tipo de desfase que no puede
 * pasar en fechas de pagos, del Parte Diario o del Registro rápido.
 */
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Fecha de hoy "YYYY-MM-DD" en Paraguay, para código de SERVIDOR (el agente
 * de WhatsApp). En Vercel el reloj del servidor está en UTC, así que
 * todayLocal() ahí devolvería la fecha UTC — acá se fija la zona a mano.
 */
export const BUSINESS_TIME_ZONE = "America/Asuncion";
export function todayInParaguay(): string {
  // "en-CA" formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(new Date());
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Día de la semana de un "YYYY-MM-DD" (calculado sobre la fecha calendario, sin huso horario). */
export function weekdayOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return "";
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** "YYYY-MM-DD" -> "DD/MM/YYYY". */
export function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : ymd;
}

/** Días calendario entre dos "YYYY-MM-DD" (b - a). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}
