"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CCard, CCardBody, CCardHeader, CFormInput, CFormSelect, CButton, CRow, CCol,
  CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell,
  CBadge,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilCloudDownload, cilDescription } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import { MOVIMIENTO_TIPOS } from "@/lib/movimientos";
import type { MovimientoDTO, ProjectType } from "@/lib/types";

/**
 * Ejecución cruzada a TODAS las obras — a diferencia de /ejecucion (que
 * pide elegir una obra primero), esto es el libro diario completo de la
 * empresa: todos los movimientos de todas las obras y rubros juntos, para
 * poder auditar/buscar sin tener que entrar obra por obra. Se llega acá
 * haciendo clic en la card "Costos vs. beneficios" de Inicio. Solo lectura
 * — cargar/editar/eliminar un movimiento sigue siendo desde la ficha de la
 * obra correspondiente.
 */

const TYPE_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const TYPE_COLOR: Record<ProjectType, string> = { civil: "info", electrico: "warning", vial: "secondary", otro: "dark" };
const TYPE_ORDER: ProjectType[] = ["civil", "electrico", "vial", "otro"];

function fmtMoney(n: number) {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY");
}
/** "YYYY-MM-DD" (o el createdAt como respaldo) -> "DD/MM/YYYY". */
function itemDate(m: MovimientoDTO): string {
  const raw = (m.data?.fecha || m.createdAt).slice(0, 10);
  const [y, mo, d] = raw.split("-");
  return y && mo && d ? `${d}/${mo}/${y}` : raw;
}

