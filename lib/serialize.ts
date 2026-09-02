import type {
  Project, ProjectItem, Contractor, ContractorHistoryEntry, Attachment, Supplier,
  PoleSpec, PoleLot, PoleQualityTest, RawMaterial, PoleRecipeItem, PoleLotMaterialConsumption, MaterialPurchase,
} from "@prisma/client";
import type {
  ProjectDTO, ProjectItemDTO, ContractorDTO, ContractorHistoryDTO, AttachmentDTO, MovimientoDTO, SupplierDTO,
  PoleSpecDTO, PoleSpecDetailDTO, PoleLotDTO, PoleQualityTestDTO,
  RawMaterialDTO, PoleRecipeItemDTO, PoleLotMaterialConsumptionDTO, MaterialPurchaseDTO, PurchaseDocType,
} from "./types";

/** Convierte el registro de Prisma (Decimal, Date) a la forma plana que consume el frontend. */
export function serializeProject(p: Project): ProjectDTO {
  return {
    id: p.id,
    name: p.name,
    reference: p.reference,
    type: p.type as ProjectDTO["type"],
    customType: p.customType,
    status: p.status as ProjectDTO["status"],
    manager: p.manager,
    city: p.city,
    department: p.department,
    coordinates: p.coordinates,
    start: p.start.toISOString().slice(0, 10),
    end: p.end.toISOString().slice(0, 10),
    budget: Number(p.budget),
    spent: Number(p.spent),
    progress: p.progress,
    sector: p.sector as ProjectDTO["sector"],
    sectorData: (p.sectorData as Record<string, any> | null) ?? null,
  };
}

/** Metadata únicamente — nunca incluye `data` (Bytes) del attachment, eso solo lo sirve GET /api/attachments/[id]. */
export function serializeAttachmentMeta(a: Pick<Attachment, "id" | "filename" | "mimeType" | "size" | "createdAt">): AttachmentDTO {
  return { id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size, createdAt: a.createdAt.toISOString() };
}

