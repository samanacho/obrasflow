"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CCard, CCardBody, CCardHeader, CFormInput, CFormSelect, CButton, CRow, CCol,
  CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell,
  CBadge, CNav, CNavItem, CNavLink,
  CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter, CForm, CFormLabel, CFormTextarea, CAlert,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilCloudDownload, cilDescription, cilPlus, cilPencil, cilTrash } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import { MOVIMIENTO_TIPOS } from "@/lib/movimientos";
import { COST_CENTER_SUGGESTIONS } from "@/lib/itemKinds";
import type { MovimientoDTO, ProjectType, GeneralMovementDTO, GeneralMovementInput, GeneralMovementTipo } from "@/lib/types";

/**
 * Ejecución cruzada a TODAS las obras — a diferencia de /ejecucion (que
 * pide elegir una obra primero), esto es el libro diario completo de la
 * empresa: todos los movimientos de todas las obras y rubros juntos, para
 * poder auditar/buscar sin tener que entrar obra por obra. Se llega acá
 * haciendo clic en la card "Costos vs. beneficios" de Inicio. Los
 * movimientos de obra siguen siendo de solo lectura acá (se cargan/editan
 * desde la ficha de la obra correspondiente); los movimientos generales
 * (sin obra — ver GeneralMovement en prisma/schema.prisma) sí se cargan,
 * editan y eliminan desde esta misma pantalla.
 */

const TYPE_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const TYPE_COLOR: Record<ProjectType, string> = { civil: "info", electrico: "warning", vial: "secondary", otro: "dark" };
const TYPE_ORDER: ProjectType[] = ["civil", "electrico", "vial", "otro"];

const MEDIO_PAGO_OPTIONS = ["Efectivo", "Transferencia", "Cheque", "Tarjeta", "Crédito"];
const ESTADO_GENERAL_OPTIONS = ["Pendiente", "Pagado", "Conciliado"];

function fmtMoney(n: number) {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY");
}
/** "YYYY-MM-DD" (o el createdAt como respaldo) -> "DD/MM/YYYY". */
function itemDate(m: MovimientoDTO): string {
  const raw = (m.data?.fecha || m.createdAt).slice(0, 10);
  const [y, mo, d] = raw.split("-");
  return y && mo && d ? `${d}/${mo}/${y}` : raw;
}
/** "YYYY-MM-DD" -> "DD/MM/YYYY", mismo criterio que itemDate() pero para GeneralMovementDTO (sin createdAt de respaldo, fecha siempre viene cargada). */
function generalDate(fecha: string): string {
  const raw = fecha.slice(0, 10);
  const [y, mo, d] = raw.split("-");
  return y && mo && d ? `${d}/${mo}/${y}` : raw;
}

/**
 * Fila normalizada de la tabla "Movimientos" — mezcla movimientos de obra
 * (MovimientoDTO, kind="change_order") y movimientos generales sin obra
 * (GeneralMovementDTO) en una sola forma para que un único bloque de
 * filtros/orden/CSV/tabla funcione igual sobre ambas fuentes.
 */
interface LedgerRow {
  id: string;
  source: "obra" | "general";
  fecha: string; // "YYYY-MM-DD", para ordenar/filtrar por fecha
  fechaLabel: string; // "DD/MM/YYYY", para mostrar
  obraId: string | null;
  obraNombre: string | null;
  obraTipo: ProjectType | null;
  concepto: string;
  categoria: string | null;
  contratistaProveedorLabel: string | null; // solo obra; null para general
  contratistaId: string | null; // para el link, solo obra
  monto: number;
  movTipoObra: string | null; // m.data?.tipo, solo obra — para el filtro "Todos los tipos" existente
  ingresoEgreso: GeneralMovementTipo | null; // solo general
  medioPago: string | null;
  estado: string | null;
  procesadoPor: string | null;
  responsable: string | null; // solo general — quién consiguió el ingreso, ver GeneralMovement.responsable
  attachment: MovimientoDTO["attachment"] | null; // solo obra, general no tiene adjunto en esta primera versión
  comprobanteTexto: string | null; // m.data?.comprobante, solo obra
  notas: string | null;
  raw: MovimientoDTO | GeneralMovementDTO; // para prellenar el modal de edición / linkear la obra
}

