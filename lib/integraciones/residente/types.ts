// Formato de los eventos de Residente de Obra.
//
// OJO: es TENTATIVO. Hoy ellos no tienen API ni webhooks (ver
// docs/HANDOFF_RESIDENTE_DE_OBRA.md, sección 5). Esta es la forma que les
// propusimos; cuando la definan, se ajusta acá y en parse.ts. Todo lo que no
// es imprescindible es opcional, y se guarda el parte crudo para no perder
// nada aunque el formato cambie.

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

export interface ResidenteParte {
  id: string;
  /** AAAA-MM-DD */
  fecha: string;
  clima?: string | null;
  /** Cantidad de personas o texto libre. */
  personal?: number | string | null;
  /** Trabajo del día. */
  trabajo?: string | null;
  dotacion?: { subcontratista: string; cantidad: number }[];
  avance?: { item: string; cantidad: number; unidad?: string | null }[];
  /** Cantidad de fotos del parte (las fotos se traen más adelante). */
  fotos?: number;
  /** Enlace al parte en la app de Residente de Obra. */
  url?: string | null;
  cerrado_por?: string | null;
}
