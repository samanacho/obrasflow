"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CCard, CCardBody, CButton, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea,
  CBadge, CAlert, CRow, CCol,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilPlus, cilBriefcase, cilCalendar, cilUser, cilCloudDownload } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import type { ToolDTO, ToolInput, ToolStatus, SupplierDTO } from "@/lib/types";

const ESTADO_LABEL: Record<ToolStatus, string> = {
  disponible: "Disponible",
  en_uso: "En uso",
  en_reparacion: "En reparación",
  de_baja: "De baja",
};
const ESTADO_COLOR: Record<ToolStatus, string> = {
  disponible: "success",
  en_uso: "warning",
  en_reparacion: "danger",
  de_baja: "secondary",
};
const ESTADOS: ToolStatus[] = ["disponible", "en_uso", "en_reparacion", "de_baja"];

// Sugerencias de categoría — texto libre con datalist (no un catálogo
// cerrado), mismo criterio que COST_CENTER_SUGGESTIONS de lib/itemKinds.ts:
// cada empresa clasifica sus herramientas distinto, esto es solo para
// autocompletar más rápido.
const TOOL_CATEGORY_SUGGESTIONS = [
  "Eléctrica", "Manual", "Medición", "Seguridad", "Corte", "Elevación", "Andamiaje", "Soldadura", "Jardinería", "Otro",
];

function fmtMoney(n: number) {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY");
}
function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

const EMPTY_FORM: ToolInput = {
  nombre: "", categoria: "", marcaModelo: "", cantidad: 1, estado: "disponible",
  costoUnitarioGs: null, proveedorId: "", fechaAdquisicion: "", responsable: "", notas: "",
};

