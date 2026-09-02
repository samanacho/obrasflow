"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  CCard, CCardBody, CCardHeader, CNav, CNavItem, CNavLink,
  CButton, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea,
  CBadge, CAlert, CListGroup, CListGroupItem, CRow, CCol,
} from "@coreui/react";
import { CChartDoughnut, CChartLine } from "@coreui/react-chartjs";
import CIcon from "@coreui/icons-react";
import { cilPlus, cilPencil, cilTrash } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import NewProjectWizard from "@/components/NewProjectWizard";
import ConfirmDialog from "@/components/ConfirmDialog";
import FileDropZone from "@/components/FileDropZone";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import type { ProjectDTO, ProjectItemDTO, ContractorDTO, SupplierDTO } from "@/lib/types";
import { ITEM_KINDS, ITEM_KIND_ORDER, ItemField, ItemKindConfig } from "@/lib/itemKinds";
import { PUBLIC_FIELDS, PRIVATE_FIELDS } from "@/lib/sectorFields";
import { MOVIMIENTO_TIPOS } from "@/lib/movimientos";

const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
  loading: () => <p className="empty-col">Cargando mapa…</p>,
});

const TYPE_LABEL: Record<string, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const TYPE_COLOR: Record<string, string> = { civil: "info", electrico: "warning", vial: "secondary", otro: "dark" };
const STATUS_COLOR: Record<string, string> = { planificado: "info", en_curso: "warning", pausado: "secondary", finalizado: "success" };
const SECTOR_LABEL: Record<string, string> = { privado: "Obra privada", publico: "Obra pública" };

// Ejecución agrupada por rubro: cada movimiento tiene un "Tipo de insumo"
// (lib/itemKinds.ts, campo tipoInsumo de change_order) — estas 4 son las
// únicas opciones reales del select; todo lo que no tenga ninguna de estas
// cuatro (campo vacío, o datos viejos de antes de que existiera el campo)
// cae en "Sin clasificar" al armar la ficha de un rubro.
const TIPO_INSUMO_ORDER = ["Materiales", "Mano de obra", "Maquinaria / Alquileres", "Gastos administrativos / Varios"];
const TIPO_INSUMO_ICON: Record<string, string> = {
  "Materiales": "🧱",
  "Mano de obra": "👷",
  "Maquinaria / Alquileres": "🚜",
  "Gastos administrativos / Varios": "🗂️",
  "Sin clasificar": "❔",
};
const TIPO_INSUMO_COLOR: Record<string, string> = {
  "Materiales": "info",
  "Mano de obra": "warning",
  "Maquinaria / Alquileres": "secondary",
  "Gastos administrativos / Varios": "dark",
  "Sin clasificar": "light",
};

// Mismo mapeo que lib/spent.ts (servidor) — acá se usa para armar el
// gráfico de ejecución en el tiempo del lado del cliente, sin pegarle de
// nuevo a la API (los items ya están cargados en `items`).
const EFFECT_BY_TIPO: Record<string, string> = Object.fromEntries(MOVIMIENTO_TIPOS.map((t) => [t.value, t.effect]));

