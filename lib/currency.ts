/**
 * Fábrica de Postes trabaja siempre en guaraníes (PYG) — sin centavos, que
 * es como se maneja la plata en la práctica en Paraguay. Mismo estilo que
 * el `fmtMoney` que ya existe en app/project/[id]/page.tsx ("Gs. 1.234.567"),
 * pero acá centralizado porque lo usan varios archivos nuevos del módulo.
 */
export function fmtGs(n: number | null | undefined): string {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY", { maximumFractionDigits: 0 });
}
