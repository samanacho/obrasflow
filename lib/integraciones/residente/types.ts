// Formato de los datos de Residente de Obra.
//
// OJO: es TENTATIVO. Hoy no hay webhooks: ellos exportan un archivo por obra
// (CSV o JSON) que importamos (ver docs/PROPUESTA_CONEXION_RESIDENTE_DE_OBRA.md
// e importar.ts). El webhook queda dormido por si lo activan más adelante.
// Los nombres de los campos todavía no están cerrados: todo lo que llega
// pasa por normalizeParte (normalize.ts), que acepta sinónimos. Todo lo que
// no es imprescindible es opcional, y lo que no se reconoce queda en `extra`.

export const SOURCE = "residente-de-obra";
export const SOURCE_LABEL = "Residente de Obra";

/** Eventos que conocemos. Los demás se registran como "ignorado". */
export const KNOWN_EVENTS = ["parte.cerrado"] as const;

export interface ResidenteEvent {
  /** Id único del evento (uuid). Se usa para no procesarlo dos veces. */
  id: string;
  event: string;
  created_at?: string;
  data: {
    obra: { codigo: string; nombre?: string };
    /** Parte completo. Si no viene (solo ids), se pide a su API con parte_id. */
    parte?: ResidenteParte;
    parte_id?: string;
  };
}

/** Foto de un parte: el link abre la foto dentro de Residente de Obra (con su login). */
export interface ResidenteFoto {
  url: string;
  descripcion?: string | null;
}

/**
 * Un parte diario de Residente de Obra. Hay uno por obra, DÍA y PERSONA (no
 * uno por día).
 */
export interface ResidenteParte {
  id: string;
  /** AAAA-MM-DD */
  fecha: string;
  /** Quién cargó el parte. */
  autor?: string | null;
  /** Observaciones / trabajo del día. */
  observaciones?: string | null;
  /** Fecha y hora (ISO) de la última edición. Al importar se queda el más nuevo. */
  actualizado_at?: string | null;
  clima?: string | null;
  /** Dotación: cantidad de personas o texto libre. */
  personal?: number | string | null;
  /** Dotación por subcontratista, si la mandan desglosada. */
  dotacion?: { subcontratista: string; cantidad: number }[];
  avance?: { item: string; cantidad: number; unidad?: string | null }[];
  /** Cantidad de fotos, o la lista de links (uno por foto). */
  fotos?: number | (string | ResidenteFoto)[];
  /** Enlace al parte en la app de Residente de Obra. */
  url?: string | null;
  /** Datos que llegaron y todavía no usamos (para no perder nada). */
  extra?: Record<string, unknown>;
  /** Formato viejo del webhook: hoy es `observaciones`. */
  trabajo?: string | null;
  /** Formato viejo del webhook: hoy es `autor`. */
  cerrado_por?: string | null;
}
