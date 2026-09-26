import dayjs from "dayjs";
import "dayjs/locale/es";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";
import customParseFormat from "dayjs/plugin/customParseFormat";

// Day.js configurado una sola vez para toda la app: español y hora de
// Paraguay. Usar siempre desde acá (import { dayjs } from "@/lib/dayjs").

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(customParseFormat);
dayjs.locale("es");

export const TZ = "America/Asuncion";

/** "2026-09-24" -> "24/09/2026" (fechas de calendario, sin corrimiento por zona horaria). */
export function fmtFecha(ymd: string): string {
  const d = dayjs(ymd.slice(0, 10), "YYYY-MM-DD", true);
  return d.isValid() ? d.format("DD/MM/YYYY") : ymd;
}

/** "2026-09-24" -> "jueves 24/09/2026". */
export function fmtFechaLarga(ymd: string): string {
  const d = dayjs(ymd.slice(0, 10), "YYYY-MM-DD", true);
  return d.isValid() ? d.format("dddd DD/MM/YYYY") : ymd;
}

/** Instante (ISO) -> "24/09/2026 18:30" en hora de Paraguay. */
export function fmtFechaHora(iso: string | Date): string {
  return dayjs(iso).tz(TZ).format("DD/MM/YYYY HH:mm");
}

/** Instante (ISO) -> "hace 3 días", "en 2 horas". */
export function haceCuanto(iso: string | Date): string {
  return dayjs(iso).fromNow();
}

export { dayjs };