function exportCSV(rows: MovimientoDTO[]) {
  const headers = [
    "Fecha", "Obra", "Rubro", "Concepto", "Categoría", "Contratista/Proveedor",
    "Monto (Gs.)", "Medio de pago", "Estado", "Procesado por", "Comprobante", "Notas",
  ];
  const csvRows = rows.map((m) => [
    itemDate(m), m.projectName, TYPE_LABEL[m.projectType], m.title, m.data?.categoria ?? "",
    m.data?.contratistaNombre ?? "", Number(m.data?.monto ?? 0), m.data?.medioPago ?? "", m.status ?? "",
    m.data?.procesadoPor ?? "", m.attachment?.filename ?? m.data?.comprobante ?? "", m.data?.notas ?? "",
  ]);
  const csv = [headers, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `movimientos-obrasflow-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MovimientosPage() {
  const [movimientos, setMovimientos] = useState<MovimientoDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterObra, setFilterObra] = useState("");
  const [filterRubro, setFilterRubro] = useState<ProjectType | "">("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<"fecha_desc" | "fecha_asc" | "monto_desc" | "monto_asc">("fecha_desc");

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    fetch("/api/movimientos")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setMovimientos)
      .catch(() => setLoadError("No se pudieron cargar los movimientos."))
      .finally(() => setLoading(false));
  }, []);

  // Obras/estados presentes en los datos — evita un fetch aparte a /api/projects
  // solo para poblar el selector.
  const obraOptions = useMemo(() => {
    const map = new Map<string, string>();
    movimientos.forEach((m) => map.set(m.projectId, m.projectName));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [movimientos]);
  const estadoOptions = useMemo(
    () => Array.from(new Set(movimientos.map((m) => m.status).filter(Boolean))) as string[],
    [movimientos]
  );

  const totalMonto = movimientos.reduce((sum, m) => sum + Number(m.data?.monto ?? 0), 0);

  const visible = movimientos
    .filter((m) => !filterObra || m.projectId === filterObra)
    .filter((m) => !filterRubro || m.projectType === filterRubro)
    .filter((m) => !filterTipo || m.data?.tipo === filterTipo)
    .filter((m) => !filterEstado || m.status === filterEstado)
    .filter((m) => {
      const fecha = (m.data?.fecha || m.createdAt).slice(0, 10);
      if (dateFrom && fecha < dateFrom) return false;
      if (dateTo && fecha > dateTo) return false;
      return true;
    })
    .filter((m) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return [
        m.title, m.projectName, m.data?.categoria, m.data?.contratistaNombre,
        m.data?.tipoInsumo, m.data?.frenteTrabajo, m.data?.tipoComprobante, m.data?.comprobante,
        m.data?.procesadoPor, m.data?.notas,
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

  const filtersActive = Boolean(search || filterObra || filterRubro || filterTipo || filterEstado || dateFrom || dateTo);
  function clearFilters() {
    setSearch(""); setFilterObra(""); setFilterRubro(""); setFilterTipo(""); setFilterEstado(""); setDateFrom(""); setDateTo("");
  }

  return (
    <AppShell crumbs={[{ label: "Movimientos" }]}>
      <h1 className="of-page-title">📒 Movimientos</h1>
      <p className="module-desc mb-4">
        Todos los movimientos de todas las obras y rubros, en un solo lugar. Para cargar o editar uno, entrá a la
        Ejecución de la obra correspondiente.
      </p>

      <CCard>
        <CCardHeader className="module-panel-head">
          <div>
            <span className="fw-semibold fs-5">Movimientos</span>
            <p className="module-desc mb-0">{movimientos.length} movimiento{movimientos.length === 1 ? "" : "s"} cargados — total {fmtMoney(totalMonto)}.</p>
          </div>
          <CButton color="secondary" variant="outline" size="sm" onClick={() => exportCSV(visible)} disabled={visible.length === 0}>
            <CIcon icon={cilCloudDownload} className="me-1" /> Exportar CSV
          </CButton>
        </CCardHeader>
        <CCardBody>
          {loading && <p className="state-message">Cargando movimientos…</p>}
          {!loading && loadError && <p className="state-message form-error">{loadError}</p>}
          {!loading && !loadError && movimientos.length === 0 && <p className="empty-col">Todavía no hay movimientos cargados en ninguna obra.</p>}

          {!loading && !loadError && movimientos.length > 0 && (
            <>
              <CRow className="g-2 mb-2">
                <CCol md={4}>
                  <CFormInput placeholder="Buscar por concepto, obra, categoría, contratista, comprobante…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </CCol>
                <CCol md={3}>
                  <CFormSelect value={filterObra} onChange={(e) => setFilterObra(e.target.value)}>
                    <option value="">Todas las obras</option>
                    {obraOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </CFormSelect>
                </CCol>
                <CCol md={2}>
                  <CFormSelect value={filterRubro} onChange={(e) => setFilterRubro(e.target.value as ProjectType | "")}>
                    <option value="">Todos los rubros</option>
                    {TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </CFormSelect>
                </CCol>
                <CCol md={3}>
                  <CFormSelect value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
                    <option value="">Todos los tipos</option>
                    {MOVIMIENTO_TIPOS.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}
                  </CFormSelect>
                </CCol>
              </CRow>
              <CRow className="g-2 mb-3">
                <CCol md={3}>
                  <CFormSelect value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}>
                    <option value="">Todos los estados</option>
                    {estadoOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </CFormSelect>
                </CCol>
                <CCol md={2}><CFormInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Desde" /></CCol>
                <CCol md={2}><CFormInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Hasta" /></CCol>
                <CCol md={2}>
                  <CFormSelect value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                    <option value="fecha_desc">Recientes primero</option>
                    <option value="fecha_asc">Antiguos primero</option>
                    <option value="monto_desc">Mayor monto</option>
                    <option value="monto_asc">Menor monto</option>
                  </CFormSelect>
                </CCol>
                {filtersActive && (
                  <CCol md={3} className="d-flex align-items-center">
                    <button type="button" className="btn btn-sm btn-link px-0" onClick={clearFilters}>Limpiar filtros</button>
                  </CCol>
                )}
              </CRow>

              {visible.length === 0 && <p className="empty-col">Ningún movimiento coincide con estos filtros.</p>}
              {visible.length > 0 && (
                <div className="table-wrap">
                  <CTable hover responsive>
                    <CTableHead>
                      <CTableRow>
                        <CTableHeaderCell>Fecha</CTableHeaderCell>
                        <CTableHeaderCell>Obra</CTableHeaderCell>
                        <CTableHeaderCell>Rubro</CTableHeaderCell>
                        <CTableHeaderCell>Concepto</CTableHeaderCell>
                        <CTableHeaderCell>Categoría</CTableHeaderCell>
                        <CTableHeaderCell>Contratista / Proveedor</CTableHeaderCell>
                        <CTableHeaderCell>Monto (Gs)</CTableHeaderCell>
                        <CTableHeaderCell>Medio de pago</CTableHeaderCell>
                        <CTableHeaderCell>Estado</CTableHeaderCell>
                        <CTableHeaderCell>Procesado por</CTableHeaderCell>
                        <CTableHeaderCell>Comprobante</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {visible.map((m) => (
                        <CTableRow key={m.id}>
                          <CTableDataCell className="mono">{itemDate(m)}</CTableDataCell>
                          <CTableDataCell><Link href={`/project/${m.projectId}`}>{m.projectName} ↗</Link></CTableDataCell>
                          <CTableDataCell><CBadge color={TYPE_COLOR[m.projectType]}>{TYPE_LABEL[m.projectType]}</CBadge></CTableDataCell>
                          <CTableDataCell>{m.title}</CTableDataCell>
                          <CTableDataCell>{m.data?.categoria || "—"}</CTableDataCell>
                          <CTableDataCell>
                            {m.data?.contratistaId ? (
                              <Link href={`/contratistas/${m.data.contratistaId}`}>{m.data.contratistaNombre || "Ver contratista"} ↗</Link>
                            ) : "—"}
                          </CTableDataCell>
                          <CTableDataCell className="mono">{fmtMoney(Number(m.data?.monto ?? 0))}</CTableDataCell>
                          <CTableDataCell>{m.data?.medioPago || "—"}</CTableDataCell>
                          <CTableDataCell>{m.status && <span className={"status-chip status-generic status-" + m.status.toLowerCase().replace(/\s+/g, "_")}>{m.status}</span>}</CTableDataCell>
                          <CTableDataCell>{m.data?.procesadoPor || "—"}</CTableDataCell>
                          <CTableDataCell>
                            {m.attachment ? (
                              <a href={`/api/attachments/${m.attachment.id}`} target="_blank" rel="noopener noreferrer">
                                {m.attachment.mimeType.startsWith("image/") ? (
                                  <img src={`/api/attachments/${m.attachment.id}`} alt={m.attachment.filename} className="item-receipt-thumb" />
                                ) : (
                                  <span><CIcon icon={cilDescription} size="sm" className="me-1" />{m.attachment.filename}</span>
                                )}
                              </a>
                            ) : m.data?.comprobante ? (
                              /^https?:\/\//i.test(m.data.comprobante) ? (
                                <a href={m.data.comprobante} target="_blank" rel="noopener noreferrer">
                                  <img src={m.data.comprobante} alt="Comprobante" className="item-receipt-thumb" />
                                </a>
                              ) : (
                                <span>{m.data.comprobante}</span>
                              )
                            ) : "—"}
                          </CTableDataCell>
                        </CTableRow>
                      ))}
                    </CTableBody>
                  </CTable>
                </div>
              )}
            </>
          )}
        </CCardBody>
      </CCard>
    </AppShell>
  );
}
