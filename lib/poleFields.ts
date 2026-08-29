import type { PoleLotStatus } from "./types";

// No hay una tabla "oficial" de clases ANDE hardcodeada acá a propósito:
// la nomenclatura exacta (longitud/esfuerzo nominal/diámetro por clase)
// varía y hay que cargarla real desde la propia fábrica, no inventada —
// por eso PoleSpec es un catálogo que carga el usuario (como Contratistas),
// no un select con valores fijos. Lo que SÍ está confirmado (investigado
// contra pliegos reales de licitaciones DNCP de adquisición de postes para
// ANDE, ej. LP1698-22 y LP1779-23) es que la ficha técnica de un poste se
// describe con estos mismos parámetros: longitud en metros, esfuerzo/
// momento nominal en kgf, diámetro en la base, y calidad del hormigón
// (ej. "H25 — 250 kgf/cm²") — esa es la estructura de campos que se usa acá.

export const LOT_STATUS_ORDER: PoleLotStatus[] = [
  "en_curado",
  "listo_para_ensayo",
  "en_ensayo",
  "aprobado",
  "rechazado",
  "despachado",
];

export const LOT_STATUS_LABEL: Record<PoleLotStatus, string> = {
  en_curado: "En curado",
  listo_para_ensayo: "Listo para ensayo",
  en_ensayo: "En ensayo",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  despachado: "Despachado",
};

export const LOT_STATUS_COLOR: Record<PoleLotStatus, string> = {
  en_curado: "secondary",
  listo_para_ensayo: "info",
  en_ensayo: "warning",
  aprobado: "success",
  rechazado: "danger",
  despachado: "dark",
};

export const TEST_TIPOS = ["Ruptura / flexión", "Verificación dimensional", "Curado / resistencia del hormigón", "Otro"];
export const TEST_RESULTADOS = ["Pendiente", "Aprobado", "Rechazado"];
export const TEST_RESULTADO_COLOR: Record<string, string> = {
  Pendiente: "warning",
  Aprobado: "success",
  Rechazado: "danger",
};

/** Sugerencias de unidad para el datalist del formulario de materia prima — campo libre, no una lista cerrada. */
export const COMMON_UNITS = ["kg", "bolsa", "m", "m³", "litro", "unidad", "tonelada"];
