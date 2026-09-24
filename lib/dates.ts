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
