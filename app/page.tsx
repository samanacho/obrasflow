"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CCard, CCardBody, CCardHeader, CNav, CNavItem, CNavLink,
  CButton, CButtonGroup, CFormSelect,
  CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell,
  CBadge, CAlert, CInputGroup, CFormInput,
} from "@coreui/react";
import { CChartDoughnut, CChartBar } from "@coreui/react-chartjs";
import CIcon from "@coreui/icons-react";
import {
  cilPlus, cilArrowLeft, cilArrowRight, cilCloudDownload, cilPencil, cilTrash,
  cilPeople, cilStar, cilSpeedometer, cilFlagAlt, cilCalculator, cilListRich, cilViewColumn,
} from "@coreui/icons";
import AppShell from "@/components/AppShell";
import PlotlyGauge from "@/components/PlotlyGauge";
import NewProjectWizard from "@/components/NewProjectWizard";

const ThreeSkyline = dynamic(() => import("@/components/ThreeSkyline"), {
  ssr: false,
  loading: () => <p className="empty-col">Cargando skyline 3D…</p>,
});
const DhtmlxGanttChart = dynamic(() => import("@/components/DhtmlxGanttChart"), {
  ssr: false,
  loading: () => <p className="empty-col">Cargando cronograma…</p>,
});
import type { ProjectDTO, ProjectStatus, ProjectType, DashboardSummaryDTO } from "@/lib/types";

const TYPE_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const TYPE_COLOR: Record<ProjectType, string> = { civil: "info", electrico: "warning", vial: "secondary", otro: "dark" };
const TYPE_HEX: Record<ProjectType, string> = { civil: "#4a6b85", electrico: "#a9803d", vial: "#726c61", otro: "#8172a3" };
/** Para "otro" muestra el rubro que escribió el usuario en vez de la palabra genérica. */
function typeLabel(p: { type: ProjectType; customType?: string | null }): string {
  return p.type === "otro" && p.customType ? p.customType : TYPE_LABEL[p.type];
}
const STATUS_LABEL: Record<ProjectStatus, string> = {
  planificado: "Planificado",
  en_curso: "En curso",
  pausado: "Pausado",
  finalizado: "Finalizado",
};
const STATUS_COLOR: Record<ProjectStatus, string> = {
  planificado: "info",
  en_curso: "warning",
  pausado: "secondary",
  finalizado: "success",
};
const STATUS_ORDER: ProjectStatus[] = ["planificado", "en_curso", "pausado", "finalizado"];
const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "kanban", label: "Tablero" },
  { key: "tabla", label: "Tabla" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function fmtMoney(n: number) {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY");
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

export default function Home() {
  return (
    <Suspense fallback={<div id="app"><p className="state-message">Cargando…</p></div>}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [summary, setSummary] = useState<DashboardSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const initialTab = (searchParams.get("tab") as TabKey) || "dashboard";
  const [tab, setTabState] = useState<TabKey>(TABS.some((t) => t.key === initialTab) ? initialTab : "dashboard");
  const [saveState, setSaveState] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  function setTab(next: TabKey) {
    setTabState(next);
    router.push(next === "dashboard" ? "/" : `/?tab=${next}`, { scroll: false });
  }

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectDTO | null>(null);

  useEffect(() => { loadProjects(); loadSummary(); }, []);

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

  async function loadSummary() {
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) setSummary(await res.json());
    } catch {
      /* el dashboard funciona igual sin estos extras */
    }
  }

  function openModal(project: ProjectDTO | null) {
    setEditingProject(project);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditingProject(null);
  }
  function handleWizardSaved(saved: ProjectDTO) {
    setProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx > -1) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
    setSaveState("Guardado");
    closeModal();
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
      otro: { count: 0, budget: 0 },
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
    <AppShell
      crumbs={[{ label: "Proyectos" }]}
      headerActions={
        <>
          {saveState && <span className="text-body-secondary small d-none d-md-inline">{saveState}</span>}
          <CButton color="primary" size="sm" onClick={() => openModal(null)}>
            <CIcon icon={cilPlus} className="me-1" /> Nuevo proyecto
          </CButton>
        </>
      }
    >
      <h1 className="of-page-title">Proyectos</h1>

      <CNav variant="underline" className="mb-4">
        {TABS.map((t) => (
          <CNavItem key={t.key}>
            <CNavLink active={tab === t.key} onClick={() => setTab(t.key)} style={{ cursor: "pointer" }}>
              {t.label}
            </CNavLink>
          </CNavItem>
        ))}
      </CNav>

      {loading && <p className="state-message">Cargando proyectos…</p>}
      {!loading && loadError && (
        <CAlert color="danger" className="d-flex align-items-center justify-content-between">
          {loadError} <CButton size="sm" color="danger" variant="outline" onClick={loadProjects}>Reintentar</CButton>
        </CAlert>
      )}

      {!loading && !loadError && (
        <>
          {tab === "dashboard" && <DashboardView projects={projects} metrics={metrics} summary={summary} onNewProject={() => openModal(null)} />}
          {tab === "kanban" && <BoardView projects={projects} onEdit={openModal} onMove={moveStatus} />}
          {tab === "tabla" && <TablaView projects={projects} onEdit={openModal} onDelete={deleteProject} />}
        </>
      )}

      <NewProjectWizard
        visible={modalOpen}
        editingProject={editingProject}
        onClose={closeModal}
        onSaved={handleWizardSaved}
      />

      <div className={"toast" + (toast ? " show" : "")}>{toast}</div>
    </AppShell>
  );
}

