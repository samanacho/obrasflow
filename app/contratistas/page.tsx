"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import type { ContractorDTO, ContractorInput, ProjectType, ContractorStatus } from "@/lib/types";

const RUBRO_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const RUBRO_COLOR: Record<ProjectType, string> = { civil: "info", electrico: "warning", vial: "secondary", otro: "dark" };
const RUBROS: ProjectType[] = ["civil", "electrico", "vial", "otro"];

const EMPTY_FORM: ContractorInput = {
  name: "", ruc: "", contactName: "", phone: "", email: "", city: "", department: "", rating: null, rubros: [], status: "activo", notes: "",
};

function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="stars-empty">Sin calificar</span>;
  const rounded = Math.round(value);
  return (
    <span className="stars" title={`${value.toFixed(1)} / 5`}>
      {"★".repeat(rounded)}{"☆".repeat(5 - rounded)} <span className="mono stars-value">{value.toFixed(1)}</span>
    </span>
  );
}

export default function ContratistasPage() {
  const [contractors, setContractors] = useState<ContractorDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rubroFilter, setRubroFilter] = useState<ProjectType | "">("");
  const [statusFilter, setStatusFilter] = useState<ContractorStatus | "">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ContractorDTO | null>(null);
  const [form, setForm] = useState<ContractorInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ContractorDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast, showToast } = useToast();

  // Autocompletado de Ciudad + Departamento a partir de lo ya cargado: no
  // hay una tabla "oficial" ciudad→departamento acá adentro (mismo criterio
  // que las clases ANDE o el centro de costos de Ejecución — no inventar
  // un catálogo que puede estar mal) — en cambio, aprende de los propios
  // contratistas ya guardados. Si la misma ciudad se cargó más de una vez
  // con departamentos distintos, gana el último que aparece en `contractors`.
  const cityDepartmentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contractors) {
      if (c.city && c.department) map.set(c.city.trim().toLowerCase(), c.department);
    }
    return map;
  }, [contractors]);
  const knownCities = useMemo(
    () => Array.from(new Set(contractors.filter((c) => c.city).map((c) => (c.city as string).trim()))).sort(),
    [contractors]
  );

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (rubroFilter) params.set("rubro", rubroFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("q", search);
      const res = await fetch(`/api/contractors?${params.toString()}`);
      setContractors(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search, rubroFilter, statusFilter]);

  function openModal(c: ContractorDTO | null) {
    setFormError(null);
    setEditing(c);
    setForm(
      c
        ? { name: c.name, ruc: c.ruc ?? "", contactName: c.contactName ?? "", phone: c.phone ?? "", email: c.email ?? "", city: c.city ?? "", department: c.department ?? "", rating: c.rating, rubros: c.rubros, status: c.status, notes: c.notes ?? "" }
        : EMPTY_FORM
    );
    setModalOpen(true);
  }

  function toggleRubro(r: ProjectType) {
    setForm((f) => ({ ...f, rubros: f.rubros.includes(r) ? f.rubros.filter((x) => x !== r) : [...f.rubros, r] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("El nombre es obligatorio."); return; }
    if (form.rubros.length === 0) { setFormError("Elegí al menos un rubro."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const url = editing ? `/api/contractors/${editing.id}` : "/api/contractors";
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

  async function deleteContractor(c: ContractorDTO) {
    setDeleting(true);
    const prev = contractors;
    setContractors((cur) => cur.filter((x) => x.id !== c.id));
    try {
      const res = await fetch(`/api/contractors/${c.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setConfirmTarget(null);
    } catch {
      setContractors(prev);
      showToast("No se pudo eliminar el contratista.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell
      crumbs={[{ label: "Contratistas" }]}
      headerActions={
        <CButton color="primary" size="sm" onClick={() => openModal(null)}>
          <CIcon icon={cilPlus} className="me-1" /> Nuevo contratista
        </CButton>
      }
    >
      <h1 className="of-page-title">🧰 Directorio de contratistas</h1>
      <p className="module-desc mb-4">Todas las obras, todos los rubros — comparalos antes de contratar.</p>

      <CRow className="g-2 mb-4">
        <CCol md={6}><CFormInput placeholder="Buscar por nombre o contacto…" value={search} onChange={(e) => setSearch(e.target.value)} /></CCol>
        <CCol md={3}>
          <CFormSelect value={rubroFilter} onChange={(e) => setRubroFilter(e.target.value as ProjectType | "")}>
            <option value="">Todos los rubros</option>
            {RUBROS.map((r) => <option key={r} value={r}>{RUBRO_LABEL[r]}</option>)}
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

      {loading && <p className="state-message">Cargando contratistas…</p>}
      {!loading && contractors.length === 0 && <p className="empty-col">Sin contratistas todavía. Agregá el primero con &quot;+ Nuevo contratista&quot;.</p>}

      <CRow className="g-3">
        {contractors.map((c) => (
          <CCol md={4} key={c.id}>
            <CCard className="h-100">
              <CCardBody className="d-flex flex-column gap-2">
                <div className="d-flex justify-content-between align-items-start">
                  <Link href={`/contratistas/${c.id}`} className="contractor-name">{c.name}</Link>
                  <div className="d-flex gap-1 flex-wrap justify-content-end">
                    {c.rubros.map((r) => <CBadge key={r} color={RUBRO_COLOR[r]}>{RUBRO_LABEL[r]}</CBadge>)}
                    <CBadge color={c.status === "activo" ? "success" : "secondary"}>{c.status}</CBadge>
                  </div>
                </div>
                {c.contactName && (
                  <div className="text-body-secondary small">
                    <CIcon icon={cilUser} size="sm" className="me-1" />{c.contactName}
                  </div>
                )}
                <div className="contractor-meta">
                  {c.city && <span><CIcon icon={cilLocationPin} size="sm" className="me-1" />{c.city}{c.department ? `, ${c.department}` : ""}</span>}
                  {c.phone && <span><CIcon icon={cilPhone} size="sm" className="me-1" />{c.phone}</span>}
                </div>
                <Stars value={c.rating ?? c.avgRating} />
                <div className="d-flex gap-2 mt-1">
                  <Link href={`/contratistas/${c.id}`} className="btn btn-sm btn-outline-secondary">Ver ficha</Link>
                  <CButton size="sm" color="secondary" variant="outline" onClick={() => openModal(c)}>Editar</CButton>
                  <CButton size="sm" color="danger" variant="outline" onClick={() => setConfirmTarget(c)}>Eliminar</CButton>
                </div>
              </CCardBody>
            </CCard>
          </CCol>
        ))}
      </CRow>

      <CModal visible={modalOpen} onClose={() => setModalOpen(false)} alignment="center" size="lg">
        <CModalHeader><CModalTitle>{editing ? "Editar" : "Nuevo"} contratista</CModalTitle></CModalHeader>
        <CForm onSubmit={handleSubmit}>
          <CModalBody>
            {formError && <CAlert color="danger">{formError}</CAlert>}
            <div className="mb-3">
              <CFormLabel>Nombre / razón social</CFormLabel>
              <CFormInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="mb-3">
              <CFormLabel>Rubros</CFormLabel>
              <div className="d-flex gap-3">
                {RUBROS.map((r) => (
                  <CFormCheck key={r} id={`rubro-${r}`} label={RUBRO_LABEL[r]} checked={form.rubros.includes(r)} onChange={() => toggleRubro(r)} />
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
                    // Si la ciudad coincide con una ya cargada antes, el
                    // departamento se actualiza solo al que se guardó esa
                    // vez — igual se puede corregir a mano después.
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
            <div className="mb-3">
              <CFormLabel>Calificación (1-5)</CFormLabel>
              <CFormSelect value={form.rating ?? ""} onChange={(e) => setForm({ ...form, rating: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Sin calificar</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
              </CFormSelect>
              <div className="form-hint mb-0">Calificación general del contratista — distinta de las que se cargan por obra en su ficha.</div>
            </div>
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
        title="Eliminar contratista"
        message={`¿Eliminar "${confirmTarget?.name}"? Esta acción también borra su historial de calificaciones y no se puede deshacer.`}
        busy={deleting}
        onConfirm={() => confirmTarget && deleteContractor(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
      <Toast message={toast} />
    </AppShell>
  );
}
