/**
 * Calendario y capacidad de producción de la fábrica de postes — datos
 * operativos fijos de la fábrica (no vienen de datos cargados, por eso son
 * constantes acá): trabaja de lunes a sábado, 7:00–17:00, sábado medio día
 * (hasta las 12:00), domingo cerrado. Capacidad: 6 postes/día de lunes a
 * viernes, 3 postes los sábados.
 */
export const FACTORY_SCHEDULE_LABEL = "Lu–Vi 7:00–17:00 · Sáb 7:00–12:00 · Dom cerrado";
export const DAILY_CAPACITY_WEEKDAY = 6;
export const DAILY_CAPACITY_SATURDAY = 3;
/** 6 postes × 5 días (lunes a viernes) + 3 postes el sábado. */
export const WEEKLY_CAPACITY = DAILY_CAPACITY_WEEKDAY * 5 + DAILY_CAPACITY_SATURDAY;

/** Capacidad de producción de postes para una fecha dada (0=domingo…6=sábado). */
export function capacityForDate(d: Date): number {
  const day = d.getDay();
  if (day === 0) return 0; // domingo: cerrado
  if (day === 6) return DAILY_CAPACITY_SATURDAY;
  return DAILY_CAPACITY_WEEKDAY;
}

/**
 * Días corridos de espera después de colar el último poste de un lote
 * antes de que la ANDE pueda fiscalizarlo — es tiempo de curado del
 * hormigón, corre todos los días (no solo los hábiles).
 */
export const FISCALIZACION_ESPERA_DIAS = 15;

/** Fecha estimada en que un lote queda listo para la fiscalización de la ANDE. */
export function fechaFiscalizacionEstimada(fechaColadoISO: string): Date {
  const d = new Date(fechaColadoISO + "T00:00:00");
  d.setDate(d.getDate() + FISCALIZACION_ESPERA_DIAS);
  return d;
}