export function serializeItem(
  i: ProjectItem & { attachments?: Pick<Attachment, "id" | "filename" | "mimeType" | "size" | "createdAt">[] }
): ProjectItemDTO {
  return {
    id: i.id,
    projectId: i.projectId,
    kind: i.kind,
    title: i.title,
    status: i.status,
    data: (i.data as Record<string, any>) ?? {},
    attachment: i.attachments?.[0] ? serializeAttachmentMeta(i.attachments[0]) : null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

/** Para GET /api/movimientos (listado cruzado a todas las obras) — mismo ProjectItem, con el nombre/rubro de su obra ya resuelto. */
export function serializeMovimiento(
  i: ProjectItem & {
    attachments?: Pick<Attachment, "id" | "filename" | "mimeType" | "size" | "createdAt">[];
    project: { name: string; type: string };
  }
): MovimientoDTO {
  return {
    ...serializeItem(i),
    projectName: i.project.name,
    projectType: i.project.type as MovimientoDTO["projectType"],
  };
}

export function serializeHistoryEntry(h: ContractorHistoryEntry): ContractorHistoryDTO {
  return {
    id: h.id,
    contractorId: h.contractorId,
    obraNombre: h.obraNombre,
    projectId: h.projectId,
    rating: h.rating,
    comentario: h.comentario,
    fecha: h.fecha ? h.fecha.toISOString().slice(0, 10) : null,
    createdAt: h.createdAt.toISOString(),
  };
}

export function serializeContractor(c: Contractor & { history?: { rating: number | null }[] }): ContractorDTO {
  const rated = (c.history ?? []).filter((h) => typeof h.rating === "number");
  const avgRating = rated.length ? rated.reduce((sum, h) => sum + (h.rating ?? 0), 0) / rated.length : null;
  return {
    id: c.id,
    name: c.name,
    ruc: c.ruc,
    contactName: c.contactName,
    phone: c.phone,
    email: c.email,
    city: c.city,
    department: c.department,
    rating: c.rating,
    rubros: c.rubros as ContractorDTO["rubros"],
    status: c.status as ContractorDTO["status"],
    notes: c.notes,
    avgRating,
    historyCount: c.history?.length ?? 0,
    createdAt: c.createdAt.toISOString(),
  };
}

export function serializeSupplier(s: Supplier): SupplierDTO {
  return {
    id: s.id,
    name: s.name,
    ruc: s.ruc,
    contactName: s.contactName,
    phone: s.phone,
    email: s.email,
    city: s.city,
    department: s.department,
    categories: s.categories as SupplierDTO["categories"],
    status: s.status as SupplierDTO["status"],
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
  };
}

type SpecWithRecipe = PoleSpec & {
  lots?: { id: string }[];
  recipeItems?: (PoleRecipeItem & { material: RawMaterial })[];
};

export function serializePoleSpec(s: SpecWithRecipe): PoleSpecDTO {
  const recipeItems = s.recipeItems ?? [];
  return {
    id: s.id,
    nombre: s.nombre,
    longitud: Number(s.longitud),
    esfuerzoNominal: Number(s.esfuerzoNominal),
    diametroBase: s.diametroBase !== null ? Number(s.diametroBase) : null,
    resistenciaHormigon: s.resistenciaHormigon,
    armadura: s.armadura,
    normaAnde: s.normaAnde,
    notas: s.notas,
    activo: s.activo,
    lotCount: s.lots?.length ?? 0,
    recipeCount: recipeItems.length,
    costoEstimadoPorPosteGs: recipeItems.reduce((sum, ri) => sum + Number(ri.cantidadPorPoste) * Number(ri.material.costoUnitarioGs), 0),
    createdAt: s.createdAt.toISOString(),
  };
}

export function serializePoleSpecDetail(s: SpecWithRecipe): PoleSpecDetailDTO {
  return {
    ...serializePoleSpec(s),
    recipe: (s.recipeItems ?? []).map(serializeRecipeItem),
  };
}

export function serializeRawMaterial(
  m: RawMaterial & {
    recipeItems?: { id: string }[];
    consumptions?: { cantidadTotal: any; costoTotalGs: any }[];
    purchases?: { cantidad: any }[];
  }
): RawMaterialDTO {
  const consumptions = m.consumptions ?? [];
  const purchases = m.purchases ?? [];
  const consumidoTotal = consumptions.reduce((sum, c) => sum + Number(c.cantidadTotal), 0);
  const compradoTotal = purchases.reduce((sum, p) => sum + Number(p.cantidad), 0);
  return {
    id: m.id,
    nombre: m.nombre,
    unidad: m.unidad,
    costoUnitarioGs: Number(m.costoUnitarioGs),
    proveedor: m.proveedor,
    notas: m.notas,
    activo: m.activo,
    recipeCount: m.recipeItems?.length ?? 0,
    consumidoTotal,
    costoTotalConsumidoGs: consumptions.reduce((sum, c) => sum + Number(c.costoTotalGs), 0),
    compradoTotal,
    stockDisponible: compradoTotal - consumidoTotal,
    createdAt: m.createdAt.toISOString(),
  };
}

export function serializeMaterialPurchase(p: MaterialPurchase & { material: RawMaterial }): MaterialPurchaseDTO {
  return {
    id: p.id,
    materialId: p.materialId,
    materialNombre: p.material.nombre,
    unidad: p.material.unidad,
    fecha: p.fecha.toISOString().slice(0, 10),
    cantidad: Number(p.cantidad),
    costoUnitarioGs: Number(p.costoUnitarioGs),
    costoTotalGs: Number(p.costoTotalGs),
    proveedor: p.proveedor,
    tipoDocumento: p.tipoDocumento as PurchaseDocType,
    numeroDocumento: p.numeroDocumento,
    notas: p.notas,
    createdAt: p.createdAt.toISOString(),
  };
}

export function serializeRecipeItem(ri: PoleRecipeItem & { material: RawMaterial }): PoleRecipeItemDTO {
  const cantidadPorPoste = Number(ri.cantidadPorPoste);
  const costoUnitarioGs = Number(ri.material.costoUnitarioGs);
  return {
    id: ri.id,
    specId: ri.specId,
    materialId: ri.materialId,
    materialNombre: ri.material.nombre,
    unidad: ri.material.unidad,
    costoUnitarioGs,
    cantidadPorPoste,
    subtotalGs: cantidadPorPoste * costoUnitarioGs,
    notas: ri.notas,
    createdAt: ri.createdAt.toISOString(),
  };
}

export function serializeConsumption(c: PoleLotMaterialConsumption): PoleLotMaterialConsumptionDTO {
  return {
    id: c.id,
    lotId: c.lotId,
    materialId: c.materialId,
    materialNombre: c.materialNombre,
    unidad: c.unidad,
    cantidadPorPoste: Number(c.cantidadPorPoste),
    costoUnitarioGs: Number(c.costoUnitarioGs),
    cantidadTotal: Number(c.cantidadTotal),
    costoTotalGs: Number(c.costoTotalGs),
  };
}

export function serializeQualityTest(t: PoleQualityTest): PoleQualityTestDTO {
  return {
    id: t.id,
    lotId: t.lotId,
    tipo: t.tipo,
    resultado: t.resultado,
    fecha: t.fecha.toISOString().slice(0, 10),
    valorMedido: t.valorMedido,
    responsable: t.responsable,
    observaciones: t.observaciones,
    createdAt: t.createdAt.toISOString(),
  };
}

export function serializePoleLot(
  l: PoleLot & { spec?: { nombre: string }; tests?: PoleQualityTest[]; materialConsumptions?: PoleLotMaterialConsumption[] }
): PoleLotDTO {
  const materialConsumptions = (l.materialConsumptions ?? []).map(serializeConsumption);
  return {
    id: l.id,
    specId: l.specId,
    specNombre: l.spec?.nombre ?? "",
    codigo: l.codigo,
    cantidad: l.cantidad,
    cantidadParaEnsayo: l.cantidadParaEnsayo,
    cantidadDespachada: l.cantidadDespachada,
    fechaColado: l.fechaColado.toISOString().slice(0, 10),
    fechaDesmolde: l.fechaDesmolde ? l.fechaDesmolde.toISOString().slice(0, 10) : null,
    estado: l.estado as PoleLotDTO["estado"],
    responsable: l.responsable,
    ciudadDestino: l.ciudadDestino,
    andeAprobado: l.andeAprobado,
    andeFecha: l.andeFecha ? l.andeFecha.toISOString().slice(0, 10) : null,
    andeActa: l.andeActa,
    andeInspector: l.andeInspector,
    numeracionAnde: l.numeracionAnde,
    notas: l.notas,
    tests: (l.tests ?? []).map(serializeQualityTest),
    materialConsumptions,
    costoMaterialTotalGs: materialConsumptions.reduce((sum, c) => sum + c.costoTotalGs, 0),
    createdAt: l.createdAt.toISOString(),
  };
}
