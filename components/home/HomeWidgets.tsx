"use client";

// Piezas del tablero de Inicio (app/page.tsx): el bloque "Hoy" con lo que
// necesita atención, las cifras principales, la lista de obras con filtros y
// las secciones plegables (lo pesado —Gantt, 3D— solo se dibuja al abrirlo).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { dayjs, TZ } from "@/lib/dayjs";
import type { ProjectDTO, ProjectStatus, ProjectType } from "@/lib/types";

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

/** Días hasta la fecha de fin (negativo = vencida). */
export function daysLeft(end: string): number {
  return dayjs.tz(end, TZ).startOf("day").diff(dayjs().tz(TZ).startOf("day"), "day");
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

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Preferencias chicas por usuario (filtros, secciones abiertas). Si el navegador no deja guardar, sigue funcionando. */
function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw));
    } catch {
      /* sin almacenamiento: queda el valor inicial */
    }
  }, [key]);
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* idem */
    }
  };
  return [value, set];
}

/* ───────────── Hoy ───────────── */

export interface AttentionItem {
  key: string;
  light: Exclude<Light, "none"> | "info";
  title: ReactNode;
  detail: string;
  href: string;
}

export function TodayPanel({ projects, items }: { projects: ProjectDTO[]; items: AttentionItem[] }) {
  const now = dayjs().tz(TZ);
  const h = now.hour();
  const saludo = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const enCurso = projects.filter((p) => p.status === "en_curso").length;
  const crit = items.filter((i) => i.light === "crit").length;
  return (
    <section className="home-today animate__animated animate__fadeIn">
      <div className="home-today-head">
        <div>
          <p className="home-today-date">{now.format("dddd D [de] MMMM")}</p>
          <h2 className="home-today-title">{saludo} 👋</h2>
          <p className="home-today-sub">
            {enCurso} obra{enCurso === 1 ? "" : "s"} en curso ·{" "}
            {items.length === 0 ? "todo en orden" : `${items.length} cosa${items.length === 1 ? "" : "s"} para mirar${crit ? ` (${crit} urgente${crit === 1 ? "" : "s"})` : ""}`}
          </p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="home-attn-empty">🟢 Nada urgente: ninguna obra pasada de presupuesto ni vencida.</div>
      ) : (
        <ul className="home-attn">
          {items.map((i) => (
            <li key={i.key}>
              <Link href={i.href} className={`home-attn-row is-${i.light}`}>
                <span className="dot" aria-hidden="true" />
                <span className="what">{i.title}</span>
                <span className="why">{i.detail}</span>
                <span className="go" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Arma la lista de "necesita atención", de lo más urgente a lo menos. */
export function attentionItems(projects: ProjectDTO[], extras: { pendingQuick?: number; fiscalizaciones?: number }): AttentionItem[] {
  const items: (AttentionItem & { rank: number })[] = [];
  for (const p of projects) {
    if (p.status === "finalizado") continue;
    const b = budgetState(p);
    const name = (
      <>
        {p.name}
        {p.reference ? <span className="ref"> · {p.reference}</span> : null}
      </>
    );
    if (b.light === "crit") {
      items.push({ key: `b-${p.id}`, rank: 0, light: "crit", title: name, detail: `Pasó el presupuesto: ${b.pct} % (${fmtGsShort(p.spent - p.budget)} de más)`, href: `/project/${p.id}` });
    } else if (b.pct !== null && b.pct >= 90) {
      items.push({ key: `b-${p.id}`, rank: 2, light: "warn", title: name, detail: `Cerca del tope: ${b.pct} % · quedan ${fmtGsShort(p.budget - p.spent)}`, href: `/project/${p.id}` });
    }
    const d = daysLeft(p.end);
    if (d < 0) {
      items.push({ key: `d-${p.id}`, rank: 1, light: "crit", title: name, detail: `Venció hace ${-d} día${d === -1 ? "" : "s"} (avance ${Math.round(p.progress)} %)`, href: `/project/${p.id}` });
    } else if (d <= 7) {
      items.push({ key: `d-${p.id}`, rank: 3, light: "warn", title: name, detail: d === 0 ? "Vence hoy" : `Vence en ${d} día${d === 1 ? "" : "s"} (avance ${Math.round(p.progress)} %)`, href: `/project/${p.id}` });
    }
  }
  if (extras.pendingQuick) {
    items.push({ key: "quick", rank: 4, light: "info", title: "Registro rápido", detail: `${extras.pendingQuick} pago${extras.pendingQuick === 1 ? "" : "s"} sin clasificar`, href: "/registro-rapido" });
  }
  if (extras.fiscalizaciones) {
    items.push({ key: "fisc", rank: 5, light: "info", title: "Fábrica de Postes", detail: `${extras.fiscalizaciones} fiscalización${extras.fiscalizaciones === 1 ? "" : "es"} ANDE esta semana`, href: "/postes" });
  }
  return items.sort((a, b) => a.rank - b.rank).map(({ rank: _r, ...i }) => i);
}

/* ───────────── Cifras ───────────── */

export function StatCard({
  label,
  value,
  title,
  sub,
  tone,
  bar,
  href,
}: {
  label: string;
  value: string | number;
  title?: string;
  sub?: ReactNode;
  tone?: Light;
  bar?: { pct: number; light: Light };
  href?: string;
}) {
  const body = (
    <div className={`home-stat${href ? " is-link" : ""}`}>
      <div className="l">{label}</div>
      <div className={`n${tone ? ` tone-${tone}` : ""}`} title={title}>
        {value}
      </div>
      {bar && (
        <div className="home-bar" aria-hidden="true">
          <span className={`fill is-${bar.light}`} style={{ width: `${Math.min(100, Math.max(0, bar.pct))}%` }} />
        </div>
      )}
      {sub && <div className="s">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="text-reset text-decoration-none d-block h-100">
      {body}
    </Link>
  ) : (
    body
  );
}

/* ───────────── Obras ───────────── */

type SortKey = "atencion" | "vence" | "avance" | "nombre";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "atencion", label: "Más comprometidas primero" },
  { key: "vence", label: "Próximas a vencer" },
  { key: "avance", label: "Mayor avance" },
  { key: "nombre", label: "Nombre (A-Z)" },
];
const STATUS_FILTERS: { key: ProjectStatus | "activas" | "todas"; label: string }[] = [
  { key: "activas", label: "Activas" },
  { key: "en_curso", label: "En curso" },
  { key: "planificado", label: "Planificadas" },
  { key: "pausado", label: "Pausadas" },
  { key: "finalizado", label: "Finalizadas" },
  { key: "todas", label: "Todas" },
];
const LIGHT_RANK: Record<Light, number> = { crit: 0, warn: 1, ok: 2, none: 3 };

export function ObrasList({ projects }: { projects: ProjectDTO[] }) {
  const [status, setStatus] = useStored<(typeof STATUS_FILTERS)[number]["key"]>("of-home-status", "activas");
  const [type, setType] = useStored<ProjectType | "">("of-home-type", "");
  const [sort, setSort] = useStored<SortKey>("of-home-sort", "atencion");
  const [q, setQ] = useState("");

  const types = useMemo(() => (["civil", "electrico", "vial", "otro"] as ProjectType[]).filter((t) => projects.some((p) => p.type === t)), [projects]);

  const rows = useMemo(() => {
    const nq = norm(q.trim());
    const list = projects.filter((p) => {
      if (status === "activas" && p.status === "finalizado") return false;
      if (status !== "activas" && status !== "todas" && p.status !== status) return false;
      if (type && p.type !== type) return false;
      if (nq && !norm([p.name, p.reference ?? "", p.sitioNombre ?? "", p.city ?? "", p.manager].join(" ")).includes(nq)) return false;
      return true;
    });
    const withMeta = list.map((p) => ({ p, b: budgetState(p), d: daysLeft(p.end) }));
    withMeta.sort((a, b) => {
      if (sort === "nombre") return a.p.name.localeCompare(b.p.name, "es");
      if (sort === "avance") return b.p.progress - a.p.progress;
      if (sort === "vence") return a.d - b.d;
      const la = Math.min(LIGHT_RANK[a.b.light], a.d < 0 && a.p.status !== "finalizado" ? 0 : 3);
      const lb = Math.min(LIGHT_RANK[b.b.light], b.d < 0 && b.p.status !== "finalizado" ? 0 : 3);
      return la - lb || (b.b.pct ?? 0) - (a.b.pct ?? 0);
    });
    return withMeta;
  }, [projects, status, type, sort, q]);

  return (
    <section className="home-obras">
      <div className="home-obras-head">
        <h2 className="home-h2">Tus obras</h2>
        <Link href="/rubros" className="small">
          Ver por rubro →
        </Link>
      </div>
      <div className="home-filters">
        <div className="home-chips" role="group" aria-label="Estado">
          {STATUS_FILTERS.map((s) => (
            <button key={s.key} type="button" className={status === s.key ? "on" : ""} aria-pressed={status === s.key} onClick={() => setStatus(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="home-filters-right">
          {types.length > 1 && (
            <select className="form-select form-select-sm" value={type} onChange={(e) => setType(e.target.value as ProjectType | "")} aria-label="Rubro">
              <option value="">Todos los rubros</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          )}
          <select className="form-select form-select-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <input className="form-control form-control-sm" type="search" placeholder="Filtrar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar obras" />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty-col">No hay obras con ese filtro.</p>
      ) : (
        <ul className="home-obra-list">
          {rows.map(({ p, b, d }) => {
            const pct = Math.max(0, Math.min(100, Math.round(p.progress || 0)));
            const late = d < 0 && p.status !== "finalizado";
            return (
              <li key={p.id}>
                <Link href={`/project/${p.id}`} className="home-obra">
                  <span className={`home-obra-light is-${late && b.light !== "crit" ? "crit" : b.light}`} aria-hidden="true" />
                  <span className="home-obra-main">
                    <span className="name">
                      {p.name}
                      {p.reference && <span className="ref"> · {p.reference}</span>}
                    </span>
                    <span className="meta">
                      <span className={`home-type t-${p.type}`}>{p.type === "otro" && p.customType ? p.customType : TYPE_LABEL[p.type]}</span>
                      <span>{STATUS_LABEL[p.status]}</span>
                      {p.city && <span>{p.city}</span>}
                      {p.status !== "finalizado" && (
                        <span className={late ? "late" : d <= 7 ? "soon" : ""}>{late ? `venció hace ${-d} d` : d === 0 ? "vence hoy" : `vence en ${d} d`}</span>
                      )}
                    </span>
                  </span>
                  <span className="home-obra-nums">
                    <span className="row-l">Avance</span>
                    <span className="home-bar sm" aria-hidden="true">
                      <span className="fill is-accent" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="v">{pct} %</span>
                    <span className="row-l">Presupuesto</span>
                    <span className="home-bar sm" aria-hidden="true">
                      <span className={`fill is-${b.light}`} style={{ width: `${Math.min(100, b.pct ?? 0)}%` }} />
                    </span>
                    <span className={`v tone-${b.light}`} title={`${fmtGs(p.spent)} de ${fmtGs(p.budget)}`}>
                      {b.pct === null ? "—" : `${b.pct} %`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ───────────── Secciones plegables ───────────── */

/** Sección que se abre y cierra; su contenido recién se dibuja al abrirla (más rápido al entrar). */
export function Fold({ id, title, hint, defaultOpen = false, children }: { id: string; title: ReactNode; hint?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useStored<boolean>(`of-fold-${id}`, defaultOpen);
  return (
    <section className={`home-fold${open ? " is-open" : ""}`}>
      <button type="button" className="home-fold-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="chev" aria-hidden="true">›</span>
        <span className="t">{title}</span>
        {hint && !open && <span className="h">{hint}</span>}
      </button>
      {open && <div className="home-fold-body">{children}</div>}
    </section>
  );
}
