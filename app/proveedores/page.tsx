"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CCard, CCardBody, CButton, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea, CFormCheck,
  CBadge, CAlert, CRow, CCol,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilPlus, cilLocationPin, cilPhone, cilUser } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import { PARAGUAY_DEPARTMENTS } from "@/lib/departments";
import type { SupplierDTO, SupplierInput, SupplierCategory, ContractorStatus } from "@/lib/types";

const CATEGORY_LABEL: Record<SupplierCategory, string> = { materiales: "Materiales", servicios: "Servicios" };
const CATEGORY_COLOR: Record<SupplierCategory, string> = { materiales: "info", servicios: "warning" };
const CATEGORIES: SupplierCategory[] = ["materiales", "servicios"];

const EMPTY_FORM: SupplierInput = {
  name: "", ruc: "", contactName: "", phone: "", email: "", city: "", department: "", categories: [], status: "activo", notes: "",
};

export default function ProveedoresPage() {
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<SupplierCategory | "">("");
  const [statusFilter, setStatusFilter] = useState<ContractorStatus | "">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierDTO | null>(null);
  const [form, setForm] = useState<SupplierInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<SupplierDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast, showToast } = useToast();

  const cityDepartmentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suppliers) {
      if (s.city && s.department) map.set(s.city.trim().toLowerCase(), s.department);
    }
    return map;
  }, [suppliers]);
  const knownCities = useMemo(
    () => Array.from(new Set(suppliers.filter((s) => s.city).map((s) => (s.city as string).trim()))).sort(),
    [suppliers]
  );

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("q", search);
      const res = await fetch(`/api/suppliers?${params.toString()}`);
      setSuppliers(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search, categoryFilter, statusFilter]);

  function openModal(s: SupplierDTO | null) {
    setFormError(null);
    setEditing(s);
    setForm(
      s
        ? { name: s.name, ruc: s.ruc ?? "", contactName: s.contactName ?? "", phone: s.phone ?? "", email: s.email ?? "", city: s.city ?? "", department: s.department ?? "", categories: s.categories, status: s.status, notes: s.notes ?? "" }
        : EMPTY_FORM
    );
    setModalOpen(true);
  }

  function toggleCategory(c: SupplierCategory) {
    setForm((f) => ({ ...f, categories: f.categories.includes(c) ? f.categories.filter((x) => x !== c) : [...f.categories, c] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("El nombre es obligatorio."); return; }
    if (form.categories.length === 0) { setFormError("Elegí al menos una categoría (materiales y/o servicios)."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const url = editing ? `/api/suppliers/${editing.id}` : "/api/suppliers";
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

  async function deleteSupplier(s: SupplierDTO) {
    setDeleting(true);
    const prev = suppliers;
    setSuppliers((cur) => cur.filter((x) => x.id !== s.id));
    try {
      const res = await fetch(`/api/suppliers/${s.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setConfirmTarget(null);
    } catch {
      setSuppliers(prev);
      showToast("No se pudo eliminar el proveedor.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell
      crumbs={[{ label: "Proveedores" }]}
      headerActions={
        <CButton color="primary" size="sm" onClick={() => openModal(null)}>
          <CIcon icon={cilPlus} className="me-1" /> Nuevo proveedor
        </CButton>
      }
    >
      <h1 className="of-page-title">🚚 Directorio de proveedores</h1>
      <p className="module-desc mb-4">Proveedores de materiales y servicios para todas las obras.</p>

      <CRow className="g-2 mb-4">
        <CCol md={6}><CFormInput placeholder="Buscar por nombre o contacto…" value={search} onChange={(e) => setSearch(e.target.value)} /></CCol>
        <CCol md={3}>
          <CFormSelect value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as SupplierCategory | "")}>
            <option value="">Todas las categorías</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </CFormSelect>
        </CCol>
        <CCol md={3}>
          <CFormSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ContractorStatus | "")}>
            <option value="">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </CFormSelect>
        </CCol>
      </CRow>

      {loading && <p className="state-message">Cargando proveedores…</p>}
      {!loading && suppliers.length === 0 && <p className="empty-col">Sin proveedores todavía. Agregá el primero con &quot;+ Nuevo proveedor&quot;.</p>}

      <CRow className="g-3">
        {suppliers.map((s) => (
          <CCol md={4} key={s.id}>
            <CCard className="h-100">
              <CCardBody className="d-flex flex-column gap-2">
                <div className="d-flex justify-content-between align-items-start">
                  <span className="fw-semibold">{s.name}</span>
                  <div className="d-flex gap-1 flex-wrap justify-content-end">
                    {s.categories.map((c) => <CBadge key={c} color={CATEGORY_COLOR[c]}>{CATEGORY_LABEL[c]}</CBadge>)}
                    <CBadge color={s.status === "activo" ? "success" : "secondary"}>{s.status}</CBadge>
                  </div>
                </div>
                {s.contactName && (
                  <div className="text-body-secondary small">
                    <CIcon icon={cilUser} size="sm" className="me-1" />{s.contactName}
                  </div>
                )}
                <div className="contractor-meta">
                  {s.city && <span><CIcon icon={cilLocationPin} size="sm" className="me-1" />{s.city}{s.department ? `, ${s.department}` : ""}</span>}
                  {s.phone && <span><CIcon icon={cilPhone} size="sm" className="me-1" />{s.phone}</span>}
                </div>
                <div className="d-flex gap-2 mt-1">
                  <CButton size="sm" color="secondary" variant="outline" onClick={() => openModal(s)}>Editar</CButton>
                  <CButton size="sm" color="danger" variant="outline" onClick={() => setConfirmTarget(s)}>Eliminar</CButton>
                </div>
              </CCardBody>
            </CCard>
          </CCol>
        ))}
      </CRow>

      <CModal visible={modalOpen} onClose={() => setModalOpen(false)} alignment="center" size="lg">
        <CModalHeader><CModalTitle>{editing ? "Editar" : "Nuevo"} proveedor</CModalTitle></CModalHeader>
        <CForm onSubmit={handleSubmit}>
          <CModalBody>
            {formError && <CAlert color="danger">{formError}</CAlert>}
            <div className="mb-3">
              <CFormLabel>Nombre / razón social</CFormLabel>
              <CFormInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="mb-3">
              <CFormLabel>Categorías</CFormLabel>
              <div className="d-flex gap-3">
                {CATEGORIES.map((c) => (
                  <CFormCheck key={c} id={`category-${c}`} label={CATEGORY_LABEL[c]} checked={form.categories.includes(c)} onChange={() => toggleCategory(c)} />
                ))}
              </div>
            </div>
            <CRow className="mb-3 g-2">
              <CCol>
                <CFormLabel>Ciudad</CFormLabel>
                <CFormInput
                  list="known-cities"
                  value={form.city ?? ""}
                  onChange={(e) => {
                    const city = e.target.value;
                    const matched = cityDepartmentMap.get(city.trim().toLowerCase());
                    setForm({ ...form, city, department: matched ?? form.department });
                  }}
                />
                <datalist id="known-cities">
                  {knownCities.map((c) => <option key={c} value={c} />)}
                </datalist>
              </CCol>
              <CCol>
                <CFormLabel>Departamento</CFormLabel>
                <CFormSelect value={form.department ?? ""} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                  <option value="">Seleccioná…</option>
                  {PARAGUAY_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </CFormSelect>
              </CCol>
            </CRow>
            <CRow className="mb-3 g-2">
              <CCol><CFormLabel>Celular</CFormLabel><CFormInput value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></CCol>
              <CCol><CFormLabel>Email</CFormLabel><CFormInput type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></CCol>
            </CRow>
            <CRow className="mb-3 g-2">
              <CCol><CFormLabel>Nombre de contacto</CFormLabel><CFormInput value={form.contactName ?? ""} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></CCol>
              <CCol><CFormLabel>RUC</CFormLabel><CFormInput value={form.ruc ?? ""} onChange={(e) => setForm({ ...form, ruc: e.target.value })} /></CCol>
            </CRow>
            <div className="mb-3">
              <CFormLabel>Estado</CFormLabel>
              <CFormSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ContractorStatus })}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </CFormSelect>
            </div>
            <div className="mb-1">
              <CFormLabel>Notas</CFormLabel>
              <CFormTextarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
        title="Eliminar proveedor"
        message={`¿Eliminar "${confirmTarget?.name}"? Esta acción no se puede deshacer.`}
        busy={deleting}
        onConfirm={() => confirmTarget && deleteSupplier(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
      <Toast message={toast} />
    </AppShell>
  );
}