export default function InventarioPage() {
  const [tools, setTools] = useState<ToolDTO[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<ToolStatus | "">("");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ToolDTO | null>(null);
  const [form, setForm] = useState<ToolInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ToolDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast, showToast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (estadoFilter) params.set("estado", estadoFilter);
      if (categoriaFilter) params.set("categoria", categoriaFilter);
      if (search) params.set("q", search);
      const res = await fetch(`/api/tools?${params.toString()}`);
      setTools(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search, estadoFilter, categoriaFilter]);

  useEffect(() => {
    fetch("/api/suppliers?status=activo")
      .then((r) => (r.ok ? r.json() : []))
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, []);

  // Categorías ya usadas entre las herramientas cargadas — para el filtro
  // (a diferencia del datalist del formulario, que ofrece sugerencias fijas
  // aparte de lo que ya se haya cargado).
  const knownCategorias = useMemo(
    () => Array.from(new Set(tools.filter((t) => t.categoria).map((t) => t.categoria as string))).sort(),
    [tools]
  );

  function openModal(t: ToolDTO | null) {
    setFormError(null);
    setEditing(t);
    setForm(
      t
        ? {
            nombre: t.nombre, categoria: t.categoria ?? "", marcaModelo: t.marcaModelo ?? "", cantidad: t.cantidad,
            estado: t.estado, costoUnitarioGs: t.costoUnitarioGs, proveedorId: t.proveedorId ?? "",
            fechaAdquisicion: t.fechaAdquisicion ?? "", responsable: t.responsable ?? "", notas: t.notas ?? "",
          }
        : EMPTY_FORM
    );
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) { setFormError("El nombre es obligatorio."); return; }
    if (!Number.isFinite(form.cantidad) || form.cantidad < 1) { setFormError("La cantidad tiene que ser al menos 1."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const url = editing ? `/api/tools/${editing.id}` : "/api/tools";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTool(t: ToolDTO) {
    setDeleting(true);
    const prev = tools;
    setTools((cur) => cur.filter((x) => x.id !== t.id));
    try {
      const res = await fetch(`/api/tools/${t.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setConfirmTarget(null);
    } catch {
      setTools(prev);
      showToast("No se pudo eliminar la herramienta.");
    } finally {
      setDeleting(false);
    }
  }

  const totalCosto = Number(form.costoUnitarioGs ?? 0) * Number(form.cantidad || 0);

  return (
    <AppShell
      crumbs={[{ label: "Inventario" }]}
      headerActions={
        <CButton color="primary" size="sm" onClick={() => openModal(null)}>
          <CIcon icon={cilPlus} className="me-1" /> Nueva herramienta
        </CButton>
      }
    >
      <h1 className="of-page-title">🧰 Inventario de herramientas</h1>
      <p className="module-desc mb-4">
        Herramientas y equipos de la empresa. Al cargar una con costo unitario, se genera (o actualiza) automáticamente
        un <Link href="/movimientos">movimiento general</Link> por ese gasto, que ya se descuenta de &quot;Costos vs. beneficios&quot; en Inicio.
      </p>

      <CRow className="g-2 mb-4">
        <CCol md={6}><CFormInput placeholder="Buscar por nombre, marca o responsable…" value={search} onChange={(e) => setSearch(e.target.value)} /></CCol>
        <CCol md={3}>
          <CFormSelect value={categoriaFilter} onChange={(e) => setCategoriaFilter(e.target.value)}>
            <option value="">Todas las categorías</option>
            {knownCategorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </CFormSelect>
        </CCol>
        <CCol md={3}>
          <CFormSelect value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value as ToolStatus | "")}>
            <option value="">Todos los estados</option>
            {ESTADOS.map((s) => <option key={s} value={s}>{ESTADO_LABEL[s]}</option>)}
          </CFormSelect>
        </CCol>
      </CRow>

      {loading && <p className="state-message">Cargando inventario…</p>}
      {!loading && tools.length === 0 && <p className="empty-col">Sin herramientas todavía. Agregá la primera con &quot;+ Nueva herramienta&quot;.</p>}

      <CRow className="g-3">
        {tools.map((t) => (
          <CCol md={4} key={t.id}>
            <CCard className="h-100">
              <CCardBody className="d-flex flex-column gap-2">
                <div className="d-flex justify-content-between align-items-start">
                  <span className="fw-semibold">{t.nombre}</span>
                  <div className="d-flex gap-1 flex-wrap justify-content-end">
                    {t.categoria && <CBadge color="info">{t.categoria}</CBadge>}
                    <CBadge color={ESTADO_COLOR[t.estado]}>{ESTADO_LABEL[t.estado]}</CBadge>
                  </div>
                </div>
                {t.marcaModelo && <div className="text-body-secondary small">{t.marcaModelo}</div>}
                <div className="contractor-meta">
                  <span>{t.cantidad} unidad{t.cantidad === 1 ? "" : "es"}</span>
                  {t.costoUnitarioGs != null && (
                    <span className="mono">{fmtMoney(t.costoUnitarioGs)} c/u · Total {fmtMoney(t.costoUnitarioGs * t.cantidad)}</span>
                  )}
                </div>
                <div className="contractor-meta">
                  {t.proveedorNombre && <span><CIcon icon={cilBriefcase} size="sm" className="me-1" />{t.proveedorNombre}</span>}
                  {t.fechaAdquisicion && <span><CIcon icon={cilCalendar} size="sm" className="me-1" />{fmtDate(t.fechaAdquisicion)}</span>}
                  {t.responsable && <span><CIcon icon={cilUser} size="sm" className="me-1" />{t.responsable}</span>}
                </div>
                {t.generalMovementId && (
                  <div className="item-row-sub">
                    <CIcon icon={cilCloudDownload} size="sm" className="me-1" />
                    <Link href="/movimientos">Ver movimiento generado ↗</Link>
                  </div>
                )}
                <div className="d-flex gap-2 mt-1">
                  <CButton size="sm" color="secondary" variant="outline" onClick={() => openModal(t)}>Editar</CButton>
                  <CButton size="sm" color="danger" variant="outline" onClick={() => setConfirmTarget(t)}>Eliminar</CButton>
                </div>
              </CCardBody>
            </CCard>
          </CCol>
        ))}
      </CRow>

      <CModal visible={modalOpen} onClose={() => setModalOpen(false)} alignment="center" size="lg">
        <CModalHeader><CModalTitle>{editing ? "Editar" : "Nueva"} herramienta</CModalTitle></CModalHeader>
        <CForm onSubmit={handleSubmit}>
          <CModalBody>
            {formError && <CAlert color="danger">{formError}</CAlert>}
            <div className="mb-3">
              <CFormLabel>Nombre</CFormLabel>
              <CFormInput value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required placeholder="Ej. Taladro percutor, Escalera de tijera…" />
            </div>
            <CRow className="mb-3 g-2">
              <CCol>
                <CFormLabel>Categoría</CFormLabel>
                <CFormInput
                  list="tool-category-suggestions"
                  value={form.categoria ?? ""}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  placeholder="Escribí para buscar o elegí una sugerencia…"
                />
                <datalist id="tool-category-suggestions">
                  {TOOL_CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
                </datalist>
              </CCol>
              <CCol>
                <CFormLabel>Marca / modelo</CFormLabel>
                <CFormInput value={form.marcaModelo ?? ""} onChange={(e) => setForm({ ...form, marcaModelo: e.target.value })} />
              </CCol>
            </CRow>
            <CRow className="mb-3 g-2">
              <CCol>
                <CFormLabel>Cantidad</CFormLabel>
                <CFormInput type="number" min={1} step={1} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })} required />
              </CCol>
              <CCol>
                <CFormLabel>Estado</CFormLabel>
                <CFormSelect value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as ToolStatus })}>
                  {ESTADOS.map((s) => <option key={s} value={s}>{ESTADO_LABEL[s]}</option>)}
                </CFormSelect>
              </CCol>
            </CRow>
            <CRow className="mb-1 g-2">
              <CCol>
                <CFormLabel>Costo unitario (Gs.)</CFormLabel>
                <CFormInput
                  type="number" min={0}
                  value={form.costoUnitarioGs ?? ""}
                  onChange={(e) => setForm({ ...form, costoUnitarioGs: e.target.value === "" ? null : Number(e.target.value) })}
                  placeholder="Opcional"
                />
              </CCol>
              <CCol>
                <CFormLabel>Fecha de adquisición</CFormLabel>
                <CFormInput type="date" value={form.fechaAdquisicion ?? ""} onChange={(e) => setForm({ ...form, fechaAdquisicion: e.target.value })} />
              </CCol>
            </CRow>
            <p className="form-hint mb-3">
              {totalCosto > 0
                ? `Total: ${fmtMoney(totalCosto)} — se generará/actualizará un movimiento general (egreso) por este monto.`
                : "Si cargás un costo unitario, se genera automáticamente un movimiento general (egreso) por cantidad × costo, visible en Movimientos."}
            </p>
            <div className="mb-3">
              <CFormLabel>Proveedor (opcional)</CFormLabel>
              <CFormSelect value={form.proveedorId ?? ""} onChange={(e) => setForm({ ...form, proveedorId: e.target.value })}>
                <option value="">Seleccioná un proveedor…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ""}</option>)}
              </CFormSelect>
              {suppliers.length === 0 && (
                <p className="form-hint mb-0 mt-1">No hay proveedores activos todavía. <Link href="/proveedores">Cargá uno en el directorio</Link> primero.</p>
              )}
            </div>
            <div className="mb-3">
              <CFormLabel>Responsable / ubicación</CFormLabel>
              <CFormInput
                value={form.responsable ?? ""}
                onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                placeholder="Quién la tiene o dónde está guardada"
              />
            </div>
            <div className="mb-1">
              <CFormLabel>Notas</CFormLabel>
              <CFormTextarea rows={3} value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</CButton>
            <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
          </CModalFooter>
        </CForm>
      </CModal>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Eliminar herramienta"
        message={`¿Eliminar "${confirmTarget?.nombre}"? ${confirmTarget?.generalMovementId ? "También se elimina el movimiento general que generó. " : ""}Esta acción no se puede deshacer.`}
        busy={deleting}
        onConfirm={() => confirmTarget && deleteTool(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
      <Toast message={toast} />
    </AppShell>
  );
}
