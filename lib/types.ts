export type ProjectType = "civil" | "electrico" | "vial" | "otro";
export type ProjectStatus = "planificado" | "en_curso" | "pausado" | "finalizado";
export type ProjectSector = "privado" | "publico";

/** Forma que usa el frontend: fechas como "YYYY-MM-DD", montos como number. */
export interface ProjectDTO {
  id: string;
  name: string;
  type: ProjectType;
  customType: string | null;
  status: ProjectStatus;
  manager: string;
  start: string;
  end: string;
  budget: number;
  spent: number;
  progress: number;
  sector: ProjectSector | null;
  sectorData: Record<string, any> | null;
}

export interface ProjectInput {
  name: string;
  type: ProjectType;
  customType?: string | null;
  status: ProjectStatus;
  manager: string;
  start: string;
  end: string;
  budget: number;
  spent: number;
  progress: number;
  sector?: ProjectSector | null;
  sectorData?: Record<string, any> | null;
}

export interface ProjectItemDTO {
  id: string;
  projectId: string;
  kind: string;
  title: string;
  status: string | null;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectItemInput {
  kind: string;
  title: string;
  status?: string | null;
  data: Record<string, any>;
}

export type ContractorStatus = "activo" | "inactivo";

export interface ContractorHistoryDTO {
  id: string;
  contractorId: string;
  obraNombre: string;
  projectId: string | null;
  rating: number | null;
  comentario: string | null;
  fecha: string | null;
  createdAt: string;
}

export interface ContractorHistoryInput {
  obraNombre: string;
  projectId?: string | null;
  rating?: number | null;
  comentario?: string | null;
  fecha?: string | null;
}

export interface ContractorDTO {
  id: string;
  name: string;
  ruc: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  province: string | null;
  rubros: ProjectType[];
  status: ContractorStatus;
  notes: string | null;
  avgRating: number | null;
  historyCount: number;
  createdAt: string;
}

export interface DashboardSummaryDTO {
  contractorsActive: number;
  contractorsAvgRating: number | null;
  openRelevamientos: number;
  pendingCotizaciones: number;
  pendingMilestones: number;
}

export interface ContractorInput {
  name: string;
  ruc?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  province?: string | null;
  rubros: ProjectType[];
  status: ContractorStatus;
  notes?: string | null;
}

// ── Fábrica de Postes ──────────────────────────────────────────────────

export type PoleLotStatus = "en_curado" | "listo_para_ensayo" | "en_ensayo" | "aprobado" | "rechazado" | "despachado";

export interface PoleSpecDTO {
  id: string;
  nombre: string;
  longitud: number;
  esfuerzoNominal: number;
  diametroBase: number | null;
  resistenciaHormigon: string | null;
  armadura: string | null;
  normaAnde: string | null;
  notas: string | null;
  activo: boolean;
  lotCount: number;
  createdAt: string;
}

export interface PoleSpecInput {
  nombre: string;
  longitud: number;
  esfuerzoNominal: number;
  diametroBase?: number | null;
  resistenciaHormigon?: string | null;
  armadura?: string | null;
  normaAnde?: string | null;
  notas?: string | null;
  activo?: boolean;
}

export interface PoleQualityTestDTO {
  id: string;
  lotId: string;
  tipo: string;
  resultado: string;
  fecha: string;
  valorMedido: string | null;
  responsable: string | null;
  observaciones: string | null;
  createdAt: string;
}

export interface PoleQualityTestInput {
  tipo: string;
  resultado: string;
  fecha: string;
  valorMedido?: string | null;
  responsable?: string | null;
  observaciones?: string | null;
}

export interface PoleLotDTO {
  id: string;
  specId: string;
  specNombre: string;
  codigo: string;
  cantidad: number;
  cantidadDespachada: number;
  fechaColado: string;
  fechaDesmolde: string | null;
  estado: PoleLotStatus;
  responsable: string | null;
  andeAprobado: boolean;
  andeFecha: string | null;
  andeActa: string | null;
  andeInspector: string | null;
  notas: string | null;
  tests: PoleQualityTestDTO[];
  createdAt: string;
}

export interface PoleLotInput {
  specId: string;
  codigo: string;
  cantidad: number;
  cantidadDespachada?: number;
  fechaColado: string;
  fechaDesmolde?: string | null;
  estado?: PoleLotStatus;
  responsable?: string | null;
  andeAprobado?: boolean;
  andeFecha?: string | null;
  andeActa?: string | null;
  andeInspector?: string | null;
  notas?: string | null;
}