function obraToRow(m: MovimientoDTO): LedgerRow {
  const contratistaProveedorLabel =
    m.data?.contratistaNombre || m.data?.proveedorNombre
      ? m.data?.contratistaNombre || m.data?.proveedorNombre
      : m.data?.rubroEjecutado
      ? `Mano de obra: ${m.data.rubroEjecutado}`
      : null;
  return {
    id: m.id,
    source: "obra",
    fecha: (m.data?.fecha || m.createdAt).slice(0, 10),
    fechaLabel: itemDate(m),
    obraId: m.projectId,
    obraNombre: m.projectName,
    obraTipo: m.projectType,
    concepto: m.title,
    categoria: m.data?.categoria ?? null,
    contratistaProveedorLabel,
    contratistaId: m.data?.contratistaId ?? null,
    monto: Number(m.data?.monto ?? 0),
    movTipoObra: m.data?.tipo ?? null,
    ingresoEgreso: null,
    medioPago: m.data?.medioPago ?? null,
    estado: m.status ?? null,
    procesadoPor: m.data?.procesadoPor ?? null,
    responsable: null,
    attachment: m.attachment ?? null,
    comprobanteTexto: m.data?.comprobante ?? null,
    notas: m.data?.notas ?? null,
    raw: m,
  };
}

function generalToRow(g: GeneralMovementDTO): LedgerRow {
  return {
    id: g.id,
    source: "general",
    fecha: g.fecha,
    fechaLabel: generalDate(g.fecha),
    obraId: null,
    obraNombre: null,
    obraTipo: null,
    concepto: g.concepto,
    categoria: g.categoria,
    contratistaProveedorLabel: null,
    contratistaId: null,
    monto: g.monto,
    movTipoObra: null,
    ingresoEgreso: g.tipo,
    medioPago: g.medioPago,
    estado: g.estado,
    procesadoPor: g.procesadoPor,
    responsable: g.responsable,
    attachment: null,
    comprobanteTexto: null,
    notas: g.notas,
    raw: g,
  };
}

