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
