"use client";

// Ayudas compartidas del inicio (tabla de obras, acciones rápidas, exportar):
// nombres de tipo y estado, semáforo de presupuesto, días al vencimiento y
// formato de montos en guaraníes.

import type { ProjectDTO, ProjectStatus, ProjectType } from "@/lib/types";
import { daysBetween, todayLocal } from "@/lib/dates";

export const TYPE_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planificado: "Planificado",
  en_curso: "En curso",
  pausado: "Pausado",
  finalizado: "Finalizado",
};

export type Light = "ok" | "warn" | "crit" | "none";

/** Semáforo de presupuesto: verde hasta 80 %, amarillo hasta 100 %, rojo pasado. */
export function budgetState(p: Pick<ProjectDTO, "budget" | "spent">): { pct: number | null; light: Light } {
  if (!(p.budget > 0)) return { pct: null, light: p.spent > 0 ? "warn" : "none" };
  const pct = Math.round((p.spent / p.budget) * 100);
  return { pct, light: pct > 100 ? "crit" : pct >= 80 ? "warn" : "ok" };
}

/** Días hasta la fecha de fin (negativo = vencida). Días calendario, igual que la ficha de la obra. */
export function daysLeft(end: string): number {
  return daysBetween(todayLocal(), end.slice(0, 10));
}

export function fmtGs(n: number) {
  return "Gs. " + Math.round(Number(n) || 0).toLocaleString("es-PY");
}

/** "Gs. 1,4 M" / "Gs. 850 mil" para cifras grandes en tarjetas (el valor exacto va en el title). */
export function fmtGsShort(n: number) {
  const v = Math.abs(Number(n) || 0);
  const sign = n < 0 ? "-" : "";
  const nf = (x: number) => x.toLocaleString("es-PY", { maximumFractionDigits: x < 10 ? 1 : 0 });
  if (v >= 1e9) return `${sign}Gs. ${nf(v / 1e9)} mil M`;
  if (v >= 1e6) return `${sign}Gs. ${nf(v / 1e6)} M`;
  if (v >= 1e4) return `${sign}Gs. ${nf(v / 1e3)} mil`;
  return `${sign}Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}
