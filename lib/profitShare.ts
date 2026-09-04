import type { ProjectDTO, GeneralMovementDTO } from "./types";

// Datos puros (sin Prisma) — se usa solo desde app/personal/page.tsx
// (cliente), calculando sobre los mismos ProjectDTO/GeneralMovementDTO que
// ya trae /api/projects y /api/general-movements, sin necesitar un
// endpoint aparte.

/**
 * Reparto de beneficios pedido por el usuario: del 100% del beneficio de
 * cada "fuente" (una obra, o un movimiento general de tipo "ingreso"), un
 * 15% es para quien la consiguió ("responsable"); del 85% restante, un 55%
 * es para Ignacio Samaniego (socio mayoritario) y un 45% para Hugo Rotela.
 *
 * Los egresos generales (sin obra asociada — royalties, pagos a
 * proveedores, compras, etc.) también entran al cálculo, pero solo restan
 * del 85% que se reparten los socios: el 15% de cada responsable se calcula
 * únicamente sobre lo que esa persona consiguió, sin verse afectado por
 * gastos generales de la empresa.
 */
export const RESPONSABLE_PCT = 0.15;
export const PARTNERS = [
  { nombre: "Ignacio Samaniego", pct: 0.55 },
  { nombre: "Hugo Rotela", pct: 0.45 },
] as const;

export const SIN_RESPONSABLE_LABEL = "Sin responsable asignado";

/**
 * Una "fuente" de beneficio (o costo) a repartir:
 *  - "obra": el beneficio de un proyecto entero (budget - spent), atribuido
 *    a su Responsable (Project.manager — "quien consiguió la obra").
 *  - "ingreso": el monto completo de un GeneralMovement con tipo="ingreso"
 *    (un ingreso sin obra asociada), atribuido a su campo `responsable`.
 *  - "egreso": el monto completo, en negativo, de un GeneralMovement con
 *    tipo="egreso" (gasto general sin obra asociada). No lleva 15% de
 *    responsable — resta directo del 85% que se reparten los socios (ver
 *    splitSource).
 * Los movimientos de obra individuales (Gasto, Adelanto, etc.) no son
 * "fuentes" propias — ya están descontados dentro del beneficio de la obra
 * (spent).
 */
export interface BeneficioSource {
  id: string;
  kind: "obra" | "ingreso" | "egreso";
  label: string;
  href: string;
  fecha: string | null; // solo "ingreso"/"egreso" — las obras no tienen una fecha puntual de beneficio
  beneficio: number;
  responsable: string | null; // null = todavía sin cargar (o no aplica, en "egreso")
}

export interface BeneficioSourceSplit extends BeneficioSource {
  responsableMonto: number;
  restante: number; // beneficio - responsableMonto (= beneficio * 0.85)
  partnerMontos: { nombre: string; monto: number }[];
}

export function buildBeneficioSources(projects: ProjectDTO[], generalMovements: GeneralMovementDTO[]): BeneficioSource[] {
  const obraSources: BeneficioSource[] = projects.map((p) => ({
    id: `obra-${p.id}`,
    kind: "obra",
    label: p.name,
    href: `/project/${p.id}`,
    fecha: null,
    beneficio: p.budget - p.spent,
    responsable: p.manager?.trim() || null,
  }));
  const ingresoSources: BeneficioSource[] = generalMovements
    .filter((m) => m.tipo === "ingreso")
    .map((m) => ({
      id: `general-${m.id}`,
      kind: "ingreso",
      label: m.concepto,
      href: "/movimientos",
      fecha: m.fecha,
      beneficio: m.monto,
      responsable: m.responsable?.trim() || null,
    }));
  const egresoSources: BeneficioSource[] = generalMovements
    .filter((m) => m.tipo === "egreso")
    .map((m) => ({
      id: `general-${m.id}`,
      kind: "egreso",
      label: m.concepto,
      href: "/movimientos",
      fecha: m.fecha,
      beneficio: -m.monto,
      responsable: m.responsable?.trim() || null,
    }));
  return [...obraSources, ...ingresoSources, ...egresoSources];
}

export function splitSource(source: BeneficioSource): BeneficioSourceSplit {
  // Los egresos generales no le restan al 15% de nadie — ya lo ganó sobre
  // lo que consiguió; el gasto lo absorben los socios en su 85%.
  const pct = source.kind === "egreso" ? 0 : RESPONSABLE_PCT;
  const responsableMonto = source.beneficio * pct;
  const restante = source.beneficio - responsableMonto;
  return {
    ...source,
    responsableMonto,
    restante,
    partnerMontos: PARTNERS.map((p) => ({ nombre: p.nombre, monto: restante * p.pct })),
  };
}

export interface ProfitShareSummary {
  sources: BeneficioSourceSplit[];
  totalBeneficio: number;
  /** Total del 15% por persona — clave = nombre del responsable (nunca SIN_RESPONSABLE_LABEL, ver sinResponsableTotal). */
  porResponsable: Map<string, number>;
  sinResponsableTotal: number;
  /** Total final por socio (55%/45% del 85% restante), sumado en todas las fuentes. */
  socioTotales: Map<string, number>;
}

export function summarizeProfitShare(projects: ProjectDTO[], generalMovements: GeneralMovementDTO[]): ProfitShareSummary {
  const sources = buildBeneficioSources(projects, generalMovements).map(splitSource);

  let totalBeneficio = 0;
  let sinResponsableTotal = 0;
  const porResponsable = new Map<string, number>();
  const socioTotales = new Map<string, number>(PARTNERS.map((p) => [p.nombre, 0]));

  for (const s of sources) {
    totalBeneficio += s.beneficio;
    if (s.responsable) {
      porResponsable.set(s.responsable, (porResponsable.get(s.responsable) ?? 0) + s.responsableMonto);
    } else {
      sinResponsableTotal += s.responsableMonto;
    }
    for (const p of s.partnerMontos) {
      socioTotales.set(p.nombre, (socioTotales.get(p.nombre) ?? 0) + p.monto);
    }
  }

  return { sources, totalBeneficio, porResponsable, sinResponsableTotal, socioTotales };
}