function exportCSV(rows: LedgerRow[]) {
  const headers = [
    "Fecha", "Obra", "Rubro", "Concepto", "Categoría", "Contratista/Proveedor",
    "Monto (Gs.)", "Medio de pago", "Estado", "Procesado por", "Responsable", "Comprobante", "Notas",
  ];
  const csvRows = rows.map((r) => [
    r.fechaLabel,
    r.obraNombre ?? "General (sin obra)",
    r.obraTipo ? TYPE_LABEL[r.obraTipo] : r.ingresoEgreso === "egreso" ? "Egreso" : r.ingresoEgreso === "ingreso" ? "Ingreso" : "",
    r.concepto,
    r.categoria ?? "",
    r.contratistaProveedorLabel ?? "",
    r.monto,
    r.medioPago ?? "",
    r.estado ?? "",
    r.procesadoPor ?? "",
    r.responsable ?? "",
    r.attachment?.filename ?? r.comprobanteTexto ?? "",
    r.notas ?? "",
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

interface RubroAgregado {
  rubro: string;
  unidadMedida: string;
  cantidadTotal: number;
  vecesEjecutado: number;
  precioActual: number | null;
  ultimaFecha: string;
  ultimaObraId: string;
  ultimaObraNombre: string;
}

function RubrosEjecutadosView({ movimientos }: { movimientos: MovimientoDTO[] }) {
  const [search, setSearch] = useState("");

  const rubros = useMemo<RubroAgregado[]>(() => {
    const groups = new Map<string, MovimientoDTO[]>();
    movimientos
      .filter((m) => m.data?.tipoInsumo === "Mano de obra")
      .filter((m) => String(m.data?.rubroEjecutado ?? "").trim() !== "")
      .forEach((m) => {
        const key = String(m.data.rubroEjecutado).trim();
        const arr = groups.get(key) ?? [];
        arr.push(m);
        groups.set(key, arr);
      });

    const result: RubroAgregado[] = [];
    groups.forEach((items, rubro) => {
      const sorted = items
        .slice()
        .sort((a, b) => {
          const da = (a.data?.fecha || a.createdAt).slice(0, 10);
          const db = (b.data?.fecha || b.createdAt).slice(0, 10);
          return db.localeCompare(da);
        });
      const latest = sorted[0];
      const cantidadTotal = items.reduce((sum, m) => sum + Number(m.data?.cantidadEjecutada ?? 0), 0);
      const cantidadEjecutadaLatest = Number(latest.data?.cantidadEjecutada ?? 0);
      const montoLatest = Number(latest.data?.monto ?? 0);
      const precioActual =
        Number.isFinite(cantidadEjecutadaLatest) && cantidadEjecutadaLatest > 0
          ? montoLatest / cantidadEjecutadaLatest
          : null;
      result.push({
        rubro,
        unidadMedida: latest.data?.unidadMedida || "—",
        cantidadTotal,
        vecesEjecutado: items.length,
        precioActual,
        ultimaFecha: itemDate(latest),
        ultimaObraId: latest.projectId,
        ultimaObraNombre: latest.projectName,
      });
    });

    return result.sort((a, b) => b.cantidadTotal - a.cantidadTotal);
  }, [movimientos]);

  const visible = rubros.filter((r) => !search || r.rubro.toLowerCase().includes(search.toLowerCase()));

  return (
    <CCard>
      <CCardHeader className="module-panel-head">
        <div>
          <span className="fw-semibold fs-5">Rubros ejecutados</span>
          <p className="module-desc mb-0">
            Cantidad total ejecutada, veces trabajado y precio actual por unidad de cada rubro de mano de obra,
            en todas las obras — para saber con qué experiencia contamos y a qué precio estamos trabajando hoy.
          </p>
        </div>
      </CCardHeader>
      <CCardBody>
        {rubros.length === 0 ? (
          <p className="empty-col">Todavía no hay movimientos de mano de obra con rubro ejecutado cargado.</p>
        ) : (
          <>
            <CRow className="g-2 mb-3">
              <CCol md={4}>
                <CFormInput placeholder="Buscar rubro…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </CCol>
            </CRow>

            {visible.length === 0 && <p className="empty-col">Ningún rubro coincide con esta búsqueda.</p>}
            {visible.length > 0 && (
              <div className="table-wrap">
                <CTable hover responsive>
                  <CTableHead>
                    <CTableRow>
                      <CTableHeaderCell>Rubro</CTableHeaderCell>
                      <CTableHeaderCell>Unidad de medida</CTableHeaderCell>
                      <CTableHeaderCell>Cantidad total ejecutada</CTableHeaderCell>
                      <CTableHeaderCell>Veces ejecutado</CTableHeaderCell>
                      <CTableHeaderCell>Precio actual por unidad (Gs)</CTableHeaderCell>
                      <CTableHeaderCell>Última vez</CTableHeaderCell>
                      <CTableHeaderCell>Última obra</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {visible.map((r) => (
                      <CTableRow key={r.rubro}>
                        <CTableDataCell>{r.rubro}</CTableDataCell>
                        <CTableDataCell>{r.unidadMedida}</CTableDataCell>
                        <CTableDataCell className="mono">
                          {Number.isInteger(r.cantidadTotal) ? r.cantidadTotal : r.cantidadTotal.toFixed(2)}
                        </CTableDataCell>
                        <CTableDataCell className="mono">{r.vecesEjecutado}</CTableDataCell>
                        <CTableDataCell className="mono">{r.precioActual != null ? fmtMoney(r.precioActual) : "—"}</CTableDataCell>
                        <CTableDataCell className="mono">{r.ultimaFecha}</CTableDataCell>
                        <CTableDataCell><Link href={`/project/${r.ultimaObraId}`}>{r.ultimaObraNombre} ↗</Link></CTableDataCell>
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
  );
}

const EMPTY_GENERAL_FORM: GeneralMovementInput = {
  fecha: new Date().toISOString().slice(0, 10),
  tipo: "ingreso",
  concepto: "",
  categoria: "",
  monto: 0,
  medioPago: "",
  estado: "Pendiente",
  procesadoPor: "",
  responsable: "",
  notas: "",
};

// Sugerencias fijas para "Responsable" — los dos socios van a aparecer casi
// siempre, aunque cualquier ingreso lo puede conseguir otra persona (no es
// un catálogo cerrado, el campo sigue siendo texto libre). Se completan con
// los nombres ya cargados antes (ver existingResponsables más abajo).
const RESPONSABLE_SUGGESTIONS_BASE = ["Ignacio Samaniego", "Hugo Rotela"];

/** Alta/edición de un movimiento general (sin obra) — POST/PUT /api/general-movements. */
function GeneralMovementFormModal({
  editing,
  existingResponsables,
  onClose,
  onSaved,
}: {
  editing: GeneralMovementDTO | null;
  existingResponsables: string[];
  onClose: () => void;
  onSaved: (g: GeneralMovementDTO) => void;
}) {
  const [form, setForm] = useState<GeneralMovementInput>(
    editing
      ? {
          fecha: editing.fecha,
          tipo: editing.tipo,
          concepto: editing.concepto,
          categoria: editing.categoria ?? "",
          monto: editing.monto,
          medioPago: editing.medioPago ?? "",
          estado: editing.estado ?? "Pendiente",
          procesadoPor: editing.procesadoPor ?? "",
          responsable: editing.responsable ?? "",
          notas: editing.notas ?? "",
        }
      : EMPTY_GENERAL_FORM
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const responsableSuggestions = Array.from(new Set([...RESPONSABLE_SUGGESTIONS_BASE, ...existingResponsables])).sort();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fecha) { setError("La fecha es obligatoria."); return; }
    if (!form.concepto.trim()) { setError("El concepto es obligatorio."); return; }
    if (!(Number(form.monto) > 0)) { setError("El monto tiene que ser mayor a cero."); return; }
    if (form.tipo === "ingreso" && !(form.responsable ?? "").trim()) {
      setError("El responsable es obligatorio para un ingreso — es quien consiguió ese ingreso, para el reparto de beneficios de Personal.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editing ? `/api/general-movements/${editing.id}` : "/api/general-movements";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const saved: GeneralMovementDTO = await res.json();
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
        <CModalTitle>{editing ? "Editar" : "Nuevo"} movimiento general</CModalTitle>
      </CModalHeader>
      <CForm onSubmit={handleSubmit}>
        <CModalBody>
          {error && <CAlert color="danger">{error}</CAlert>}
          <CRow className="mb-3 g-2">
            <CCol md={6}>
              <CFormLabel>Fecha</CFormLabel>
              <CFormInput type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            </CCol>
            <CCol md={6}>
              <CFormLabel>Tipo</CFormLabel>
              <CFormSelect
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as GeneralMovementTipo })}
                required
              >
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </CFormSelect>
            </CCol>
          </CRow>
          <div className="mb-3">
            <CFormLabel>Concepto</CFormLabel>
            <CFormInput
              value={form.concepto}
              onChange={(e) => setForm({ ...form, concepto: e.target.value })}
              required
              placeholder="Ej. Venta de excedente de material, Alquiler de oficina…"
            />
          </div>
          <CRow className="mb-3 g-2">
            <CCol md={6}>
              <CFormLabel>Categoría</CFormLabel>
              <CFormInput
                list="categoria-general-suggestions"
                value={form.categoria ?? ""}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder="Escribí para buscar o elegí una sugerencia…"
              />
              <datalist id="categoria-general-suggestions">
                {COST_CENTER_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </CCol>
            <CCol md={6}>
              <CFormLabel>Monto (Gs.)</CFormLabel>
              <CFormInput
                type="number"
                min={0}
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })}
                required
              />
            </CCol>
          </CRow>
          <CRow className="mb-3 g-2">
            <CCol md={6}>
              <CFormLabel>Medio de pago</CFormLabel>
              <CFormSelect value={form.medioPago ?? ""} onChange={(e) => setForm({ ...form, medioPago: e.target.value })}>
                <option value="">Seleccioná…</option>
                {MEDIO_PAGO_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </CFormSelect>
            </CCol>
            <CCol md={6}>
              <CFormLabel>Estado</CFormLabel>
              <CFormSelect value={form.estado ?? "Pendiente"} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                {ESTADO_GENERAL_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </CFormSelect>
            </CCol>
          </CRow>
          <CRow className="mb-3 g-2">
            <CCol md={6}>
              <CFormLabel>Procesado por</CFormLabel>
              <CFormInput
                value={form.procesadoPor ?? ""}
                onChange={(e) => setForm({ ...form, procesadoPor: e.target.value })}
                placeholder="Nombre de quien gestionó/cargó este movimiento"
              />
            </CCol>
            <CCol md={6}>
              <CFormLabel>Responsable{form.tipo === "ingreso" && <span className="text-danger"> *</span>}</CFormLabel>
              <CFormInput
                list="responsable-general-suggestions"
                value={form.responsable ?? ""}
                onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                required={form.tipo === "ingreso"}
                placeholder="Quién consiguió este ingreso"
              />
              <datalist id="responsable-general-suggestions">
                {responsableSuggestions.map((r) => <option key={r} value={r} />)}
              </datalist>
              {form.tipo === "ingreso" && (
                <p className="form-hint mb-0 mt-1">Se usa para el reparto de beneficios de Personal — distinto de &quot;Procesado por&quot;.</p>
              )}
            </CCol>
          </CRow>
          <div className="mb-1">
            <CFormLabel>Notas</CFormLabel>
            <CFormTextarea rows={3} value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={onClose} disabled={saving}>Cancelar</CButton>
          <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  );
}

export default function MovimientosPage() {
  const [tab, setTab] = useState<"movimientos" | "rubros">("movimientos");
  const [movimientos, setMovimientos] = useState<MovimientoDTO[]>([]);
  const [generalMovements, setGeneralMovements] = useState<GeneralMovementDTO[]>([]);
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

  const [showGeneralForm, setShowGeneralForm] = useState(false);
  const [editingGeneral, setEditingGeneral] = useState<GeneralMovementDTO | null>(null);
  const [confirmGeneralTarget, setConfirmGeneralTarget] = useState<GeneralMovementDTO | null>(null);
  const [deletingGeneral, setDeletingGeneral] = useState(false);
  const { toast, showToast } = useToast();

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetch("/api/movimientos").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      fetch("/api/general-movements").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    ])
      .then(([mov, gen]) => { setMovimientos(mov); setGeneralMovements(gen); })
      .catch(() => setLoadError("No se pudieron cargar los movimientos."))
      .finally(() => setLoading(false));
  }, []);

  // Movimientos de obra + movimientos generales, normalizados a una sola forma — ver LedgerRow.
  const rows: LedgerRow[] = useMemo(
    () => [...movimientos.map(obraToRow), ...generalMovements.map(generalToRow)],
    [movimientos, generalMovements]
  );

  // Obras/estados presentes en los datos — evita un fetch aparte a /api/projects
  // solo para poblar el selector.
  const obraOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => { if (r.obraId && r.obraNombre) map.set(r.obraId, r.obraNombre); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const estadoOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.estado).filter(Boolean))) as string[],
    [rows]
  );
  const existingResponsables = useMemo(
    () => Array.from(new Set(generalMovements.map((g) => g.responsable).filter(Boolean))) as string[],
    [generalMovements]
  );

  // Total de volumen (obra + general), sin restar por ingreso/egreso — la
  // ganancia neta de la empresa se calcula en Inicio, no acá.
  const totalMonto = rows.reduce((sum, r) => sum + r.monto, 0);

  const visible = rows
    .filter((r) => !filterObra || r.obraId === filterObra)
    .filter((r) => !filterRubro || r.obraTipo === filterRubro)
    .filter((r) => !filterTipo || r.movTipoObra === filterTipo)
    .filter((r) => !filterEstado || r.estado === filterEstado)
    .filter((r) => {
      if (dateFrom && r.fecha < dateFrom) return false;
      if (dateTo && r.fecha > dateTo) return false;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return [r.concepto, r.obraNombre, r.categoria, r.contratistaProveedorLabel, r.procesadoPor, r.responsable, r.comprobanteTexto, r.notas]
        .some((v) => String(v ?? "").toLowerCase().includes(q));
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === "monto_desc") return b.monto - a.monto;
      if (sortBy === "monto_asc") return a.monto - b.monto;
      return sortBy === "fecha_asc" ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha);
    });

  const filtersActive = Boolean(search || filterObra || filterRubro || filterTipo || filterEstado || dateFrom || dateTo);
  function clearFilters() {
    setSearch(""); setFilterObra(""); setFilterRubro(""); setFilterTipo(""); setFilterEstado(""); setDateFrom(""); setDateTo("");
  }

  function handleGeneralSaved(saved: GeneralMovementDTO) {
    setGeneralMovements((cur) => (cur.some((g) => g.id === saved.id) ? cur.map((g) => (g.id === saved.id ? saved : g)) : [saved, ...cur]));
    setShowGeneralForm(false);
    setEditingGeneral(null);
  }

  async function deleteGeneral(g: GeneralMovementDTO) {
    setDeletingGeneral(true);
    const prev = generalMovements;
    setGeneralMovements((cur) => cur.filter((x) => x.id !== g.id));
    try {
      const res = await fetch(`/api/general-movements/${g.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setConfirmGeneralTarget(null);
    } catch {
      setGeneralMovements(prev);
      showToast("No se pudo eliminar el movimiento.");
    } finally {
      setDeletingGeneral(false);
    }
  }

  return (
    <AppShell crumbs={[{ label: "Movimientos" }]}>
      <h1 className="of-page-title">📒 Movimientos</h1>
      <p className="module-desc mb-4">
        Todos los movimientos de todas las obras y rubros, en un solo lugar. Los movimientos de obra se cargan y
        editan desde la Ejecución de la obra correspondiente; los movimientos generales (sin obra) se cargan,
        editan y eliminan acá mismo.
      </p>

      <CNav variant="underline" className="mb-4">
        <CNavItem>
          <CNavLink active={tab === "movimientos"} onClick={() => setTab("movimientos")} style={{ cursor: "pointer" }}>
            Movimientos
          </CNavLink>
        </CNavItem>
        <CNavItem>
          <CNavLink active={tab === "rubros"} onClick={() => setTab("rubros")} style={{ cursor: "pointer" }}>
            Rubros ejecutados
          </CNavLink>
        </CNavItem>
      </CNav>

      {tab === "rubros" && <RubrosEjecutadosView movimientos={movimientos} />}

      {tab === "movimientos" && (
      <CCard>
        <CCardHeader className="module-panel-head">
          <div>
            <span className="fw-semibold fs-5">Movimientos</span>
            <p className="module-desc mb-0">{rows.length} movimiento{rows.length === 1 ? "" : "s"} cargados — total {fmtMoney(totalMonto)}.</p>
          </div>
          <div className="d-flex gap-2">
            <CButton color="primary" size="sm" onClick={() => { setEditingGeneral(null); setShowGeneralForm(true); }}>
              <CIcon icon={cilPlus} className="me-1" /> Agregar movimiento general
            </CButton>
            <CButton color="secondary" variant="outline" size="sm" onClick={() => exportCSV(visible)} disabled={visible.length === 0}>
              <CIcon icon={cilCloudDownload} className="me-1" /> Exportar CSV
            </CButton>
          </div>
        </CCardHeader>
        <CCardBody>
          {loading && <p className="state-message">Cargando movimientos…</p>}
          {!loading && loadError && <p className="state-message form-error">{loadError}</p>}
          {!loading && !loadError && rows.length === 0 && <p className="empty-col">Todavía no hay movimientos cargados.</p>}

          {!loading && !loadError && rows.length > 0 && (
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
                        <CTableHeaderCell>Responsable</CTableHeaderCell>
                        <CTableHeaderCell>Comprobante</CTableHeaderCell>
                        <CTableHeaderCell>Acciones</CTableHeaderCell>
                      </CTableRow>
                    </CTableHead>
                    <CTableBody>
                      {visible.map((row) => (
                        <CTableRow key={`${row.source}-${row.id}`}>
                          <CTableDataCell className="mono">{row.fechaLabel}</CTableDataCell>
                          <CTableDataCell>
                            {row.source === "obra" ? (
                              <Link href={`/project/${row.obraId}`}>{row.obraNombre} ↗</Link>
                            ) : (
                              <span className="text-body-secondary">General (sin obra)</span>
                            )}
                          </CTableDataCell>
                          <CTableDataCell>
                            {row.source === "obra" && row.obraTipo ? (
                              <CBadge color={TYPE_COLOR[row.obraTipo]}>{TYPE_LABEL[row.obraTipo]}</CBadge>
                            ) : "—"}
                          </CTableDataCell>
                          <CTableDataCell>{row.concepto}</CTableDataCell>
                          <CTableDataCell>{row.categoria || "—"}</CTableDataCell>
                          <CTableDataCell>
                            {row.source === "obra" ? (
                              row.contratistaId ? (
                                <Link href={`/contratistas/${row.contratistaId}`}>{row.contratistaProveedorLabel || "Ver contratista"} ↗</Link>
                              ) : row.contratistaProveedorLabel ? (
                                row.contratistaProveedorLabel
                              ) : "—"
                            ) : "—"}
                          </CTableDataCell>
                          <CTableDataCell
                            className="mono"
                            style={row.source === "general" ? { color: row.ingresoEgreso === "egreso" ? "var(--crit)" : "var(--ok)" } : undefined}
                          >
                            {row.source === "general" ? `${row.ingresoEgreso === "egreso" ? "-" : "+"} ${fmtMoney(row.monto)}` : fmtMoney(row.monto)}
                          </CTableDataCell>
                          <CTableDataCell>{row.medioPago || "—"}</CTableDataCell>
                          <CTableDataCell>{row.estado && <span className={"status-chip status-generic status-" + row.estado.toLowerCase().replace(/\s+/g, "_")}>{row.estado}</span>}</CTableDataCell>
                          <CTableDataCell>{row.procesadoPor || "—"}</CTableDataCell>
                          <CTableDataCell>{row.responsable || "—"}</CTableDataCell>
                          <CTableDataCell>
                            {row.source === "obra" ? (
                              row.attachment ? (
                                <a href={`/api/attachments/${row.attachment.id}`} target="_blank" rel="noopener noreferrer">
                                  {row.attachment.mimeType.startsWith("image/") ? (
                                    <img src={`/api/attachments/${row.attachment.id}`} alt={row.attachment.filename} className="item-receipt-thumb" />
                                  ) : (
                                    <span><CIcon icon={cilDescription} size="sm" className="me-1" />{row.attachment.filename}</span>
                                  )}
                                </a>
                              ) : row.comprobanteTexto ? (
                                /^https?:\/\//i.test(row.comprobanteTexto) ? (
                                  <a href={row.comprobanteTexto} target="_blank" rel="noopener noreferrer">
                                    <img src={row.comprobanteTexto} alt="Comprobante" className="item-receipt-thumb" />
                                  </a>
                                ) : (
                                  <span>{row.comprobanteTexto}</span>
                                )
                              ) : "—"
                            ) : "—"}
                          </CTableDataCell>
                          <CTableDataCell>
                            {row.source === "general" && (
                              <div className="d-flex gap-1">
                                <CButton
                                  size="sm"
                                  color="secondary"
                                  variant="outline"
                                  title="Editar"
                                  onClick={() => { setEditingGeneral(row.raw as GeneralMovementDTO); setShowGeneralForm(true); }}
                                >
                                  <CIcon icon={cilPencil} size="sm" />
                                </CButton>
                                <CButton
                                  size="sm"
                                  color="danger"
                                  variant="outline"
                                  title="Eliminar"
                                  onClick={() => setConfirmGeneralTarget(row.raw as GeneralMovementDTO)}
                                >
                                  <CIcon icon={cilTrash} size="sm" />
                                </CButton>
                              </div>
                            )}
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
      )}

      {showGeneralForm && (
        <GeneralMovementFormModal
          editing={editingGeneral}
          existingResponsables={existingResponsables}
          onClose={() => { setShowGeneralForm(false); setEditingGeneral(null); }}
          onSaved={handleGeneralSaved}
        />
      )}
      <ConfirmDialog
        open={confirmGeneralTarget !== null}
        title="Eliminar movimiento"
        message={`¿Eliminar "${confirmGeneralTarget?.concepto}"? Esta acción no se puede deshacer.`}
        busy={deletingGeneral}
        onConfirm={() => confirmGeneralTarget && deleteGeneral(confirmGeneralTarget)}
        onCancel={() => setConfirmGeneralTarget(null)}
      />
      <Toast message={toast} />
    </AppShell>
  );
}
