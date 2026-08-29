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
  /** Cuántos ítems tiene la receta cargada para este poste. */
  recipeCount: number;
  /** Costo estimado de materia prima por poste, con los costos ACTUALES de cada material (para planificación) — suma de cantidadPorPoste × costoUnitarioGs de la receta. */
  costoEstimadoPorPosteGs: number;
  createdAt: string;
}

/** Forma extendida que devuelve GET /api/postes/specs/[id]: el detalle de una especificación con su receta completa. */
export interface PoleSpecDetailDTO extends PoleSpecDTO {
  recipe: PoleRecipeItemDTO[];
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
  materialConsumptions: PoleLotMaterialConsumptionDTO[];
  /** Suma de costoTotalGs de todos los materialConsumptions — costo total de materia prima de este lote, en guaraníes. */
  costoMaterialTotalGs: number;
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

// ── Materias primas y recetas de poste ─────────────────────────────────
// Costos siempre en guaraníes (Gs.), sin decimales en la UI — ver lib/currency.ts.

export interface RawMaterialDTO {
  id: string;
  nombre: string;
  unidad: string;
  costoUnitarioGs: number;
  proveedor: string | null;
  notas: string | null;
  activo: boolean;
  /** En cuántas recetas de poste está este material. */
  recipeCount: number;
  /** Suma histórica de cantidadTotal consumida en todos los lotes producidos (en la unidad del material). */
  consumidoTotal: number;
  /** Suma histórica de costoTotalGs consumido en todos los lotes producidos. */
  costoTotalConsumidoGs: number;
  createdAt: string;
}

export interface RawMaterialInput {
  nombre: string;
  unidad: string;
  costoUnitarioGs: number;
  proveedor?: string | null;
  notas?: string | null;
  activo?: boolean;
}

export interface PoleRecipeItemDTO {
  id: string;
  specId: string;
  materialId: string;
  materialNombre: string;
  unidad: string;
  /** Costo ACTUAL del material (en vivo, no congelado) — para planificación. */
  costoUnitarioGs: number;
  cantidadPorPoste: number;
  /** cantidadPorPoste × costoUnitarioGs actual. */
  subtotalGs: number;
  notas: string | null;
  createdAt: string;
}

export interface PoleRecipeItemInput {
  materialId: string;
  cantidadPorPoste: number;
  notas?: string | null;
}

export interface PoleLotMaterialConsumptionDTO {
  id: string;
  lotId: string;
  materialId: string;
  materialNombre: string;
  unidad: string;
  /** Cantidad por poste que tenía la receta al momento de producir (congelada). */
  cantidadPorPoste: number;
  /** Costo unitario del material al momento de producir (congelado — no cambia si el precio de hoy cambia). */
  costoUnitarioGs: number;
  cantidadTotal: number;
  costoTotalGs: number;
}
