export type ProjectType = "civil" | "electrico" | "vial";
export type ProjectStatus = "planificado" | "en_curso" | "pausado" | "finalizado";

/** Forma que usa el frontend: fechas como "YYYY-MM-DD", montos como number. */
export interface ProjectDTO {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  manager: string;
  start: string;
  end: string;
  budget: number;
  spent: number;
  progress: number;
}

export interface ProjectInput {
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  manager: string;
  start: string;
  end: string;
  budget: number;
  spent: number;
  progress: number;
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
