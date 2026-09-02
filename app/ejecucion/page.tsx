"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CCard, CCardBody, CCardHeader, CNav, CNavItem, CNavLink,
  CFormInput, CFormSelect, CButton, CRow, CCol, CBadge, CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell,
} from "@coreui/react";
import { CChartDoughnut, CChartLine } from "@coreui/react-chartjs";
import CIcon from "@coreui/icons-react";
import { cilCloudDownload, cilArrowLeft, cilDescription } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import { MOVIMIENTO_TIPOS } from "@/lib/movimientos";
import type { ProjectDTO, ProjectItemDTO, ProjectType, ProjectStatus } from "@/lib/types";

/**
 * Módulo global de Ejecución Presupuestaria — vista de solo lectura, cruzada
 * a todas las obras, sobre los mismos datos que ya vive en la pestaña
 * "Ejecución" de cada obra (ProjectItem kind="change_order"). Se llega acá
 * haciendo clic en la card "Ejecución presupuestaria" del Dashboard de
 * Inicio. Cargar/editar/eliminar movimientos sigue siendo desde la ficha
 * de la obra — esto es para BUSCAR una obra y revisar/exportar sus gastos
 * ya cargados, no para cargar nuevos.
 */

const TYPE_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const TYPE_COLOR: Record<ProjectType, string> = { civil: "info", electrico: "warning", vial: "secondary", otro: "dark" };
const STATUS_LABEL: Record<ProjectStatus, string> = { planificado: "Planificado", en_curso: "En curso", pausado: "Pausado", finalizado: "Finalizado" };
const STATUS_COLOR: Record<ProjectStatus, string> = { planificado: "info", en_curso: "warning", pausado: "secondary", finalizado: "success" };