function Kpi({ label, value, sub, icon, href }: { label: string; value: string | number; sub: string; icon?: any; href?: string }) {
  const body = (
    <CCard className="h-100 kpi-card">
      <CCardBody>
        <div className="d-flex justify-content-between align-items-start">
          <div className="text-uppercase text-body-secondary small mb-1">{label}</div>
          {icon && <CIcon icon={icon} className="text-body-secondary" />}
        </div>
        <div className="fs-3 fw-bold mono">{value}</div>
        <div className="text-body-secondary small">{sub}</div>
      </CCardBody>
    </CCard>
  );
  return href ? <Link href={href} className="text-decoration-none text-reset d-block h-100">{body}</Link> : body;
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

function DashboardView({
  projects, metrics, summary, onNewProject,
}: {
  projects: ProjectDTO[];
  metrics: DashboardMetrics;
  summary: DashboardSummaryDTO | null;
  onNewProject: () => void;
}) {
  const { byType, totalBudget, totalSpent, avgProgress, execPct, active, finished } = metrics;
  const sortedByProgress = [...projects].sort((a, b) => clampPct(b.progress) - clampPct(a.progress));

  const now = Date.now();
  const overBudget = projects.filter((p) => p.spent > p.budget);
  const dueSoon = projects
    .filter((p) => p.status !== "finalizado")
    .map((p) => ({ p, daysLeft: Math.ceil((new Date(p.end).getTime() - now) / 86400000) }))
    .filter((x) => x.daysLeft <= 7);

  const isDark = typeof document !== "undefined" && document.documentElement.getAttribute("data-coreui-theme") === "dark";
  const gridColor = isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)";
  const tickColor = isDark ? "#a39e93" : "#75726a"; // --ink-soft de app/globals.css en cada tema

  return (
    <>
      {/* Accesos directos */}
      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <Link href="/?tab=tabla" className="home-module">
            <CIcon icon={cilListRich} size="xl" />
            <span>
              <span className="home-module-title">Todas las obras</span>
              <span className="home-module-sub">{projects.length} proyecto{projects.length === 1 ? "" : "s"} — ver el listado completo</span>
            </span>
          </Link>
        </div>
        <div className="col-md-6">
          <Link href="/contratistas" className="home-module">
            <CIcon icon={cilPeople} size="xl" />
            <span>
              <span className="home-module-title">Contratistas</span>
              <span className="home-module-sub">Directorio global de contratistas</span>
            </span>
          </Link>
        </div>
      </div>

      <div className="quick-actions mb-4">
        <button className="quick-action" onClick={onNewProject}>
          <CIcon icon={cilPlus} /> Nuevo proyecto
        </button>
      </div>

      {(overBudget.length > 0 || dueSoon.length > 0) && (
        <div className="row g-3 mb-4">
          {dueSoon.length > 0 && (
            <div className="col-md-6">
              <CAlert color="warning" className="mb-0">
                <div className="fw-semibold mb-1">⏰ Vencimientos próximos</div>
                <ul className="mb-0 ps-3 small">
                  {dueSoon.map(({ p, daysLeft }) => (
                    <li key={p.id}>
                      <Link href={`/project/${p.id}`}>{p.name}</Link> — {daysLeft < 0 ? `vencido hace ${Math.abs(daysLeft)}d` : daysLeft === 0 ? "vence hoy" : `${daysLeft}d restantes`}
                    </li>
                  ))}
                </ul>
              </CAlert>
            </div>
          )}
          {overBudget.length > 0 && (
            <div className="col-md-6">
              <CAlert color="danger" className="mb-0">
                <div className="fw-semibold mb-1">💸 Sobre presupuesto</div>
                <ul className="mb-0 ps-3 small">
                  {overBudget.map((p) => (
                    <li key={p.id}>
                      <Link href={`/project/${p.id}`}>{p.name}</Link> — {fmtMoney(p.spent)} / {fmtMoney(p.budget)}
                    </li>
                  ))}
                </ul>
              </CAlert>
            </div>
          )}
        </div>
      )}

      <div className="row row-cols-2 row-cols-md-4 g-3 mb-3">
        <div className="col"><Kpi label="Proyectos totales" value={projects.length} sub={`${active} en curso · ${finished} finalizados`} icon={cilSpeedometer} href="/?tab=tabla" /></div>
        <div className="col"><Kpi label="Presupuesto total" value={fmtMoney(totalBudget)} sub={`${fmtMoney(totalSpent)} ejecutado`} icon={cilCalculator} /></div>
        <div className="col"><Kpi label="Ejecución presupuestaria" value={`${execPct}%`} sub={execPct > 100 ? "sobre presupuesto" : "del total planificado"} icon={cilCalculator} /></div>
        <div className="col"><Kpi label="Avance promedio" value={`${avgProgress}%`} sub={`sobre ${projects.length} proyectos`} icon={cilListRich} /></div>
      </div>

      <div className="row row-cols-2 row-cols-md-4 g-3 mb-4">
        <div className="col"><Kpi label="Contratistas activos" value={summary?.contractorsActive ?? "—"} sub="en el directorio" icon={cilPeople} href="/contratistas" /></div>
        <div className="col"><Kpi label="Calificación prom." value={summary?.contractorsAvgRating != null ? `${summary.contractorsAvgRating.toFixed(1)} ★` : "—"} sub="de contratistas" icon={cilStar} href="/contratistas" /></div>
        <div className="col"><Kpi label="Relevamientos abiertos" value={summary?.openRelevamientos ?? "—"} sub="pendientes o en proceso" icon={cilListRich} /></div>
        <div className="col"><Kpi label="Cotizaciones pendientes" value={summary?.pendingCotizaciones ?? "—"} sub="esperando decisión" icon={cilFlagAlt} /></div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-lg-4">
          <CCard className="h-100">
            <CCardHeader className="fw-semibold">Presupuesto por tipo de obra</CCardHeader>
            <CCardBody className="d-flex align-items-center justify-content-center">
              {totalBudget > 0 ? (
                <CChartDoughnut
                  style={{ maxHeight: 220 }}
                  data={{
                    labels: ["Civil", "Eléctrico", "Vial", "Otro"],
                    datasets: [{ data: [byType.civil.budget, byType.electrico.budget, byType.vial.budget, byType.otro.budget], backgroundColor: [TYPE_HEX.civil, TYPE_HEX.electrico, TYPE_HEX.vial, TYPE_HEX.otro] }],
                  }}
                  options={{ plugins: { legend: { position: "bottom", labels: { color: tickColor } } } }}
                />
              ) : <EmptyMsg />}
            </CCardBody>
          </CCard>
        </div>
        <div className="col-lg-4">
          <CCard className="h-100">
            <CCardHeader className="fw-semibold">Ejecución presupuestaria</CCardHeader>
            <CCardBody className="d-flex align-items-center justify-content-center">
              {totalBudget > 0 ? (
                <PlotlyGauge value={execPct} color={execPct > 100 ? "#a0564d" : "#5c7a99"} />
              ) : <EmptyMsg />}
            </CCardBody>
          </CCard>
        </div>
        <div className="col-lg-4">
          <CCard className="h-100">
            <CCardHeader className="fw-semibold">Avance promedio</CCardHeader>
            <CCardBody className="d-flex align-items-center justify-content-center">
              <PlotlyGauge value={avgProgress} max={100} color="#5f8362" />
            </CCardBody>
          </CCard>
        </div>
      </div>

      <CCard className="mb-4">
        <CCardHeader className="fw-semibold">Avance por proyecto</CCardHeader>
        <CCardBody>
          {sortedByProgress.length > 0 ? (
            <CChartBar
              style={{ maxHeight: 240 }}
              data={{
                labels: sortedByProgress.map((p) => p.name.length > 18 ? p.name.slice(0, 17) + "…" : p.name),
                datasets: [{ label: "Avance %", data: sortedByProgress.map((p) => clampPct(p.progress)), backgroundColor: sortedByProgress.map((p) => TYPE_HEX[p.type]) }],
              }}
              options={{
                plugins: { legend: { display: false } },
                scales: {
                  y: { beginAtZero: true, max: 100, grid: { color: gridColor }, ticks: { color: tickColor } },
                  x: { grid: { display: false }, ticks: { color: tickColor } },
                },
              }}
            />
          ) : <EmptyMsg />}
        </CCardBody>
      </CCard>

      <CCard>
        <CCardHeader className="fw-semibold">Seguimiento rápido</CCardHeader>
        <CCardBody>
          {sortedByProgress.length === 0 && <EmptyMsg />}
          {sortedByProgress.map((p) => {
            const pct = clampPct(p.progress);
            const over = p.spent > p.budget;
            return (
              <div className="bar-row" key={p.id}>
                <Link href={`/project/${p.id}`} title={p.name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</Link>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${pct}%`, background: `var(--${p.type})` }} />
                </div>
                <span className="mono" style={{ color: over ? "var(--crit)" : "var(--ink-soft)" }}>{pct}%</span>
              </div>
            );
          })}
        </CCardBody>
      </CCard>

      <CCard className="mt-4">
        <CCardHeader className="fw-semibold">Cronograma interactivo</CCardHeader>
        <CCardBody>
          <p className="module-desc mb-3">Arrastrá tareas, cambiá la escala (semana/mes) y hacé clic en un proyecto para abrirlo — motor <strong>dhtmlx Gantt</strong>.</p>
          <DhtmlxGanttChart projects={projects} />
        </CCardBody>
      </CCard>

      <CCard className="mt-4">
        <CCardHeader className="fw-semibold">Skyline 3D de la cartera</CCardHeader>
        <CCardBody>
          <p className="module-desc mb-3">Cada edificio es un proyecto: la altura es el avance, el color el rubro, y se ilumina en rojo si está sobre presupuesto. Arrastrá para rotar, clic para abrir — <strong>Three.js</strong>.</p>
          <ThreeSkyline projects={projects} />
        </CCardBody>
      </CCard>
    </>
  );
}
function EmptyMsg() {
  return <p className="empty-col">Sin proyectos todavía. Creá el primero con &quot;Nuevo proyecto&quot;.</p>;
}

/** Tablero unificado: Kanban (estilo Trello, con badge de vencimiento por
 * tarjeta) y Cronograma (Gantt con línea de "hoy") como dos vistas de la
 * misma pestaña, en vez de pestañas separadas. */
function BoardView({
  projects, onEdit, onMove,
}: {
  projects: ProjectDTO[];
  onEdit: (p: ProjectDTO) => void;
  onMove: (p: ProjectDTO, dir: 1 | -1) => void;
}) {
  const [view, setView] = useState<"board" | "timeline">("board");
  return (
    <>
      <div className="d-flex justify-content-end mb-3">
        <CButtonGroup role="group">
          <CButton color="secondary" variant={view === "board" ? undefined : "outline"} onClick={() => setView("board")}>
            <CIcon icon={cilViewColumn} className="me-1" /> Tablero
          </CButton>
          <CButton color="secondary" variant={view === "timeline" ? undefined : "outline"} onClick={() => setView("timeline")}>
            <CIcon icon={cilListRich} className="me-1" /> Cronograma
          </CButton>
        </CButtonGroup>
      </div>
      {view === "board" ? <KanbanView projects={projects} onEdit={onEdit} onMove={onMove} /> : <GanttView projects={projects} />}
    </>
  );
}

function DueBadge({ end, status }: { end: string; status: ProjectStatus }) {
  if (status === "finalizado") return null;
  const daysLeft = Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);
  let color: string | null = null;
  let text = "";
  if (daysLeft < 0) { color = "danger"; text = `Vencido ${Math.abs(daysLeft)}d`; }
  else if (daysLeft <= 3) { color = "danger"; text = `${daysLeft}d`; }
  else if (daysLeft <= 7) { color = "warning"; text = `${daysLeft}d`; }
  if (!color) return null;
  return <CBadge color={color} className="due-badge">{text}</CBadge>;
}

function KanbanView({
  projects, onEdit, onMove,
}: {
  projects: ProjectDTO[];
  onEdit: (p: ProjectDTO) => void;
  onMove: (p: ProjectDTO, dir: 1 | -1) => void;
}) {
  return (
    <div className="row row-cols-1 row-cols-md-4 g-3">
      {STATUS_ORDER.map((status) => {
        const items = projects.filter((p) => p.status === status);
        return (
          <div className="col" key={status}>
            <CCard className="h-100">
              <CCardHeader className="d-flex justify-content-between align-items-center">
                <span className="fw-semibold">{STATUS_LABEL[status]}</span>
                <CBadge color="secondary" shape="rounded-pill">{items.length}</CBadge>
              </CCardHeader>
              <CCardBody>
                {items.length === 0 && <p className="empty-col">Vacío</p>}
                {items.map((p) => {
                  const pct = clampPct(p.progress);
                  const idx = STATUS_ORDER.indexOf(p.status);
                  return (
                    <div className={`card type-border-${p.type} mb-2`} key={p.id}>
                      <div className="name d-flex justify-content-between align-items-start gap-2">
                        <Link href={`/project/${p.id}`}>{p.name}</Link>
                        <DueBadge end={p.end} status={p.status} />
                      </div>
                      <div className="meta">
                        <CBadge color={TYPE_COLOR[p.type]}>{typeLabel(p)}</CBadge> · {p.manager}
                      </div>
                      <div className="progress-line">
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${pct}%`, background: `var(--${p.type})` }} />
                        </div>
                        <span className="mono">{pct}%</span>
                      </div>
                      <div className="card-actions">
                        <CButton size="sm" color="secondary" variant="outline" onClick={() => onEdit(p)}><CIcon icon={cilPencil} size="sm" /></CButton>
                        {idx > 0 && <CButton size="sm" color="secondary" variant="outline" onClick={() => onMove(p, -1)}><CIcon icon={cilArrowLeft} size="sm" /></CButton>}
                        {idx < STATUS_ORDER.length - 1 && <CButton size="sm" color="secondary" variant="outline" onClick={() => onMove(p, 1)}><CIcon icon={cilArrowRight} size="sm" /></CButton>}
                      </div>
                    </div>
                  );
                })}
              </CCardBody>
            </CCard>
          </div>
        );
      })}
    </div>
  );
}

