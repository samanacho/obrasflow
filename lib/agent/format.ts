// Formato de salida para el agente de WhatsApp (sin depender del ICU del
// servidor para los separadores de miles).

/** 1500000 -> "Gs. 1.500.000" (Guaraníes no tienen decimales). */
export function fmtGs(n: number): string {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? "-" : "";
  return `${sign}Gs. ${Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/**
 * Markdown que a veces escribe el modelo → formato de WhatsApp: **negrita** →
 * *negrita*, títulos "### X" → *X*. WhatsApp mostraría los símbolos tal cual.
 */
export function toWhatsApp(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*");
}

/** Minúsculas, sin tildes y con espacios colapsados — para buscar "estacion" y encontrar "ESTACIÓN". */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