// Paleta cálida/apagada ya usada en el resto del sitio — misma familia de
// colores que TYPE_HEX en app/page.tsx, para el donut de gastos por categoría.
const CHART_COLORS_LIGHT = ["#4a6b85", "#a9803d", "#726c61", "#8172a3", "#5f8362", "#a0564d"];
const CHART_COLORS_DARK = ["#8ca9c2", "#d3af6e", "#b3ac9e", "#b3a4cc", "#8fb491", "#c98980"];

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtMoney(n: number) {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY");
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
/** "YYYY-MM-DD" (o el createdAt como respaldo) -> "DD/MM/YYYY". */
function itemDate(item: ProjectItemDTO): string {
  const raw = (item.data?.fecha || item.createdAt).slice(0, 10);
  const [y, m, d] = raw.split("-");
  return y && m && d ? `${d}/${m}/${y}` : raw;
}
/** "YYYY-MM" -> "ago 2026". */
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  return MESES_CORTOS[idx] ? `${MESES_CORTOS[idx]} ${y}` : ym;
}
/** "lat,lng" (como se guarda en data.coordenadas) -> {lat,lng}, o null si todavía no hay nada cargado. */
function parseCoords(raw: any): { lat: number; lng: number } | null {
  const [latStr, lngStr] = String(raw ?? "").split(",");
  const lat = Number(latStr);
  const lng = Number(lngStr);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export default function ProjectDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("rfi");
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  // Edición rápida del presupuesto — atajo al lado del "Editar" general,
  // que abre el wizard completo. El presupuesto es la única fuente de
  // verdad para todo lo que depende de él (% ejecutado, saldo disponible,
  // gráficos de /ejecucion, alertas de "sobre presupuesto" en Inicio): no
  // hay ningún valor derivado guardado aparte, así que con actualizar acá
  // `project.budget` y refrescar el estado ya queda todo al día.
  const [budgetEditOpen, setBudgetEditOpen] = useState(false);
  const [budgetValue, setBudgetValue] = useState("");
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [savingBudget, setSavingBudget] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setProject(await res.json());
      } catch {
        setError("No se pudo cargar el proyecto.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  function handleSaved(saved: ProjectDTO) {
    setProject(saved);
    setEditOpen(false);
  }

  // Movimientos recalcula el Ejecutado en el servidor al crear/editar/
  // eliminar un item — esto vuelve a traer la ficha para que ese número
  // (y todo lo demás que dependa de `project`) se vea actualizado sin
  // tener que recargar la página.
  async function refreshProject() {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) setProject(await res.json());
    } catch {
      /* si falla, el usuario igual puede recargar manualmente */
    }
  }

  function openBudgetEdit() {
    if (!project) return;
    setBudgetError(null);
    setBudgetValue(String(project.budget));
    setBudgetEditOpen(true);
  }

  async function handleBudgetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    const budget = Number(budgetValue);
    if (!Number.isFinite(budget) || budget < 0) { setBudgetError("Cargá un presupuesto válido."); return; }
    setSavingBudget(true);
    setBudgetError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setProject(await res.json());
      setBudgetEditOpen(false);
    } catch (err: any) {
      setBudgetError(err.message || "No se pudo actualizar el presupuesto.");
    } finally {
      setSavingBudget(false);
    }
  }

  async function handleDelete() {
    if (!project) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      router.push(`/rubros/${project.type}`);
    } catch {
      setDeleting(false);
      setDeleteError("No se pudo eliminar el proyecto. Probá de nuevo.");
    }
  }

  if (loading) return <AppShell crumbs={[{ label: "Obras por rubro", href: "/rubros" }]}><p className="state-message">Cargando proyecto…</p></AppShell>;
  if (error || !project) return <AppShell crumbs={[{ label: "Obras por rubro", href: "/rubros" }]}><p className="state-message form-error">{error || "Proyecto no encontrado."}</p></AppShell>;

  const overBudget = project.spent > project.budget;
  const daysLeft = Math.ceil((new Date(project.end).getTime() - Date.now()) / 86400000);

  return (
    <AppShell
      crumbs={[
        { label: "Obras por rubro", href: "/rubros" },
        { label: TYPE_LABEL[project.type], href: `/rubros/${project.type}` },
        { label: project.name },
      ]}
      headerActions={
        <>
          <CButton color="secondary" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <CIcon icon={cilPencil} className="me-1" /> Editar
          </CButton>
          <CButton color="danger" variant="outline" size="sm" onClick={() => { setDeleteError(null); setConfirmDeleteOpen(true); }} disabled={deleting}>
            <CIcon icon={cilTrash} className="me-1" /> {deleting ? "Eliminando…" : "Eliminar"}
          </CButton>
        </>
      }
    >
      <div className="project-hero">
        <div>
          <h1 className="of-page-title mb-2">{project.name}</h1>
          {project.reference && <p className="module-desc mb-2">REF: {project.reference}</p>}
          <div className="project-hero-meta">
            <CBadge color={TYPE_COLOR[project.type]}>{project.type === "otro" && project.customType ? project.customType : TYPE_LABEL[project.type]}</CBadge>
            <CBadge color={STATUS_COLOR[project.status]}>{project.status.replace("_", " ")}</CBadge>
            {project.sector && <CBadge color={project.sector === "publico" ? "dark" : "info"}>{SECTOR_LABEL[project.sector]}</CBadge>}
            <span>{project.manager}</span>
            {project.city && <span>· {project.city}</span>}
            {(() => {
              const coords = parseCoords(project.coordinates);
              return coords ? (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=17/${coords.lat}/${coords.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  📍 Ver ubicación en el mapa ↗
                </a>
              ) : null;
            })()}
          </div>
        </div>
        <div className="project-hero-kpis">
          <CCard className="position-relative">
            <CButton
              color="secondary" variant="ghost" size="sm"
              className="position-absolute top-0 end-0 m-1 p-1"
              title="Editar presupuesto"
              onClick={openBudgetEdit}
            >
              <CIcon icon={cilPencil} size="sm" />
            </CButton>
            <CCardBody>
              <div className="label">Presupuesto</div>
              <div className="value mono">{fmtMoney(project.budget)}</div>
              <div className={"sub" + (overBudget ? " alert-text" : "")}>{fmtMoney(project.spent)} ejecutado{overBudget ? " · sobre presupuesto" : ""}</div>
            </CCardBody>
          </CCard>
          <CCard><CCardBody><div className="label">Avance</div><div className="value mono">{project.progress}%</div><div className="sub">Estado: {project.status.replace("_", " ")}</div></CCardBody></CCard>
          <CCard><CCardBody><div className="label">Fecha fin</div><div className="value mono">{project.end.split("-").reverse().join("/")}</div><div className={"sub" + (daysLeft < 7 ? " alert-text" : "")}>{daysLeft < 0 ? `Vencido hace ${Math.abs(daysLeft)}d` : `${daysLeft} días restantes`}</div></CCardBody></CCard>
        </div>
      </div>

      {(() => {
        const hasSectorData =
          project.sector &&
          project.sectorData &&
          Object.values(project.sectorData).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));
        const coords = parseCoords(project.coordinates);
        if (!hasSectorData && !project.city && !project.department && !coords) return null;
        return (
          <CCard className="mb-4">
            <CCardHeader className="fw-semibold">
              {project.sector ? `${SECTOR_LABEL[project.sector]} — datos adicionales` : "Ubicación y datos adicionales"}
            </CCardHeader>
            <CCardBody>
              <CRow className="g-3">
                {project.city && (
                  <CCol md={4}>
                    <span className="module-desc">Ciudad</span>
                    <div>{project.city}</div>
                  </CCol>
                )}
                {project.department && (
                  <CCol md={4}>
                    <span className="module-desc">Departamento</span>
                    <div>{project.department}</div>
                  </CCol>
                )}
                {coords && (
                  <CCol md={4}>
                    <span className="module-desc">Ubicación</span>
                    <div>
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=17/${coords.lat}/${coords.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        📍 Ver ubicación en el mapa ↗
                      </a>
                    </div>
                  </CCol>
                )}
                {hasSectorData &&
                  (project.sector === "publico" ? PUBLIC_FIELDS : PRIVATE_FIELDS)
                    .filter((f) => {
                      const v = project.sectorData?.[f.key];
                      return Array.isArray(v) ? v.length > 0 : Boolean(v);
                    })
                    .map((f) => {
                      const v = project.sectorData?.[f.key];
                      return (
                        <CCol md={4} key={f.key}>
                          <span className="module-desc">{f.label}</span>
                          <div>
                            {f.type === "number"
                              ? fmtMoney(Number(v))
                              : Array.isArray(v)
                              ? v.join(", ")
                              : String(v)}
                          </div>
                        </CCol>
                      );
                    })}
              </CRow>
            </CCardBody>
          </CCard>
        );
      })()}

      <CNav variant="underline" className="mb-4 module-tabs">
        {ITEM_KIND_ORDER.map((k) => {
          const cfg = ITEM_KINDS[k];
          return (
            <CNavItem key={k}>
              <CNavLink active={tab === k} onClick={() => setTab(k)} style={{ cursor: "pointer", whiteSpace: "nowrap" }}>
                {cfg.icon} {cfg.label}
              </CNavLink>
            </CNavItem>
          );
        })}
      </CNav>

      <ModuleView key={tab} projectId={id} kind={tab} project={project} onProjectChanged={refreshProject} showToast={showToast} />

      <NewProjectWizard
        visible={editOpen}
        editingProject={project}
        onClose={() => setEditOpen(false)}
        onSaved={handleSaved}
      />

      <CModal visible={budgetEditOpen} onClose={() => setBudgetEditOpen(false)} alignment="center">
        <CModalHeader><CModalTitle>Editar presupuesto</CModalTitle></CModalHeader>
        <CForm onSubmit={handleBudgetSubmit}>
          <CModalBody>
            {budgetError && <CAlert color="danger">{budgetError}</CAlert>}
            <CFormLabel>Presupuesto (Gs.)</CFormLabel>
            <CFormInput
              type="number" min={0} step="1" autoFocus
              value={budgetValue}
              onChange={(e) => setBudgetValue(e.target.value)}
              required
            />
            <p className="module-desc mt-2 mb-0">
              Al guardar se recalcula automáticamente todo lo que depende del presupuesto: % ejecutado, saldo disponible,
              los gráficos de <Link href="/ejecucion">Ejecución Presupuestaria</Link> y las alertas de sobre-presupuesto de Inicio.
            </p>
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" variant="ghost" onClick={() => setBudgetEditOpen(false)}>Cancelar</CButton>
            <CButton color="primary" type="submit" disabled={savingBudget}>{savingBudget ? "Guardando…" : "Guardar"}</CButton>
          </CModalFooter>
        </CForm>
      </CModal>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Eliminar proyecto"
        message={`¿Eliminar "${project.name}"? Esta acción no se puede deshacer.`}
        busy={deleting}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
      <Toast message={toast} />
    </AppShell>
  );
}