function exportCSV(projects: ProjectDTO[]) {
  const headers = ["Nombre", "Tipo", "Responsable", "Inicio", "Fin", "Estado", "Presupuesto", "Ejecutado", "Avance"];
  const rows = projects.map((p) => [
    p.name, typeLabel(p), p.manager, p.start, p.end, STATUS_LABEL[p.status], p.budget, p.spent, `${p.progress}%`,
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
  projects, onEdit, onDelete,
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
    <CCard>
      <CCardHeader className="d-flex justify-content-between align-items-center">
        <span className="fw-semibold">Seguimiento de proyectos</span>
        <CButton size="sm" color="secondary" variant="outline" onClick={() => exportCSV(filtered)}>
          <CIcon icon={cilCloudDownload} className="me-1" /> Exportar CSV
        </CButton>
      </CCardHeader>
      <CCardBody>
        <div className="row g-2 mb-3">
          <div className="col-md-6">
            <CInputGroup>
              <CFormInput placeholder="Buscar por nombre o responsable…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </CInputGroup>
          </div>
          <div className="col-md-3">
            <CFormSelect value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ProjectType | "")}>
              <option value="">Todos los tipos</option>
              <option value="civil">Civil</option>
              <option value="electrico">Eléctrico</option>
              <option value="vial">Vial</option>
              <option value="otro">Otro</option>
            </CFormSelect>
          </div>
          <div className="col-md-3">
            <CFormSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | "")}>
              <option value="">Todos los estados</option>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </CFormSelect>
          </div>
        </div>

        <div className="table-responsive">
          <CTable hover align="middle">
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell>Proyecto</CTableHeaderCell>
                <CTableHeaderCell>Tipo</CTableHeaderCell>
                <CTableHeaderCell>Responsable</CTableHeaderCell>
                <CTableHeaderCell>Inicio</CTableHeaderCell>
                <CTableHeaderCell>Fin</CTableHeaderCell>
                <CTableHeaderCell>Estado</CTableHeaderCell>
                <CTableHeaderCell>Presupuesto</CTableHeaderCell>
                <CTableHeaderCell>Avance</CTableHeaderCell>
                <CTableHeaderCell />
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {filtered.length === 0 && (
                <CTableRow>
                  <CTableDataCell colSpan={9} className="empty-col">
                    {projects.length === 0 ? "Sin proyectos todavía." : "Ningún proyecto coincide con el filtro."}
                  </CTableDataCell>
                </CTableRow>
              )}
              {filtered.map((p) => (
                <CTableRow key={p.id}>
                  <CTableDataCell><Link href={`/project/${p.id}`}><strong>{p.name}</strong></Link></CTableDataCell>
                  <CTableDataCell><CBadge color={TYPE_COLOR[p.type]}>{typeLabel(p)}</CBadge></CTableDataCell>
                  <CTableDataCell>{p.manager}</CTableDataCell>
                  <CTableDataCell className="mono">{fmtDate(p.start)}</CTableDataCell>
                  <CTableDataCell className="mono">{fmtDate(p.end)}</CTableDataCell>
                  <CTableDataCell><CBadge color={STATUS_COLOR[p.status]}>{STATUS_LABEL[p.status]}</CBadge></CTableDataCell>
                  <CTableDataCell className="mono">{fmtMoney(p.budget)}</CTableDataCell>
                  <CTableDataCell className="mono">{clampPct(p.progress)}%</CTableDataCell>
                  <CTableDataCell className="text-end">
                    <CButton size="sm" color="secondary" variant="outline" className="me-1" onClick={() => onEdit(p)}><CIcon icon={cilPencil} size="sm" /></CButton>
                    <CButton size="sm" color="danger" variant="outline" onClick={() => onDelete(p)}><CIcon icon={cilTrash} size="sm" /></CButton>
                  </CTableDataCell>
                </CTableRow>
              ))}
            </CTableBody>
          </CTable>
        </div>
      </CCardBody>
    </CCard>
  );
}

