"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ProjectDTO, ProjectInput, ProjectStatus, ProjectType } from "@/lib/types";

const TYPE_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial" };
const STATUS_LABEL: Record<ProjectStatus, string> = {
  planificado: "Planificado",
  en_curso: "En curso",
  pausado: "Pausado",
  finalizado: "Finalizado",
};
const STATUS_ORDER: ProjectStatus[] = ["planificado", "en_curso", "pausado", "finalizado"];
const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "kanban", label: "Tablero" },
  { key: "tabla", label: "Tabla" },
  { key: "gantt", label: "Cronograma" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function fmtMoney(n: number) {
  return "$" + Number(n || 0).toLocaleString("es-AR");
}
function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}
function clampPct(n: number) {
  return Math.max(0, Math.min(100, Math.round(n || 0)));
}

const EMPTY_FORM: ProjectInput = {
  name: "",
  type: "civil",
  status: "planificado",
  manager: "",
  start: "",
  end: "",
  budget: 0,
  spent: 0,
  progress: 0,
};

export default function Home() {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [saveState, setSaveState] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    loadProjects();
    const saved = typeof window !== "undefined" ? (localStorage.getItem("obrasflow-theme") as "light" | "dark" | null) : null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("obrasflow-theme", next);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  async function loadProjects() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ProjectDTO[] = await res.json();
      setProjects(data);
    } catch (err) {
      setLoadError("No se pudieron cargar los proyectos. Verificá la conexión a la base de datos.");
    } finally {
      setLoading(false);
    }
  }

  function openModal(project: ProjectDTO | null) {
    setFormError(null);
    setEditingId(project ? project.id : null);
    setForm(
      project
        ? {
            name: project.name,
            type: project.type,
            status: project.status,
            manager: project.manager,
            start: project.start,
            end: project.end,
            budget: project.budget,
            spent: project.spent,
            progress: project.progress,
          }
        : EMPTY_FORM
    );
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.manager.trim() || !form.start || !form.end) {
      setFormError("Completá nombre, responsable y ambas fechas.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(editingId ? `/api/projects/${editingId}` : "/api/projects", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const saved: ProjectDTO = await res.json();
      setProjects((prev) => {
        if (editingId) return prev.map((p) => (p.id === editingId ? saved : p));
        return [...prev, saved];
      });
      setSaveState("Guardado");
      closeModal();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar el proyecto.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProject(p: ProjectDTO) {
    if (!confirm(`¿Eliminar "${p.name}"? Esta acción no se puede deshacer.`)) return;
    const prev = projects;
    setProjects((cur) => cur.filter((x) => x.id !== p.id));
    try {
      const res = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setSaveState("Guardado");
    } catch (err) {
      setProjects(prev);
      setToast("No se pudo eliminar el proyecto.");
    }
  }

  async function moveStatus(p: ProjectDTO, dir: 1 | -1) {
    const idx = STATUS_ORDER.indexOf(p.status);
    const nextIdx = Math.max(0, Math.min(STATUS_ORDER.length - 1, idx + dir));
    const nextStatus = STATUS_ORDER[nextIdx];
    if (nextStatus === p.status) return;
    const nextProgress = nextStatus === "finalizado" ? 100 : p.progress;

    const prev = projects;
    setProjects((cur) =>
      cur.map((x) => (x.id === p.id ? { ...x, status: nextStatus, progress: nextProgress } : x))
    );
    try {
      const res = await fetch(`/api/projects/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, progress: nextProgress }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveState("Guardado");
    } catch (err) {
      setProjects(prev);
      setToast("No se pudo actualizar el estado.");
    }
  }

  const metrics = useMemo(() => {
    const byType: Record<ProjectType, { count: number; budget: number }> = {
      civil: { count: 0, budget: 0 },
      electrico: { count: 0, budget: 0 },
      vial: { count: 0, budget: 0 },
    };
    let totalBudget = 0,
      totalSpent = 0,
      totalProgress = 0,
      active = 0,
      finished = 0;
    projects.forEach((p) => {
      byType[p.type].count++;
      byType[p.type].budget += p.budget;
      totalBudget += p.budget;
      totalSpent += p.spent;
      totalProgress += clampPct(p.progress);
      if (p.status === "en_curso") active++;
      if (p.status === "finalizado") finished++;
    });
    const avgProgress = projects.length ? Math.round(totalProgress / projects.length) : 0;
    const execPct = totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0;
    return { byType, totalBudget, totalSpent, avgProgress, execPct, active, finished };
  }, [projects]);

  return (
    <div id="app">
      <header className="top">
        <div className="brand">
          <span className="mark">🏗️ ObrasFlow</span>
          <span className="tag">Civil · Eléctrico · Vial</span>
        </div>
        <div className="actions">
          <span className="save-state">{saveState}</span>
          <button className="btn ghost icon-btn" type="button" onClick={toggleTheme} title="Cambiar tema" aria-label="Cambiar tema claro/oscuro">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button className="btn primary" type="button" onClick={() => openModal(null)}>
            + Nuevo proyecto
          </button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={"tab-btn" + (tab === t.key ? " active" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading && <p className="state-message">Cargando proyectos…</p>}
      {!loading && loadError && (
        <p className="state-message form-error">
          {loadError} <button className="btn small" onClick={loadProjects}>Reintentar</button>
        </p>
      )}

      {!loading && !loadError && (
        <>
          <section className="view active" hidden={tab !== "dashboard"}>
            <DashboardView projects={projects} metrics={metrics} />
          </section>
          <section className="view active" hidden={tab !== "kanban"}>
            <KanbanView projects={projects} onEdit={openModal} onMove={moveStatus} />
          </section>
          <section className="view active" hidden={tab !== "tabla"}>
            <TablaView projects={projects} onEdit={openModal} onDelete={deleteProject} />
          </section>
          <section className="view active" hidden={tab !== "gantt"}>
            <GanttView projects={projects} />
          </section>
        </>
      )}

      <footer className="credit">Datos en Postgres vía Prisma — cada cambio se guarda con la API.</footer>

      {modalOpen && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <h3>{editingId ? "Editar proyecto" : "Nuevo proyecto"}</h3>
            {formError && <p className="form-error">{formError}</p>}
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="f-name">Nombre del proyecto</label>
                <input
                  id="f-name"
                  required
                  placeholder="Ej. Puente Río Claro"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="f-type">Tipo</label>
                  <select
                    id="f-type"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as ProjectType })}
                  >
                    <option value="civil">Civil</option>
                    <option value="electrico">Eléctrico</option>
                    <option value="vial">Vial</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="f-status">Estado</label>
                  <select
                    id="f-status"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
                  >
                    <option value="planificado">Planificado</option>
                    <option value="en_curso">En curso</option>
                    <option value="pausado">Pausado</option>
                    <option value="finalizado">Finalizado</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="f-manager">Responsable</label>
                <input
                  id="f-manager"
                  required
                  placeholder="Ej. Ana Torres"
                  value={form.manager}
                  onChange={(e) => setForm({ ...form, manager: e.target.value })}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="f-start">Fecha inicio</label>
                  <input
                    id="f-start"
                    type="date"
                    required
                    value={form.start}
                    onChange={(e) => setForm({ ...form, start: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="f-end">Fecha fin</label>
                  <input
                    id="f-end"
                    type="date"
                    required
                    value={form.end}
                    onChange={(e) => setForm({ ...form, end: e.target.value })}
                  />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="f-budget">Presupuesto (USD)</label>
                  <input
                    id="f-budget"
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={form.budget}
                    onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="f-spent">Ejecutado (USD)</label>
                  <input
                    id="f-spent"
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={form.spent}
                    onChange={(e) => setForm({ ...form, spent: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="f-progress">Avance (%)</label>
                <input
                  id="f-progress"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  required
                  value={form.progress}
                  onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn ghost" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={"toast" + (toast ? " show" : "")}>{toast}</div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value mono">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

interface DashboardMetrics {
  byType: Record<ProjectType, { count: number; budget: number }>;
  totalBudget: number;
  totalSpent: number;
  avgProgress: number;
  execPct: number;
  active: number;
  finished: number;
}

function DashboardView({ projects, metrics }: { projects: ProjectDTO[]; metrics: DashboardMetrics }) {
  const { byType, totalBudget, totalSpent, avgProgress, execPct, active, finished } = metrics;
  const sortedByProgress = [...projects].sort((a, b) => clampPct(b.progress) - clampPct(a.progress));

  const now = Date.now();
  const overBudget = projects.filter((p) => p.spent > p.budget);
  const dueSoon = projects
    .filter((p) => p.status !== "finalizado")
    .map((p) => ({ p, daysLeft: Math.ceil((new Date(p.end).getTime() - now) / 86400000) }))
    .filter((x) => x.daysLeft <= 7);

  return (
    <>
      {(overBudget.length > 0 || dueSoon.length > 0) && (
        <div className="alert-row">
          {dueSoon.length > 0 && (
            <div className="alert-card alert-warn">
              <div className="alert-card-title">⏰ Vencimientos próximos</div>
              <ul>
                {dueSoon.map(({ p, daysLeft }) => (
                  <li key={p.id}>
                    <Link href={`/project/${p.id}`}>{p.name}</Link> — {daysLeft < 0 ? `vencido hace ${Math.abs(daysLeft)}d` : daysLeft === 0 ? "vence hoy" : `${daysLeft}d restantes`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {overBudget.length > 0 && (
            <div className="alert-card alert-crit">
              <div className="alert-card-title">💸 Sobre presupuesto</div>
              <ul>
                {overBudget.map((p) => (
                  <li key={p.id}>
                    <Link href={`/project/${p.id}`}>{p.name}</Link> — {fmtMoney(p.spent)} / {fmtMoney(p.budget)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="kpi-row">
        <Kpi label="Proyectos totales" value={projects.length} sub={`${active} en curso · ${finished} finalizados`} />
        <Kpi label="Presupuesto total" value={fmtMoney(totalBudget)} sub={`${fmtMoney(totalSpent)} ejecutado`} />
        <Kpi
          label="Ejecución presupuestaria"
          value={`${execPct}%`}
          sub={execPct > 100 ? "sobre presupuesto" : "del total planificado"}
        />
        <Kpi label="Avance promedio" value={`${avgProgress}%`} sub={`sobre ${projects.length} proyectos`} />
      </div>

      <div className="panel">
        <h3>Presupuesto por tipo de obra</h3>
        {(["civil", "electrico", "vial"] as ProjectType[]).map((t) => {
          const d = byType[t];
          const pct = totalBudget ? Math.round((d.budget / totalBudget) * 100) : 0;
          return (
            <div className="bar-row" key={t}>
              <span className={`type-pill type-${t}`}>{TYPE_LABEL[t]}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${pct}%`, background: `var(--${t})` }} />
              </div>
              <span className="mono">
                {fmtMoney(d.budget)} · {d.count} proy.
              </span>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <h3>Avance por proyecto</h3>
        {sortedByProgress.length === 0 && <EmptyMsg />}
        {sortedByProgress.map((p) => {
          const pct = clampPct(p.progress);
          const over = p.spent > p.budget;
          return (
            <div className="bar-row" key={p.id}>
              <span title={p.name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}
              </span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${pct}%`, background: `var(--${p.type})` }} />
              </div>
              <span className="mono" style={{ color: over ? "var(--crit)" : "var(--ink-soft)" }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
function EmptyMsg() {
  return <p className="empty-col">Sin proyectos todavía. Creá el primero con &quot;Nuevo proyecto&quot;.</p>;
}

function KanbanView({
  projects,
  onEdit,
  onMove,
}: {
  projects: ProjectDTO[];
  onEdit: (p: ProjectDTO) => void;
  onMove: (p: ProjectDTO, dir: 1 | -1) => void;
}) {
  return (
    <div className="kanban">
      {STATUS_ORDER.map((status) => {
        const items = projects.filter((p) => p.status === status);
        return (
          <div className="kanban-col" key={status}>
            <h3>
              {STATUS_LABEL[status]} <span className="count mono">{items.length}</span>
            </h3>
            {items.length === 0 && <p className="empty-col">Vacío</p>}
            {items.map((p) => {
              const pct = clampPct(p.progress);
              const idx = STATUS_ORDER.indexOf(p.status);
              return (
                <div className={`card type-border-${p.type}`} key={p.id}>
                  <div className="name"><Link href={`/project/${p.id}`}>{p.name}</Link></div>
                  <div className="meta">
                    <span className={`type-pill type-${p.type}`}>{TYPE_LABEL[p.type]}</span> · {p.manager}
                  </div>
                  <div className="progress-line">
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${pct}%`, background: `var(--${p.type})` }} />
                    </div>
                    <span className="mono">{pct}%</span>
                  </div>
                  <div className="card-actions">
                    <button className="btn small" type="button" onClick={() => onEdit(p)}>
                      Editar
                    </button>
                    {idx > 0 && (
                      <button className="btn small" type="button" onClick={() => onMove(p, -1)}>
                        ←
                      </button>
                    )}
                    {idx < STATUS_ORDER.length - 1 && (
                      <button className="btn small" type="button" onClick={() => onMove(p, 1)}>
                        →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function exportCSV(projects: ProjectDTO[]) {
  const headers = ["Nombre", "Tipo", "Responsable", "Inicio", "Fin", "Estado", "Presupuesto", "Ejecutado", "Avance"];
  const rows = projects.map((p) => [
    p.name, TYPE_LABEL[p.type], p.manager, p.start, p.end, STATUS_LABEL[p.status], p.budget, p.spent, `${p.progress}%`,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `obrasflow-proyectos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function TablaView({
  projects,
  onEdit,
  onDelete,
}: {
  projects: ProjectDTO[];
  onEdit: (p: ProjectDTO) => void;
  onDelete: (p: ProjectDTO) => void;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ProjectType | "">("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");

  const filtered = projects.filter((p) => {
    if (typeFilter && p.type !== typeFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    if (search && !(`${p.name} ${p.manager}`.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="panel">
      <div className="module-panel-head">
        <h3>Seguimiento de proyectos</h3>
        <button className="btn" type="button" onClick={() => exportCSV(filtered)}>⬇ Exportar CSV</button>
      </div>

      <div className="table-filters">
        <input
          className="table-search"
          type="text"
          placeholder="Buscar por nombre o responsable…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ProjectType | "")}>
          <option value="">Todos los tipos</option>
          <option value="civil">Civil</option>
          <option value="electrico">Eléctrico</option>
          <option value="vial">Vial</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | "")}>
          <option value="">Todos los estados</option>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table className="projects">
          <thead>
            <tr>
              <th>Proyecto</th>
              <th>Tipo</th>
              <th>Responsable</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Estado</th>
              <th>Presupuesto</th>
              <th>Avance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="empty-col">
                  {projects.length === 0 ? "Sin proyectos todavía." : "Ningún proyecto coincide con el filtro."}
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/project/${p.id}`}><strong>{p.name}</strong></Link>
                </td>
                <td>
                  <span className={`type-pill type-${p.type}`}>{TYPE_LABEL[p.type]}</span>
                </td>
                <td>{p.manager}</td>
                <td className="mono">{fmtDate(p.start)}</td>
                <td className="mono">{fmtDate(p.end)}</td>
                <td>
                  <span className={`status-chip status-${p.status}`}>{STATUS_LABEL[p.status]}</span>
                </td>
                <td className="mono">{fmtMoney(p.budget)}</td>
                <td className="mono">{clampPct(p.progress)}%</td>
                <td className="row-actions">
                  <button className="btn small" type="button" onClick={() => onEdit(p)}>
                    Editar
                  </button>
                  <button className="btn small danger" type="button" onClick={() => onDelete(p)}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GanttView({ projects }: { projects: ProjectDTO[] }) {
  if (projects.length === 0) {
    return (
      <div className="panel">
        <h3>Cronograma</h3>
        <EmptyMsg />
      </div>
    );
  }
  const starts = projects.map((p) => new Date(p.start).getTime());
  const ends = projects.map((p) => new Date(p.end).getTime());
  const min = Math.min(...starts);
  const max = Math.max(...ends);
  const span = Math.max(max - min, 86400000);
  const sorted = [...projects].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const minISO = new Date(min).toISOString().slice(0, 10);
  const maxISO = new Date(max).toISOString().slice(0, 10);

  return (
    <div className="panel">
      <h3>Cronograma</h3>
      <div className="gantt-wrap">
        <div className="gantt">
          <div className="gantt-scale">
            <div />
            <div className="marks">
              <span style={{ position: "absolute", left: 0 }}>{fmtDate(minISO)}</span>
              <span style={{ position: "absolute", right: 0 }}>{fmtDate(maxISO)}</span>
            </div>
          </div>
          {sorted.map((p) => {
            const s = new Date(p.start).getTime();
            const e = new Date(p.end).getTime();
            const left = ((s - min) / span) * 100;
            const width = Math.max(((e - s) / span) * 100, 1);
            return (
              <div className="gantt-row" key={p.id}>
                <div className="label" title={p.name}>
                  {p.name}
                </div>
                <div className="gantt-track">
                  <div
                    className={`gantt-bar type-${p.type}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${p.name} · ${fmtDate(p.start)} → ${fmtDate(p.end)}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