// Mismo mapeo que lib/spent.ts (servidor) y app/project/[id]/page.tsx — acá
// se usa para armar el resumen/gráficos del lado del cliente.
const EFFECT_BY_TIPO: Record<string, string> = Object.fromEntries(MOVIMIENTO_TIPOS.map((t) => [t.value, t.effect]));
const CHART_COLORS_LIGHT = ["#4a6b85", "#a9803d", "#726c61", "#8172a3", "#5f8362", "#a0564d"];
const CHART_COLORS_DARK = ["#8ca9c2", "#d3af6e", "#b3ac9e", "#b3a4cc", "#8fb491", "#c98980"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtMoney(n: number) {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY");
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

const TABS = [
  { key: "gastos", label: "Planilla de gastos" },
  { key: "archivos", label: "Archivos y facturas" },
  { key: "resumen", label: "Resumen" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function EjecucionPage() {
  return (
    <Suspense fallback={<AppShell crumbs={[{ label: "Ejecución Presupuestaria" }]}><p className="state-message">Cargando…</p></AppShell>}>
      <EjecucionInner />
    </Suspense>
  );
}

function EjecucionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [pickerSearch, setPickerSearch] = useState("");

  const initialProjectId = searchParams.get("obra") || "";
  const [selectedId, setSelectedId] = useState(initialProjectId);
  const initialTab = (searchParams.get("tab") as TabKey) || "gastos";
  const [tab, setTabState] = useState<TabKey>(TABS.some((t) => t.key === initialTab) ? initialTab : "gastos");

  const [items, setItems] = useState<ProjectItemDTO[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then(setProjects)
      .finally(() => setLoadingProjects(false));
  }, []);

  useEffect(() => {
    if (!selectedId) { setItems([]); return; }
    setLoadingItems(true);
    fetch(`/api/projects/${selectedId}/items?kind=change_order`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems)
      .finally(() => setLoadingItems(false));
  }, [selectedId]);

  function selectProject(id: string) {
    setSelectedId(id);
    router.push(id ? `/ejecucion?obra=${id}&tab=${tab}` : "/ejecucion", { scroll: false });
  }
  function setTab(next: TabKey) {
    setTabState(next);
    if (selectedId) router.push(`/ejecucion?obra=${selectedId}&tab=${next}`, { scroll: false });
  }

  const selected = projects.find((p) => p.id === selectedId) ?? null;
  const filteredProjects = projects.filter((p) => {
    if (!pickerSearch) return true;
    const q = pickerSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.manager.toLowerCase().includes(q);
  });

  return (
    <AppShell crumbs={[{ label: "Ejecución Presupuestaria" }]}>
      <h1 className="of-page-title">💰 Ejecución Presupuestaria</h1>
      <p className="module-desc mb-4">Buscá una obra para revisar todos sus gastos ya cargados — en proceso o ya concluida.</p>

      <CCard className="mb-4">
        <CCardHeader className="module-panel-head">
          <div>
            <span className="fw-semibold fs-5">{selected ? "Obra seleccionada" : "Elegí una obra"}</span>
            {!selected && <p className="module-desc mb-0">Buscá por nombre o responsable, o elegí de la lista.</p>}
          </div>
          {selected && (
            <CButton color="secondary" variant="outline" size="sm" onClick={() => selectProject("")}>
              <CIcon icon={cilArrowLeft} className="me-1" /> Cambiar obra
            </CButton>
          )}
        </CCardHeader>
        {!selected && (
          <CCardBody>
            {loadingProjects && <p className="state-message">Cargando obras…</p>}
            {!loadingProjects && projects.length === 0 && <p className="empty-col">Todavía no hay obras cargadas.</p>}
            {!loadingProjects && projects.length > 0 && (
              <>
                <div className="mb-3">
                  <CFormInput
                    placeholder="Buscar obra por nombre o responsable…"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                  />
                </div>
                {filteredProjects.length === 0 && <p className="empty-col">Ninguna obra coincide con la búsqueda.</p>}
                {filteredProjects.length > 0 && (
                  <div className="table-wrap">
                    <CTable hover responsive>
                      <CTableHead>
                        <CTableRow>
                          <CTableHeaderCell>Obra</CTableHeaderCell>
                          <CTableHeaderCell>Tipo</CTableHeaderCell>
                          <CTableHeaderCell>Estado</CTableHeaderCell>
                          <CTableHeaderCell>Presupuesto</CTableHeaderCell>
                          <CTableHeaderCell>Ejecutado</CTableHeaderCell>
                          <CTableHeaderCell>% ejecutado</CTableHeaderCell>
                        </CTableRow>
                      </CTableHead>
                      <CTableBody>
                        {filteredProjects.map((p) => {
                          const pct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0;
                          return (
                            <CTableRow key={p.id} style={{ cursor: "pointer" }} onClick={() => selectProject(p.id)}>
                              <CTableDataCell className="fw-semibold">{p.name}</CTableDataCell>
                              <CTableDataCell><CBadge color={TYPE_COLOR[p.type]}>{TYPE_LABEL[p.type]}</CBadge></CTableDataCell>
                              <CTableDataCell><CBadge color={STATUS_COLOR[p.status]}>{STATUS_LABEL[p.status]}</CBadge></CTableDataCell>
                              <CTableDataCell className="mono">{fmtMoney(p.budget)}</CTableDataCell>
                              <CTableDataCell className="mono">{fmtMoney(p.spent)}</CTableDataCell>
                              <CTableDataCell className={"mono" + (p.spent > p.budget ? " alert-text" : "")}>{pct}%</CTableDataCell>
                            </CTableRow>
                          );
                        })}
                      </CTableBody>
                    </CTable>
                  </div>
                )}
              </>
            )}
          </CCardBody>
        )}
        {selected && (
          <CCardBody className="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <div className="fs-5 fw-semibold"><Link href={`/project/${selected.id}`}>{selected.name} ↗</Link></div>
              <div className="item-row-sub">
                <CBadge color={TYPE_COLOR[selected.type]} className="me-1">{TYPE_LABEL[selected.type]}</CBadge>
                <CBadge color={STATUS_COLOR[selected.status]}>{STATUS_LABEL[selected.status]}</CBadge>
                {" · "}{selected.manager}
              </div>
            </div>
            <div className="text-end">
              <div className="module-desc mb-0">Ejecutado / Presupuesto</div>
              <div className={"fs-5 fw-semibold mono" + (selected.spent > selected.budget ? " alert-text" : "")}>
                {fmtMoney(selected.spent)} / {fmtMoney(selected.budget)}
              </div>
            </div>
          </CCardBody>
        )}
      </CCard>

      {selected && (
        <>
          <CNav variant="underline" className="mb-4">
            {TABS.map((t) => (
              <CNavItem key={t.key}>
                <CNavLink active={tab === t.key} onClick={() => setTab(t.key)} style={{ cursor: "pointer" }}>
                  {t.label}
                </CNavLink>
              </CNavItem>
            ))}
          </CNav>

          {loadingItems && <p className="state-message">Cargando gastos…</p>}
          {!loadingItems && tab === "gastos" && <PlanillaGastosView project={selected} items={items} />}
          {!loadingItems && tab === "archivos" && <ArchivosView items={items} />}
          {!loadingItems && tab === "resumen" && <ResumenView project={selected} items={items} />}
        </>
      )}
    </AppShell>
  );
}

// ── Tab 1: Planilla de gastos ──────────────────────────────────────────

function exportGastosCSV(items: ProjectItemDTO[], projectName: string) {
  const headers = ["Fecha", "Tipo", "Descripción", "Categoría", "Monto (Gs.)", "Medio de pago", "Estado", "Contratista/Proveedor", "Comprobante", "Notas"];
  const rows = items.map((i) => [
    itemDate(i), i.data?.tipo ?? "", i.title, i.data?.categoria ?? "", Number(i.data?.monto ?? 0),
    i.data?.medioPago ?? "", i.status ?? "", i.data?.contratistaNombre ?? i.data?.proveedorNombre ?? "", i.data?.comprobante ?? "", i.data?.notas ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ejecucion-${projectName.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function PlanillaGastosView({ project, items }: { project: ProjectDTO; items: ProjectItemDTO[] }) {
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [sortBy, setSortBy] = useState<"fecha_desc" | "fecha_asc" | "monto_desc" | "monto_asc">("fecha_desc");

  const sumByTipo = (tipo: string) => items.filter((i) => i.data?.tipo === tipo).reduce((acc, i) => acc + Number(i.data?.monto ?? 0), 0);
  const adelantado = sumByTipo("Adelanto");
  const impactoOC = sumByTipo("Orden de cambio");
  const saldoDisponible = project.budget - project.spent;

  const visibleItems = items
    .filter((i) => !filterTipo || i.data?.tipo === filterTipo)
    .filter((i) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return [
        i.title, i.data?.notas, i.data?.categoria, i.data?.tipoInsumo, i.data?.frenteTrabajo, i.data?.tipoComprobante, i.data?.comprobante,
        i.data?.contratistaNombre, i.data?.proveedorNombre, i.data?.rubroEjecutado,
      ].some((v) => String(v ?? "").toLowerCase().includes(q));
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === "monto_desc") return Number(b.data?.monto ?? 0) - Number(a.data?.monto ?? 0);
      if (sortBy === "monto_asc") return Number(a.data?.monto ?? 0) - Number(b.data?.monto ?? 0);
      const da = (a.data?.fecha || a.createdAt).slice(0, 10);
      const db = (b.data?.fecha || b.createdAt).slice(0, 10);
      return sortBy === "fecha_asc" ? da.localeCompare(db) : db.localeCompare(da);
    });

  return (
    <CCard>
      <CCardHeader className="module-panel-head">
        <div>
          <span className="fw-semibold fs-5">Planilla de gastos</span>
          <p className="module-desc mb-0">Todos los movimientos cargados en la Ejecución de esta obra. Para agregar o editar, entrá a la ficha de la obra.</p>
        </div>
        <CButton color="secondary" variant="outline" size="sm" onClick={() => exportGastosCSV(items, project.name)} disabled={items.length === 0}>
          <CIcon icon={cilCloudDownload} className="me-1" /> Exportar CSV
        </CButton>
      </CCardHeader>
      <CCardBody>
        {items.length > 0 && (
          <div className="quote-budget-panel mb-3">
            <div className="quote-budget-item">
              <span className="qb-label">Presupuesto</span>
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
              <span className="qb-label">Impacto de órdenes de cambio</span>
              <span className="qb-value mono">{fmtMoney(impactoOC)}</span>
            </div>
            <div className="quote-budget-item">
              <span className="qb-label">Saldo disponible</span>
              <span className={"qb-value mono" + (saldoDisponible < 0 ? " alert-text" : "")}>{fmtMoney(saldoDisponible)}</span>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <CRow className="g-2 mb-3">
            <CCol md={5}>
              <CFormInput placeholder="Buscar por descripción, centro de costos, comprobante o notas…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </CCol>
            <CCol md={4}>
              <CFormSelect value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
                <option value="">Todos los tipos</option>
                {MOVIMIENTO_TIPOS.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}
              </CFormSelect>
            </CCol>
            <CCol md={3}>
              <CFormSelect value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                <option value="fecha_desc">Recientes primero</option>
                <option value="fecha_asc">Antiguos primero</option>
                <option value="monto_desc">Mayor monto</option>
                <option value="monto_asc">Menor monto</option>
              </CFormSelect>
            </CCol>
          </CRow>
        )}

        {items.length === 0 && <p className="empty-col">Esta obra todavía no tiene gastos cargados.</p>}
        {items.length > 0 && visibleItems.length === 0 && <p className="empty-col">Ningún gasto coincide con estos filtros.</p>}
        {visibleItems.length > 0 && (
          <div className="table-wrap">
            <CTable hover responsive>
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Fecha</CTableHeaderCell>
                  <CTableHeaderCell>Tipo</CTableHeaderCell>
                  <CTableHeaderCell>Descripción</CTableHeaderCell>
                  <CTableHeaderCell>Categoría</CTableHeaderCell>
                  <CTableHeaderCell>Monto (Gs)</CTableHeaderCell>
                  <CTableHeaderCell>Medio de pago</CTableHeaderCell>
                  <CTableHeaderCell>Estado</CTableHeaderCell>
                  <CTableHeaderCell>Comprobante</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {visibleItems.map((i) => (
                  <CTableRow key={i.id}>
                    <CTableDataCell className="mono">{itemDate(i)}</CTableDataCell>
                    <CTableDataCell>{i.data?.tipo || "—"}</CTableDataCell>
                    <CTableDataCell>
                      {i.title}
                      {i.data?.contratistaId ? (
                        <div className="item-row-sub">
                          <Link href={`/contratistas/${i.data.contratistaId}`}>{i.data.contratistaNombre || "Ver contratista"} ↗</Link>
                        </div>
                      ) : i.data?.proveedorNombre ? (
                        <div className="item-row-sub">{i.data.proveedorNombre}</div>
                      ) : i.data?.rubroEjecutado ? (
                        <div className="item-row-sub">Mano de obra: {i.data.rubroEjecutado}</div>
                      ) : null}
                    </CTableDataCell>
                    <CTableDataCell>{i.data?.categoria || "—"}</CTableDataCell>
                    <CTableDataCell className="mono">{fmtMoney(Number(i.data?.monto ?? 0))}</CTableDataCell>
                    <CTableDataCell>{i.data?.medioPago || "—"}</CTableDataCell>
                    <CTableDataCell>{i.status && <span className={"status-chip status-generic status-" + i.status.toLowerCase().replace(/\s+/g, "_")}>{i.status}</span>}</CTableDataCell>
                    <CTableDataCell>{i.attachment || i.data?.comprobante ? "📎" : "—"}</CTableDataCell>
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          </div>
        )}
      </CCardBody>
    </CCard>
  );
}

// ── Tab 2: Archivos y facturas ─────────────────────────────────────────

function ArchivosView({ items }: { items: ProjectItemDTO[] }) {
  const conComprobante = items.filter((i) => i.attachment || i.data?.comprobante);

  return (
    <CCard>
      <CCardHeader className="module-panel-head">
        <div>
          <span className="fw-semibold fs-5">Archivos y facturas</span>
          <p className="module-desc mb-0">Comprobantes cargados en cada gasto — fotos de factura/recibo, PDF adjunto o el número de comprobante.</p>
        </div>
      </CCardHeader>
      <CCardBody>
        {conComprobante.length === 0 && <p className="empty-col">Ningún gasto de esta obra tiene comprobante cargado todavía.</p>}
        {conComprobante.length > 0 && (
          <CRow className="g-3">
            {conComprobante.map((i) => {
              // El archivo adjunto real (subido por drag&drop) tiene prioridad
              // sobre el viejo comprobante de texto/link — ver lib/itemKinds.ts
              // (campo "comprobanteArchivo") y components/FileDropZone.tsx.
              const attachmentUrl = i.attachment ? `/api/attachments/${i.attachment.id}` : null;
              const attachmentEsImagen = i.attachment?.mimeType.startsWith("image/") ?? false;
              const comprobante = !i.attachment ? (i.data?.comprobante as string | undefined) : undefined;
              const comprobanteEsImagen = comprobante ? /^https?:\/\//i.test(comprobante) : false;
              const previewUrl = attachmentUrl ?? (comprobanteEsImagen ? comprobante : null);
              const previewIsImage = attachmentUrl ? attachmentEsImagen : comprobanteEsImagen;
              const linkHref = attachmentUrl ?? comprobante ?? "#";
              return (
                <CCol md={4} sm={6} key={i.id}>
                  <CCard className="h-100">
                    {previewUrl && previewIsImage ? (
                      <a href={linkHref} target="_blank" rel="noopener noreferrer">
                        <img src={previewUrl} alt="Comprobante" style={{ width: "100%", maxHeight: 160, objectFit: "cover", borderTopLeftRadius: 6, borderTopRightRadius: 6 }} />
                      </a>
                    ) : attachmentUrl ? (
                      <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="d-flex align-items-center justify-content-center" style={{ height: 100, background: "var(--panel-2, rgba(0,0,0,.03))" }}>
                        <CIcon icon={cilDescription} size="xl" className="text-body-secondary" />
                      </a>
                    ) : (
                      <div className="d-flex align-items-center justify-content-center" style={{ height: 100, background: "var(--panel-2, rgba(0,0,0,.03))" }}>
                        <CIcon icon={cilDescription} size="xl" className="text-body-secondary" />
                      </div>
                    )}
                    <CCardBody>
                      <div className="fw-semibold">{i.title}</div>
                      <div className="item-row-sub">{itemDate(i)} · {fmtMoney(Number(i.data?.monto ?? 0))}</div>
                      {i.data?.tipo && <div className="item-row-sub">{i.data.tipo}</div>}
                      {i.attachment && <div className="item-row-notes">📄 {i.attachment.filename}</div>}
                      {!i.attachment && comprobante && !comprobanteEsImagen && <div className="item-row-notes">Comprobante: {comprobante}</div>}
                    </CCardBody>
                  </CCard>
                </CCol>
              );
            })}
          </CRow>
        )}
      </CCardBody>
    </CCard>
  );
}

// ── Tab 3: Resumen ──────────────────────────────────────────────────────

function ResumenView({ project, items }: { project: ProjectDTO; items: ProjectItemDTO[] }) {
  const ejecucionPct = project.budget > 0 ? Math.min(100, (project.spent / project.budget) * 100) : 0;
  const saldoDisponible = project.budget - project.spent;

  const categoriaSums: Record<string, number> = {};
  items.forEach((i) => {
    const cat = i.data?.categoria || "Sin categoría";
    categoriaSums[cat] = (categoriaSums[cat] ?? 0) + Number(i.data?.monto ?? 0);
  });
  const categoriaLabels = Object.keys(categoriaSums);

  const monthlyTotals = new Map<string, number>();
  items.forEach((i) => {
    const effect = EFFECT_BY_TIPO[i.data?.tipo ?? ""];
    if (effect !== "add" && effect !== "subtract") return;
    const month = (i.data?.fecha || i.createdAt).slice(0, 7);
    const monto = Number(i.data?.monto ?? 0) * (effect === "subtract" ? -1 : 1);
    monthlyTotals.set(month, (monthlyTotals.get(month) ?? 0) + monto);
  });
  const monthKeys = Array.from(monthlyTotals.keys()).sort();
  let runningTotal = 0;
  const monthlyCumulative = monthKeys.map((m) => (runningTotal += monthlyTotals.get(m) ?? 0));

  const isDark = typeof document !== "undefined" && document.documentElement.getAttribute("data-coreui-theme") === "dark";
  const chartColors = isDark ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;
  const tickColor = isDark ? "#a39e93" : "#75726a";
  const gridColor = isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)";

  return (
    <>
      <div className="row g-3 mb-4">
        <div className="col-md-3 col-6">
          <CCard className="h-100"><CCardBody>
            <div className="text-uppercase text-body-secondary small mb-1">Presupuesto</div>
            <div className="fs-3 fw-bold mono">{fmtMoney(project.budget)}</div>
          </CCardBody></CCard>
        </div>
        <div className="col-md-3 col-6">
          <CCard className="h-100"><CCardBody>
            <div className="text-uppercase text-body-secondary small mb-1">Ejecutado</div>
            <div className={"fs-3 fw-bold mono" + (project.spent > project.budget ? " alert-text" : "")}>{fmtMoney(project.spent)}</div>
          </CCardBody></CCard>
        </div>
        <div className="col-md-3 col-6">
          <CCard className="h-100"><CCardBody>
            <div className="text-uppercase text-body-secondary small mb-1">% ejecutado</div>
            <div className="fs-3 fw-bold mono">{Math.round(ejecucionPct)}%</div>
          </CCardBody></CCard>
        </div>
        <div className="col-md-3 col-6">
          <CCard className="h-100"><CCardBody>
            <div className="text-uppercase text-body-secondary small mb-1">Saldo disponible</div>
            <div className={"fs-3 fw-bold mono" + (saldoDisponible < 0 ? " alert-text" : "")}>{fmtMoney(saldoDisponible)}</div>
          </CCardBody></CCard>
        </div>
      </div>

      <div className="mb-4">
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${ejecucionPct}%`, background: project.spent > project.budget ? "var(--crit)" : "var(--ok)" }} />
        </div>
        <span className="item-row-sub">{Math.round(ejecucionPct)}% del presupuesto ejecutado</span>
      </div>

      {items.length === 0 && <p className="empty-col">Sin gastos cargados todavía para esta obra.</p>}
      {items.length > 0 && (
        <CRow className="g-3">
          {categoriaLabels.length > 0 && (
            <CCol md={6}>
              <CCard className="h-100">
                <CCardHeader className="fw-semibold">Gasto por categoría</CCardHeader>
                <CCardBody className="d-flex align-items-center justify-content-center">
                  <CChartDoughnut
                    style={{ maxHeight: 220 }}
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
                    style={{ maxHeight: 220 }}
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
    </>
  );
}