function GanttView({ projects }: { projects: ProjectDTO[] }) {
  if (projects.length === 0) {
    return (
      <CCard><CCardHeader className="fw-semibold">Cronograma</CCardHeader><CCardBody><EmptyMsg /></CCardBody></CCard>
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
  const todayPct = Math.max(0, Math.min(100, ((Date.now() - min) / span) * 100));
  const showToday = Date.now() >= min && Date.now() <= max;

  return (
    <CCard>
      <CCardHeader className="fw-semibold">Cronograma</CCardHeader>
      <CCardBody>
        <div className="gantt-wrap">
          <div className="gantt">
            <div className="gantt-scale">
              <div />
              <div className="marks">
                <span style={{ position: "absolute", left: 0 }}>{fmtDate(minISO)}</span>
                <span style={{ position: "absolute", right: 0 }}>{fmtDate(maxISO)}</span>
              </div>
            </div>
            <div className="gantt-body">
              {showToday && <div className="gantt-today" style={{ left: `${todayPct}%` }} title="Hoy" />}
              {sorted.map((p) => {
                const s = new Date(p.start).getTime();
                const e = new Date(p.end).getTime();
                const left = ((s - min) / span) * 100;
                const width = Math.max(((e - s) / span) * 100, 1);
                return (
                  <div className="gantt-row" key={p.id}>
                    <Link href={`/project/${p.id}`} className="label" title={p.name}>{p.name}</Link>
                    <div className="gantt-track">
                      <Link
                        href={`/project/${p.id}`}
                        className={`gantt-bar type-${p.type}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${p.name} · ${fmtDate(p.start)} → ${fmtDate(p.end)} · ${clampPct(p.progress)}%`}
                      >
                        <span className="gantt-bar-fill" style={{ width: `${clampPct(p.progress)}%` }} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CCardBody>
    </CCard>
  );
}