function ModuleView({
  projectId, kind, project, onProjectChanged, showToast,
}: {
  projectId: string;
  kind: string;
  project: ProjectDTO;
  onProjectChanged: () => void;
  showToast: (m: string) => void;
}) {
  const cfg = ITEM_KINDS[kind];
  const [items, setItems] = useState<ProjectItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProjectItemDTO | null>(null);
  // Con qué título prellenar el formulario al crear un ítem nuevo — se usa
  // para "Agregar insumo a este rubro" desde adentro de la ficha de un
  // rubro (ver RubroFicha), así el nuevo movimiento cae en el mismo grupo
  // sin que el usuario tenga que reescribir el nombre a mano.
  const [prefillTitle, setPrefillTitle] = useState<string | null>(null);

  // Filtro/orden — solo para Movimientos (ver isMovimientos más abajo).
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"fecha_desc" | "fecha_asc" | "monto_desc" | "monto_asc">("fecha_desc");

  // Ejecución: cada movimiento representa un insumo de un rubro (el
  // "título" del item ahora es el nombre del rubro, no una descripción
  // libre) — acá se agrupan por título para mostrar una ficha por rubro
  // en vez de una lista plana de insumos sueltos. `null` = viendo la
  // grilla de rubros; un string = adentro de la ficha de ese rubro.
  const [openRubro, setOpenRubro] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/items?kind=${kind}`);
      setItems(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [projectId, kind]);

  // Contratistas: "Rubro a cargo" sugiere también los rubros ya cargados en
  // Ejecución de esta misma obra (no solo los ya asignados acá) — así desde
  // el primer contratista se puede elegir un rubro que ya tiene costos
  // registrados, en vez de escribirlo de nuevo a mano.
  const [ejecucionRubros, setEjecucionRubros] = useState<string[]>([]);
  useEffect(() => {
    if (kind !== "contratista") { setEjecucionRubros([]); return; }
    fetch(`/api/projects/${projectId}/items?kind=change_order`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProjectItemDTO[]) => setEjecucionRubros(rows.map((r) => r.title.trim()).filter(Boolean)))
      .catch(() => setEjecucionRubros([]));
  }, [projectId, kind]);

  // Parte Diario: al entrar a la pestaña se abre directo el formulario
  // para cargar algo del día — un solo `useEffect` sin dependencias
  // (ModuleView se remonta entero por key={tab} en el padre, así que esto
  // corre una vez por cada vez que se entra a la pestaña, no en cada
  // re-render mientras ya está abierta).
  useEffect(() => {
    if (kind === "daily_log") { setEditing(null); setShowForm(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cotización: la planilla de presupuesto liga el monto directamente al
  // presupuesto de la ficha de la obra, y marca cuál cotización ganó.
  const isCotizacion = kind === "cotizacion";
  const winner = isCotizacion ? items.find((i) => i.status === "Seleccionada") : undefined;
  const winnerMonto = winner ? Number(winner.data?.monto ?? 0) : null;
  const diff = winnerMonto !== null ? winnerMonto - project.budget : null;

  // Movimientos: mismo tipo de planilla resumen, pero contra el Ejecutado
  // real (que el servidor recalcula solo a partir de estos items).
  const isMovimientos = kind === "change_order";
  const sumByTipo = (tipo: string) =>
    items.filter((i) => i.data?.tipo === tipo).reduce((acc, i) => acc + Number(i.data?.monto ?? 0), 0);
  const adelantado = isMovimientos ? sumByTipo("Adelanto") : 0;
  const impactoOC = isMovimientos ? sumByTipo("Orden de cambio") : 0;
  const saldoDisponible = project.budget - project.spent;
  const ejecucionPct = project.budget > 0 ? Math.min(100, (project.spent / project.budget) * 100) : 0;

  // Gasto por categoría (todos los movimientos con "categoria" cargada,
  // sin importar el tipo — es una clasificación transversal).
  const categoriaSums: Record<string, number> = {};
  if (isMovimientos) {
    items.forEach((i) => {
      const cat = i.data?.categoria || "Sin categoría";
      categoriaSums[cat] = (categoriaSums[cat] ?? 0) + Number(i.data?.monto ?? 0);
    });
  }
  const categoriaLabels = Object.keys(categoriaSums);
  const isDark = typeof document !== "undefined" && document.documentElement.getAttribute("data-coreui-theme") === "dark";
  const chartColors = isDark ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;
  const tickColor = isDark ? "#a39e93" : "#75726a";
  const gridColor = isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)";

  // Ejecución acumulada mes a mes — solo movimientos que realmente suman o
  // restan al Ejecutado (igual criterio que lib/spent.ts en el servidor).
  const monthlyTotals = new Map<string, number>();
  if (isMovimientos) {
    items.forEach((i) => {
      const effect = EFFECT_BY_TIPO[i.data?.tipo ?? ""];
      if (effect !== "add" && effect !== "subtract") return;
      const month = (i.data?.fecha || i.createdAt).slice(0, 7);
      const monto = Number(i.data?.monto ?? 0) * (effect === "subtract" ? -1 : 1);
      monthlyTotals.set(month, (monthlyTotals.get(month) ?? 0) + monto);
    });
  }
  const monthKeys = Array.from(monthlyTotals.keys()).sort();
  let runningTotal = 0;
  const monthlyCumulative = monthKeys.map((m) => (runningTotal += monthlyTotals.get(m) ?? 0));

  // Lista filtrada/ordenada — no toca la planilla resumen de arriba, que
  // siempre refleja el total real sin importar el filtro activo.
  const filtersActive = Boolean(search || filterTipo || filterEstado || dateFrom || dateTo);
  const visibleItems = isMovimientos
    ? items
        .filter((i) => !filterTipo || i.data?.tipo === filterTipo)
        .filter((i) => !filterEstado || i.status === filterEstado)
        .filter((i) => {
          if (!search) return true;
          const q = search.toLowerCase();
          return i.title.toLowerCase().includes(q) || String(i.data?.notas ?? "").toLowerCase().includes(q);
        })
        .filter((i) => !dateFrom || (i.data?.fecha || i.createdAt).slice(0, 10) >= dateFrom)
        .filter((i) => !dateTo || (i.data?.fecha || i.createdAt).slice(0, 10) <= dateTo)
        .slice()
        .sort((a, b) => {
          if (sortBy === "monto_desc") return Number(b.data?.monto ?? 0) - Number(a.data?.monto ?? 0);
          if (sortBy === "monto_asc") return Number(a.data?.monto ?? 0) - Number(b.data?.monto ?? 0);
          const da = (a.data?.fecha || a.createdAt).slice(0, 10);
          const db = (b.data?.fecha || b.createdAt).slice(0, 10);
          return sortBy === "fecha_asc" ? da.localeCompare(db) : db.localeCompare(da);
        })
    : items;

  // Nombres de rubro ya usados en esta obra — alimenta el datalist del
  // campo "Nombre del rubro" (Ejecución) o "Rubro a cargo" (Contratistas)
  // en el formulario, para elegir de una lista en vez de repetir el nombre
  // a mano letra por letra (un typo rompe el agrupamiento/cruce). En
  // Contratistas se suman también los rubros ya cargados en Ejecución de
  // esta obra (ver ejecucionRubros arriba).
  const existingRubros = isMovimientos
    ? Array.from(new Set(items.map((i) => i.title.trim()).filter(Boolean))).sort()
    : kind === "contratista"
    ? Array.from(new Set([...items.map((i) => i.title.trim()), ...ejecucionRubros].filter(Boolean))).sort()
    : undefined;

  // Agrupa los movimientos visibles (ya filtrados/ordenados arriba) por
  // rubro — cada grupo es una "ficha" con el total gastado entre todos sus
  // insumos. El filtro de fecha/tipo/estado se aplica ANTES de agrupar, así
  // que un rubro cuyos insumos quedaron todos afuera del filtro simplemente
  // no aparece, igual que pasaba antes con la lista plana.
  const rubroGroups = isMovimientos
    ? (() => {
        const map = new Map<string, ProjectItemDTO[]>();
        visibleItems.forEach((i) => {
          const key = i.title.trim() || "(Sin nombre)";
          const arr = map.get(key) ?? [];
          arr.push(i);
          map.set(key, arr);
        });
        const groups = Array.from(map.entries()).map(([rubro, arr]) => {
          const total = arr.reduce((sum, i) => sum + Number(i.data?.monto ?? 0), 0);
          const sorted = arr.slice().sort((a, b) => {
            const da = (a.data?.fecha || a.createdAt).slice(0, 10);
            const db = (b.data?.fecha || b.createdAt).slice(0, 10);
            return db.localeCompare(da);
          });
          const typeCounts: Record<string, number> = {};
          arr.forEach((i) => {
            const t = i.data?.tipoInsumo && TIPO_INSUMO_ORDER.includes(i.data.tipoInsumo) ? i.data.tipoInsumo : "Sin clasificar";
            typeCounts[t] = (typeCounts[t] ?? 0) + 1;
          });
          return {
            rubro,
            items: arr,
            total,
            lastFecha: (sorted[0].data?.fecha || sorted[0].createdAt).slice(0, 10),
            lastDateLabel: itemDate(sorted[0]),
            typeCounts,
          };
        });
        groups.sort((a, b) => {
          if (sortBy === "monto_desc") return b.total - a.total;
          if (sortBy === "monto_asc") return a.total - b.total;
          return sortBy === "fecha_asc" ? a.lastFecha.localeCompare(b.lastFecha) : b.lastFecha.localeCompare(a.lastFecha);
        });
        return groups;
      })()
    : [];

  // Ítems del rubro abierto — se toman de `items` sin filtrar (no de
  // visibleItems): adentro de la ficha de un rubro se quiere ver SIEMPRE
  // todo lo cargado de ese rubro, sin que los filtros de la grilla de
  // arriba (que ya no se muestran en este modo) escondan insumos.
  const rubroItems = openRubro ? items.filter((i) => (i.title.trim() || "(Sin nombre)") === openRubro) : [];

  function clearFilters() {
    setSearch(""); setFilterTipo(""); setFilterEstado(""); setDateFrom(""); setDateTo("");
  }

  // Modal de confirmación propio en vez de window.confirm(): el diálogo
  // nativo del navegador puede quedar silenciado (extensiones, o Chrome
  // lo bloquea solo después de varios usos seguidos) y ahí el botón
  // "no hace nada" sin ningún error visible — esto es inmune a eso, y
  // además muestra un error real si la eliminación falla en el servidor.
  const [confirmTarget, setConfirmTarget] = useState<ProjectItemDTO | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function performDelete(item: ProjectItemDTO) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setItems((cur) => cur.filter((i) => i.id !== item.id));
      if (kind === "change_order") onProjectChanged();
      setConfirmTarget(null);
    } catch {
      setDeleteError("No se pudo eliminar. Probá de nuevo.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <CCard>
      <CCardHeader className="module-panel-head">
        <div>
          <span className="fw-semibold fs-5">{cfg.icon} {cfg.label}</span>
          <p className="module-desc mb-0">{cfg.description}</p>
          {kind === "daily_log" && (
            <p className="module-desc mb-0 fw-semibold">
              📅 Hoy: {new Date().toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          )}
        </div>
        {!cfg.readOnly && !(isMovimientos && openRubro) && (
          <CButton color="primary" size="sm" onClick={() => { setEditing(null); setPrefillTitle(null); setShowForm(true); }}>
            <CIcon icon={cilPlus} className="me-1" /> Agregar {cfg.singular}
          </CButton>
        )}
      </CCardHeader>
      <CCardBody>
        {isMovimientos && openRubro && (
          <RubroFicha
            rubro={openRubro}
            items={rubroItems}
            cfg={cfg}
            kind={kind}
            onBack={() => setOpenRubro(null)}
            onAdd={() => { setEditing(null); setPrefillTitle(openRubro); setShowForm(true); }}
            onEdit={(item) => { setEditing(item); setPrefillTitle(null); setShowForm(true); }}
            onDelete={(item) => { setDeleteError(null); setConfirmTarget(item); }}
          />
        )}
        {!(isMovimientos && openRubro) && isCotizacion && !loading && (
          <div className="quote-budget-panel">
            <div className="quote-budget-item">
              <span className="qb-label">Presupuesto de la obra</span>
              <span className="qb-value mono">{fmtMoney(project.budget)}</span>
            </div>
            <div className="quote-budget-item">
              <span className="qb-label">Cotizaciones cargadas</span>
              <span className="qb-value mono">{items.length}</span>
            </div>
            <div className="quote-budget-item">
              <span className="qb-label">Cotización ganadora</span>
              <span className="qb-value mono">{winner ? fmtMoney(winnerMonto!) : "—"}</span>
            </div>
            <div className="quote-budget-item">
              <span className="qb-label">Diferencia vs. presupuesto</span>
              <span className={"qb-value mono" + (diff !== null && diff > 0 ? " alert-text" : "")}>
                {diff !== null ? `${diff >= 0 ? "+" : ""}${fmtMoney(diff)}` : "—"}
              </span>
            </div>
          </div>
        )}

        {isMovimientos && !openRubro && !loading && (
          <div className="quote-budget-panel">
            <div className="quote-budget-item">
              <span className="qb-label">Presupuesto de la obra</span>
              <span className="qb-value mono">{fmtMoney(project.budget)}</span>
            </div>
            <div className="quote-budget-item">
              <span className="qb-label">Ejecutado</span>
              <span className={"qb-value mono" + (project.spent > project.budget ? " alert-text" : "")}>{fmtMoney(project.spent)}</span>
            </div>
            <div className="quote-budget-item">
              <span className="qb-label">Adelantado</span>
              <span className="qb-value mono">{fmtMoney(adelantado)}</span>
            </div>
            <div className="quote-budget-item">
              <span className="qb-label">Impacto de órdenes de cambio (no afecta el Ejecutado)</span>
              <span className="qb-value mono">{fmtMoney(impactoOC)}</span>
            </div>
            <div className="quote-budget-item">
              <span className="qb-label">Saldo disponible</span>
              <span className={"qb-value mono" + (saldoDisponible < 0 ? " alert-text" : "")}>{fmtMoney(saldoDisponible)}</span>
            </div>
          </div>
        )}

        {isMovimientos && !openRubro && !loading && (
          <div className="mb-3">
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${ejecucionPct}%`, background: project.spent > project.budget ? "var(--crit)" : "var(--ok)" }} />
            </div>
            <span className="item-row-sub">{Math.round(ejecucionPct)}% del presupuesto ejecutado</span>
          </div>
        )}

        {isMovimientos && !openRubro && !loading && items.length > 0 && (
          <CRow className="g-3 mb-4">
            {categoriaLabels.length > 0 && (
              <CCol md={6}>
                <CCard className="h-100">
                  <CCardHeader className="fw-semibold">Gasto por categoría</CCardHeader>
                  <CCardBody className="d-flex align-items-center justify-content-center">
                    <CChartDoughnut
                      style={{ maxHeight: 200 }}
                      data={{
                        labels: categoriaLabels,
                        datasets: [{ data: categoriaLabels.map((c) => categoriaSums[c]), backgroundColor: categoriaLabels.map((_, i) => chartColors[i % chartColors.length]) }],
                      }}
                      options={{ plugins: { legend: { position: "bottom", labels: { color: tickColor } } } }}
                    />
                  </CCardBody>
                </CCard>
              </CCol>
            )}
            {monthKeys.length > 0 && (
              <CCol md={categoriaLabels.length > 0 ? 6 : 12}>
                <CCard className="h-100">
                  <CCardHeader className="fw-semibold">Ejecución acumulada en el tiempo</CCardHeader>
                  <CCardBody>
                    <CChartLine
                      style={{ maxHeight: 200 }}
                      data={{
                        labels: monthKeys.map(monthLabel),
                        datasets: [
                          { label: "Ejecutado acumulado", data: monthlyCumulative, borderColor: chartColors[0], backgroundColor: "transparent", tension: 0.2 },
                          { label: "Presupuesto", data: monthKeys.map(() => project.budget), borderColor: chartColors[5], borderDash: [6, 4], pointRadius: 0, backgroundColor: "transparent" },
                        ],
                      }}
                      options={{
                        plugins: { legend: { position: "bottom", labels: { color: tickColor } } },
                        scales: {
                          y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: tickColor } },
                          x: { grid: { display: false }, ticks: { color: tickColor } },
                        },
                      }}
                    />
                  </CCardBody>
                </CCard>
              </CCol>
            )}
          </CRow>
        )}

        {isMovimientos && !openRubro && !loading && items.length > 0 && (
          <CRow className="g-2 mb-3">
            <CCol md={3}><CFormInput placeholder="Buscar por rubro o notas…" value={search} onChange={(e) => setSearch(e.target.value)} /></CCol>
            <CCol md={2}>
              <CFormSelect value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
                <option value="">Todos los tipos</option>
                {MOVIMIENTO_TIPOS.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}
              </CFormSelect>
            </CCol>
            <CCol md={2}>
              <CFormSelect value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                {cfg.statusOptions?.map((s) => <option key={s} value={s}>{s}</option>)}
              </CFormSelect>
            </CCol>
            <CCol md={2}><CFormInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Desde" /></CCol>
            <CCol md={2}><CFormInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Hasta" /></CCol>
            <CCol md={1}>
              <CFormSelect value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                <option value="fecha_desc">Recientes</option>
                <option value="fecha_asc">Antiguos</option>
                <option value="monto_desc">Mayor monto</option>
                <option value="monto_asc">Menor monto</option>
              </CFormSelect>
            </CCol>
            {filtersActive && (
              <CCol xs={12}>
                <button type="button" className="btn btn-sm btn-link px-0" onClick={clearFilters}>Limpiar filtros</button>
              </CCol>
            )}
          </CRow>
        )}

        {!(isMovimientos && openRubro) && loading && <p className="empty-col">Cargando…</p>}
        {!(isMovimientos && openRubro) && !loading && items.length === 0 && <p className="empty-col">Sin registros todavía.</p>}
        {!openRubro && !loading && items.length > 0 && isMovimientos && rubroGroups.length === 0 && (
          <p className="empty-col">Ningún rubro coincide con estos filtros.</p>
        )}
        {!loading && items.length > 0 && !isMovimientos && visibleItems.length === 0 && (
          <p className="empty-col">Ningún registro coincide con estos filtros.</p>
        )}

        {!openRubro && (isMovimientos ? (
          <CRow className="g-3">
            {rubroGroups.map((g) => (
              <CCol md={6} key={g.rubro}>
                <CCard className="rubro-summary-card h-100" onClick={() => setOpenRubro(g.rubro)}>
                  <CCardBody>
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <span className="fw-semibold">{g.rubro}</span>
                      <span className="mono fw-semibold">{fmtMoney(g.total)}</span>
                    </div>
                    <div className="item-row-sub mt-1">
                      {g.items.length} insumo{g.items.length === 1 ? "" : "s"} cargado{g.items.length === 1 ? "" : "s"} · Última carga: {g.lastDateLabel}
                    </div>
                    <div className="d-flex gap-1 flex-wrap mt-2">
                      {TIPO_INSUMO_ORDER.filter((t) => g.typeCounts[t]).map((t) => (
                        <CBadge key={t} color={TIPO_INSUMO_COLOR[t]}>{TIPO_INSUMO_ICON[t]} {g.typeCounts[t]}</CBadge>
                      ))}
                      {g.typeCounts["Sin clasificar"] > 0 && (
                        <CBadge color={TIPO_INSUMO_COLOR["Sin clasificar"]} className="text-dark">
                          {TIPO_INSUMO_ICON["Sin clasificar"]} {g.typeCounts["Sin clasificar"]} sin clasificar
                        </CBadge>
                      )}
                    </div>
                  </CCardBody>
                </CCard>
              </CCol>
            ))}
          </CRow>
        ) : (
          <CListGroup>
            {visibleItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                cfg={cfg}
                kind={kind}
                isMovimientos={isMovimientos}
                isWinner={isCotizacion && item.status === "Seleccionada"}
                onEdit={() => { setEditing(item); setPrefillTitle(null); setShowForm(true); }}
                onDelete={() => { setDeleteError(null); setConfirmTarget(item); }}
              />
            ))}
          </CListGroup>
        ))}
      </CCardBody>

      {showForm && (
        <ItemFormModal
          projectId={projectId}
          kind={kind}
          existing={editing}
          initialTitle={prefillTitle}
          existingRubros={existingRubros}
          showToast={showToast}
          onClose={() => setShowForm(false)}
          onSaved={(saved) => {
            setShowForm(false);
            setItems((cur) => {
              const idx = cur.findIndex((i) => i.id === saved.id);
              if (idx > -1) { const next = [...cur]; next[idx] = saved; return next; }
              return [saved, ...cur];
            });
            if (kind === "change_order") onProjectChanged();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        title={`Eliminar ${cfg.singular}`}
        message={`¿Eliminar "${confirmTarget?.title}"? Esta acción no se puede deshacer.`}
        busy={deleting}
        error={deleteError}
        onConfirm={() => confirmTarget && performDelete(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
    </CCard>
  );
}

/** Una fila de ítem — la misma card se usa en la lista plana (kinds que no
 * son Ejecución) y adentro de la ficha de un rubro (RubroFicha, abajo),
 * agrupada por tipo de insumo. Factorizada acá para no duplicar el bloque
 * de adjunto/comprobante/notas/acciones entre los dos lugares. */
function ItemRow({
  item, cfg, kind, isMovimientos, isWinner = false, onEdit, onDelete,
}: {
  item: ProjectItemDTO;
  cfg: ItemKindConfig;
  kind: string;
  isMovimientos: boolean;
  isWinner?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const comprobante = item.data?.comprobante as string | undefined;
  const comprobanteEsImagen = comprobante && /^https?:\/\//i.test(comprobante);
  const coords = parseCoords(item.data?.coordenadas);
  return (
    <CListGroupItem className={"item-row border-0 border-bottom rounded-0 px-0" + (isWinner ? " item-row-winner" : "")}>
      <div className="item-row-main">
        {isWinner && <span className="item-row-winner-badge" title="Cotización ganadora">✓</span>}
        <span className="item-title">{item.title}</span>
        {item.status && <span className={"status-chip status-generic status-" + item.status.toLowerCase().replace(/\s+/g, "_")}>{item.status}</span>}
      </div>
      {item.data?.contratistaId && (
        <div className="item-row-sub">
          <Link href={`/contratistas/${item.data.contratistaId}`}>{item.data.contratistaNombre || "Ver ficha del contratista"} ↗</Link>
        </div>
      )}
      {item.data?.cotizacionId && (
        <div className="item-row-sub">Cotización vinculada: {item.data.cotizacionNombre || "—"}</div>
      )}
      {coords && (
        <div className="item-row-sub">
          <a
            href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=17/${coords.lat}/${coords.lng}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            📍 Ver ubicación en el mapa ↗
          </a>
        </div>
      )}
      <div className="item-row-sub">
        {cfg.summary(item.data)}{cfg.summary(item.data) ? " · " : ""}{isMovimientos ? itemDate(item) : fmtDateTime(item.createdAt)}
      </div>
      {isMovimientos && item.data?.tipoInsumo === "Mano de obra" && item.data?.cantidadEjecutada && (
        <div className="item-row-sub">Cantidad ejecutada: {item.data.cantidadEjecutada} {item.data.unidadMedida || ""}</div>
      )}
      {item.data?.notas && <div className="item-row-notes">{item.data.notas}</div>}
      {item.data?.respuesta && <div className="item-row-notes">↳ {item.data.respuesta}</div>}
      {item.data?.motivo && <div className="item-row-notes">{item.data.motivo}</div>}
      {item.attachment ? (
        <a href={`/api/attachments/${item.attachment.id}`} target="_blank" rel="noopener noreferrer" className="item-row-notes d-inline-block">
          {item.attachment.mimeType.startsWith("image/") ? (
            <img src={`/api/attachments/${item.attachment.id}`} alt={item.attachment.filename} className="item-receipt-thumb" />
          ) : (
            <span>📄 {item.attachment.filename}</span>
          )}
        </a>
      ) : comprobante && (
        comprobanteEsImagen ? (
          <a href={comprobante} target="_blank" rel="noopener noreferrer" className="item-row-notes d-inline-block">
            <img src={comprobante} alt="Comprobante" className="item-receipt-thumb" />
          </a>
        ) : (
          <div className="item-row-notes">Comprobante: {comprobante}</div>
        )
      )}
      {kind === "photo" && item.data?.url && (
        <a href={item.data.url} target="_blank" rel="noopener noreferrer" className="item-row-notes d-inline-block">
          <img src={item.data.url} alt={item.title} className="item-receipt-thumb" />
        </a>
      )}
      {!cfg.readOnly && (
        <div className="item-row-actions">
          <CButton size="sm" color="secondary" variant="outline" onClick={onEdit}><CIcon icon={cilPencil} size="sm" /></CButton>
          <CButton size="sm" color="danger" variant="outline" onClick={onDelete}><CIcon icon={cilTrash} size="sm" /></CButton>
        </div>
      )}
    </CListGroupItem>
  );
}

/** Ficha de un rubro de Ejecución: todos los insumos cargados bajo el mismo
 * "Nombre del rubro" (item.title), separados por Tipo de insumo — para ver
 * de un vistazo cuánto se llevan materiales vs. mano de obra vs. maquinaria
 * dentro de ese rubro puntual, con el detalle (proveedor, cantidad
 * ejecutada, fecha, monto) de cada insumo. */
function RubroFicha({
  rubro, items, cfg, kind, onBack, onAdd, onEdit, onDelete,
}: {
  rubro: string;
  items: ProjectItemDTO[];
  cfg: ItemKindConfig;
  kind: string;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (item: ProjectItemDTO) => void;
  onDelete: (item: ProjectItemDTO) => void;
}) {
  const total = items.reduce((sum, i) => sum + Number(i.data?.monto ?? 0), 0);
  const sections = TIPO_INSUMO_ORDER.map((tipo) => ({ tipo, items: items.filter((i) => i.data?.tipoInsumo === tipo) })).filter(
    (s) => s.items.length > 0
  );
  const sinClasificar = items.filter((i) => !i.data?.tipoInsumo || !TIPO_INSUMO_ORDER.includes(i.data.tipoInsumo));

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-3">
        <div>
          <button type="button" className="btn btn-sm btn-link px-0 mb-1" onClick={onBack}>← Volver a Ejecución</button>
          <h2 className="h5 mb-0">{rubro}</h2>
          <span className="item-row-sub">{items.length} insumo{items.length === 1 ? "" : "s"} cargado{items.length === 1 ? "" : "s"}</span>
        </div>
        <div className="text-end">
          <div className="module-desc mb-0">Total del rubro</div>
          <div className="value mono fw-semibold fs-5">{fmtMoney(total)}</div>
        </div>
      </div>

      <CButton color="primary" size="sm" className="mb-4" onClick={onAdd}>
        <CIcon icon={cilPlus} className="me-1" /> Agregar insumo a este rubro
      </CButton>

      {items.length === 0 && <p className="empty-col">Este rubro todavía no tiene insumos cargados.</p>}

      {sections.map((s) => (
        <div className="mb-4" key={s.tipo}>
          <div className="d-flex align-items-center gap-2 mb-2">
            <span className="fw-semibold">{TIPO_INSUMO_ICON[s.tipo]} {s.tipo}</span>
            <CBadge color={TIPO_INSUMO_COLOR[s.tipo]}>{s.items.length}</CBadge>
            <span className="mono item-row-sub">{fmtMoney(s.items.reduce((sum, i) => sum + Number(i.data?.monto ?? 0), 0))}</span>
          </div>
          <CListGroup>
            {s.items.map((item) => (
              <ItemRow key={item.id} item={item} cfg={cfg} kind={kind} isMovimientos onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
            ))}
          </CListGroup>
        </div>
      ))}

      {sinClasificar.length > 0 && (
        <div className="mb-2">
          <div className="d-flex align-items-center gap-2 mb-2">
            <span className="fw-semibold">{TIPO_INSUMO_ICON["Sin clasificar"]} Sin clasificar</span>
            <CBadge color={TIPO_INSUMO_COLOR["Sin clasificar"]} className="text-dark">{sinClasificar.length}</CBadge>
            <span className="mono item-row-sub">{fmtMoney(sinClasificar.reduce((sum, i) => sum + Number(i.data?.monto ?? 0), 0))}</span>
          </div>
          <CListGroup>
            {sinClasificar.map((item) => (
              <ItemRow key={item.id} item={item} cfg={cfg} kind={kind} isMovimientos onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
            ))}
          </CListGroup>
        </div>
      )}
    </div>
  );
}

function ItemFormModal({
  projectId, kind, existing, initialTitle, existingRubros, showToast, onClose, onSaved,
}: {
  projectId: string;
  kind: string;
  existing: ProjectItemDTO | null;
  /** Con qué título prellenar el campo al crear un ítem nuevo (ver "Agregar insumo a este rubro" en RubroFicha). */
  initialTitle?: string | null;
  /** Nombres de rubro ya cargados en esta obra (solo Ejecución) — sugerencias del campo "Nombre del rubro" para que agrupar insumos del mismo rubro sea elegir de una lista, no repetir el nombre a mano. */
  existingRubros?: string[];
  showToast: (m: string) => void;
  onClose: () => void;
  onSaved: (item: ProjectItemDTO) => void;
}) {
  const cfg = ITEM_KINDS[kind];
  const [title, setTitle] = useState(existing?.title ?? initialTitle ?? "");
  const [status, setStatus] = useState(existing?.status ?? cfg.defaultStatus ?? "");
  // Parte Diario: un registro nuevo arranca con la fecha de hoy ya
  // cargada — es lo primero que se pide y no tiene sentido hacer que el
  // usuario la escriba a mano cada vez que solo quiere dejar algo del día.
  const [data, setData] = useState<Record<string, any>>(
    existing?.data ?? (kind === "daily_log" ? { fecha: new Date().toISOString().slice(0, 10) } : {})
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [contractors, setContractors] = useState<ContractorDTO[]>([]);
  const [quotes, setQuotes] = useState<ProjectItemDTO[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  // Archivo adjunto: se sube recién después de guardar el item (necesita
  // su id) — ver handleSubmit. `pendingFile` es lo elegido en esta sesión
  // de edición todavía sin subir; `removeAttachment` marca que se pidió
  // sacar el que ya estaba guardado.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);

  useEffect(() => {
    if (!cfg.fields.some((f) => f.type === "contractor")) return;
    fetch("/api/contractors?status=activo")
      .then((r) => (r.ok ? r.json() : []))
      .then(setContractors)
      .catch(() => setContractors([]));
  }, []);

  useEffect(() => {
    if (!cfg.fields.some((f) => f.type === "quote")) return;
    fetch(`/api/projects/${projectId}/items?kind=cotizacion`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setQuotes)
      .catch(() => setQuotes([]));
  }, [projectId]);

  useEffect(() => {
    if (!cfg.fields.some((f) => f.type === "supplier")) return;
    fetch("/api/suppliers?status=activo")
      .then((r) => (r.ok ? r.json() : []))
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, []);

  // Campos con showIf (ej. "Proveedor" o "Rubro ejecutado" en Ejecución,
  // que dependen de "Tipo de insumo"): si el campo actualmente cargado en
  // `data` ya no aplica (cambió la condición que lo mostraba), se limpia
  // solo — evita guardar datos de un campo que quedó oculto. Por ahora el
  // único disparador es tipoInsumo; si en el futuro hay más, hay que sumar
  // esa clave al array de dependencias.
  useEffect(() => {
    const hidden = cfg.fields.filter(
      (f) => f.showIf && !f.showIf(data) && data[f.key] !== undefined && data[f.key] !== "" && data[f.key] !== null
    );
    if (hidden.length === 0) return;
    setData((d) => {
      const next = { ...d };
      for (const f of hidden) {
        delete next[f.key];
        if (f.key.endsWith("Id")) delete next[f.key.replace(/Id$/, "") + "Nombre"];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.tipoInsumo]);

  function setField(key: string, value: string) {
    setData((d) => ({ ...d, [key]: value }));
  }

  // "contratistaId" -> "contratistaNombre", "cotizacionId" -> "cotizacionNombre":
  // se guarda el nombre/label junto al id para no tener que resolverlo de
  // nuevo cada vez que se lista el item (evita otro fetch por fila).
  function setContractorField(key: string, contractorId: string) {
    const chosen = contractors.find((c) => c.id === contractorId);
    const nameKey = key.replace(/Id$/, "") + "Nombre";
    setData((d) => ({ ...d, [key]: contractorId, [nameKey]: chosen?.name ?? "" }));
  }

  function setQuoteField(key: string, quoteId: string) {
    const chosen = quotes.find((q) => q.id === quoteId);
    const label = chosen
      ? `${chosen.title}${chosen.data?.contratistaNombre ? ` · ${chosen.data.contratistaNombre}` : ""} — Gs. ${Number(chosen.data?.monto ?? 0).toLocaleString("es-PY")}`
      : "";
    const nameKey = key.replace(/Id$/, "") + "Nombre";
    setData((d) => ({ ...d, [key]: quoteId, [nameKey]: label }));
  }

  function setSupplierField(key: string, supplierId: string) {
    const chosen = suppliers.find((s) => s.id === supplierId);
    const nameKey = key.replace(/Id$/, "") + "Nombre";
    setData((d) => ({ ...d, [key]: supplierId, [nameKey]: chosen?.name ?? "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Completá el título."); return; }
    setSaving(true);
    setError(null);
    try {
      const url = existing ? `/api/items/${existing.id}` : `/api/projects/${projectId}/items`;
      const method = existing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title, status: status || null, data }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const saved = await res.json();

      // El adjunto se sube/borra recién ahora que el item ya tiene id —
      // si algo de esto falla, el item ya se guardó igual: se avisa pero
      // no se bloquea el cierre del modal por un problema solo del archivo.
      if (pendingFile) {
        const fd = new FormData();
        fd.append("file", pendingFile);
        const upRes = await fetch(`/api/items/${saved.id}/attachment`, { method: "POST", body: fd });
        if (upRes.ok) saved.attachment = await upRes.json();
        else {
          const upBody = await upRes.json().catch(() => ({}));
          showToast(upBody.error || "El movimiento se guardó, pero no se pudo subir el archivo adjunto.");
        }
      } else if (removeAttachment && existing?.attachment) {
        await fetch(`/api/attachments/${existing.attachment.id}`, { method: "DELETE" }).catch(() => {});
        saved.attachment = null;
      }

      onSaved(saved);
    } catch (err: any) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CModal visible onClose={onClose} alignment="center" size="lg">
      <CModalHeader>
        <CModalTitle>{existing ? "Editar" : "Nuevo"} {cfg.singular}</CModalTitle>
      </CModalHeader>
      <CForm onSubmit={handleSubmit}>
        <CModalBody>
          {error && <CAlert color="danger">{error}</CAlert>}
          <div className="mb-3">
            <CFormLabel>{cfg.titleLabel}</CFormLabel>
            <CFormInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              list={existingRubros && existingRubros.length > 0 ? "rubro-title-suggestions" : undefined}
            />
            {existingRubros && existingRubros.length > 0 && (
              <datalist id="rubro-title-suggestions">
                {existingRubros.map((r) => <option key={r} value={r} />)}
              </datalist>
            )}
            {kind === "change_order" && (
              <p className="form-hint mb-0 mt-1">Los insumos con el mismo nombre de rubro se agrupan juntos en Ejecución.</p>
            )}
            {kind === "contratista" && (
              <p className="form-hint mb-0 mt-1">Podés elegir un rubro ya usado en Contratistas o en Ejecución de esta obra, o cargar uno nuevo.</p>
            )}
          </div>
          {cfg.statusOptions && (
            <div className="mb-3">
              <CFormLabel>Estado</CFormLabel>
              <CFormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {cfg.statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </CFormSelect>
            </div>
          )}
          {cfg.fields.filter((f) => !f.showIf || f.showIf(data)).map((f: ItemField) => (
            <div className="mb-3" key={f.key}>
              <CFormLabel>{f.label}</CFormLabel>
              {f.type === "textarea" ? (
                <CFormTextarea rows={3} value={data[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} required={f.required} />
              ) : f.type === "contractor" ? (
                <CFormSelect value={data[f.key] ?? ""} onChange={(e) => setContractorField(f.key, e.target.value)} required={f.required}>
                  <option value="">Seleccioná un contratista…</option>
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.city ? ` — ${c.city}` : ""}{c.contactName ? ` — Encargado: ${c.contactName}` : ""}
                    </option>
                  ))}
                </CFormSelect>
              ) : f.type === "supplier" ? (
                <CFormSelect value={data[f.key] ?? ""} onChange={(e) => setSupplierField(f.key, e.target.value)} required={f.required}>
                  <option value="">Seleccioná un proveedor…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ""}</option>
                  ))}
                </CFormSelect>
              ) : f.type === "quote" ? (
                <CFormSelect value={data[f.key] ?? ""} onChange={(e) => setQuoteField(f.key, e.target.value)} required={f.required}>
                  <option value="">Seleccioná una cotización…</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title}{q.data?.contratistaNombre ? ` · ${q.data.contratistaNombre}` : ""} — Gs. {Number(q.data?.monto ?? 0).toLocaleString("es-PY")}
                    </option>
                  ))}
                </CFormSelect>
              ) : f.type === "select" ? (
                <CFormSelect value={data[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} required={f.required}>
                  <option value="">Seleccioná…</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </CFormSelect>
              ) : f.type === "select-search" ? (
                <>
                  <CFormInput
                    list={`${f.key}-suggestions`}
                    value={data[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    required={f.required}
                    placeholder="Escribí para buscar o elegí una sugerencia…"
                  />
                  <datalist id={`${f.key}-suggestions`}>
                    {f.options?.map((o) => <option key={o} value={o} />)}
                  </datalist>
                </>
              ) : f.type === "location" ? (
                <LocationPicker
                  value={parseCoords(data[f.key])}
                  onChange={(coords) => setField(f.key, `${coords.lat},${coords.lng}`)}
                />
              ) : f.type === "file" ? (
                <FileDropZone
                  file={pendingFile}
                  existingAttachment={existing?.attachment ?? null}
                  markedForRemoval={removeAttachment}
                  onFileSelected={(picked) => { setPendingFile(picked); if (picked) setRemoveAttachment(false); }}
                  onToggleRemove={() => setRemoveAttachment(true)}
                />
              ) : (
                <CFormInput type={f.type} value={data[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} required={f.required} placeholder={f.placeholder} />
              )}
            </div>
          ))}
          {cfg.fields.some((f) => f.type === "contractor") && contractors.length === 0 && (
            <p className="form-hint">No hay contratistas activos todavía. <Link href="/contratistas">Cargá uno en el directorio</Link> primero.</p>
          )}
          {cfg.fields.some((f) => f.type === "quote") && quotes.length === 0 && (
            <p className="form-hint">No hay cotizaciones cargadas todavía en esta obra.</p>
          )}
          {cfg.fields.some((f) => f.type === "supplier") && suppliers.length === 0 && (
            <p className="form-hint">No hay proveedores activos todavía. <Link href="/proveedores">Cargá uno en el directorio</Link> primero.</p>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={onClose}>Cancelar</CButton>
          <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  );
}
