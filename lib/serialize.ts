import type { Project, ProjectItem, Contractor, ContractorHistoryEntry, PoleSpec, PoleLot, PoleQualityTest } from "@prisma/client";
import type { ProjectDTO, ProjectItemDTO, ContractorDTO, ContractorHistoryDTO, PoleSpecDTO, PoleLotDTO, PoleQualityTestDTO } from "./types";

/** Convierte el registro de Prisma (Decimal, Date) a la forma plana que consume el frontend. */
export function serializeProject(p: Project): ProjectDTO {
  return {
    id: p.id,
    name: p.name,
    type: p.type as ProjectDTO["type"],
    customType: p.customType,
    status: p.status as ProjectDTO["status"],
    manager: p.manager,
    start: p.start.toISOString().slice(0, 10),
    end: p.end.toISOString().slice(0, 10),
    budget: Number(p.budget),
    spent: Number(p.spent),
    progress: p.progress,
    sector: p.sector as ProjectDTO["sector"],
    sectorData: (p.sectorData as Record<string, any> | null) ?? null,
  };
}

export function serializeItem(i: ProjectItem): ProjectItemDTO {
  return {
    id: i.id,
    projectId: i.projectId,
    kind: i.kind,
    title: i.title,
    status: i.status,
    data: (i.data as Record<string, any>) ?? {},
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
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
    province: c.province,
    rubros: c.rubros as ContractorDTO["rubros"],
    status: c.status as ContractorDTO["status"],
    notes: c.notes,
    avgRating,
    historyCount: c.history?.length ?? 0,
    createdAt: c.createdAt.toISOString(),
  };
}

export function serializePoleSpec(s: PoleSpec & { lots?: { id: string }[] }): PoleSpecDTO {
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
    createdAt: s.createdAt.toISOString(),
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
  l: PoleLot & { spec?: { nombre: string }; tests?: PoleQualityTest[] }
): PoleLotDTO {
  return {
    id: l.id,
    specId: l.specId,
    specNombre: l.spec?.nombre ?? "",
    codigo: l.codigo,
    cantidad: l.cantidad,
    cantidadDespachada: l.cantidadDespachada,
    fechaColado: l.fechaColado.toISOString().slice(0, 10),
    fechaDesmolde: l.fechaDesmolde ? l.fechaDesmolde.toISOString().slice(0, 10) : null,
    estado: l.estado as PoleLotDTO["estado"],
    responsable: l.responsable,
    andeAprobado: l.andeAprobado,
    andeFecha: l.andeFecha ? l.andeFecha.toISOString().slice(0, 10) : null,
    andeActa: l.andeActa,
    andeInspector: l.andeInspector,
    notas: l.notas,
    tests: (l.tests ?? []).map(serializeQualityTest),
    createdAt: l.createdAt.toISOString(),
  };
}
