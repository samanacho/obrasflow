"use client";

import { useEffect, useState } from "react";
import {
  CCard, CCardBody, CCardHeader, CButton, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea, CBadge, CAlert, CListGroup, CListGroupItem, CRow, CCol,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilPlus } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import type { ContractorDTO, ContractorHistoryDTO, ContractorHistoryInput, ProjectDTO, ProjectType } from "@/lib/types";

const RUBRO_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const RUBRO_COLOR: Record<ProjectType, string> = { civil: "info", electrico: "warning", vial: "secondary", otro: "dark" };

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function Stars({ value, size }: { value: number | null; size?: "lg" }) {
  if (value === null) return <span className="stars-empty">Sin calificar todavía</span>;
  const rounded = Math.round(value);
  return (
    <span className={"stars" + (size === "lg" ? " stars-lg" : "")}>
      {"★".repeat(rounded)}{"☆".repeat(5 - rounded)} <span className="mono stars-value">{value.toFixed(1)} / 5</span>
    </span>
  );
}

const EMPTY_HISTORY: ContractorHistoryInput = { obraNombre: "", projectId: "", rating: null, comentario: "", fecha: "" };

export default function ContractorDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const [contractor, setContractor] = useState<ContractorDTO | null>(null);
  const [history, setHistory] = useState<ContractorHistoryDTO[]>([]);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ContractorHistoryInput>(EMPTY_HISTORY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [cRes, hRes, pRes] = await Promise.all([
        fetch(`/api/contractors/${id}`),
        fetch(`/api/contractors/${id}/history`),
        fetch(`/api/projects`),
      ]);
      if (!cRes.ok) throw new Error(`HTTP ${cRes.status}`);
      setContractor(await cRes.json());
      setHistory(hRes.ok ? await hRes.json() : []);
      setProjects(pRes.ok ? await pRes.json() : []);
    } catch {
      setError("No se pudo cargar el contratista.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.obraNombre.trim()) { setFormError("El nombre de la obra es obligatorio."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/contractors/${id}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, projectId: form.projectId || null, fecha: form.fecha || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setShowForm(false);
      setForm(EMPTY_HISTORY);
      load();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <AppShell crumbs={[{ label: "Contratistas", href: "/contratistas" }]}><p className="state-message">Cargando…</p></AppShell>;
  if (error || !contractor) return <AppShell crumbs={[{ label: "Contratistas", href: "/contratistas" }]}><p className="state-message form-error">{error || "Contratista no encontrado."}</p></AppShell>;

  return (
    <AppShell crumbs={[{ label: "Contratistas", href: "/contratistas" }, { label: contractor.name }]}>
      <div className="project-hero">
        <div>
          <h1 className="of-page-title mb-2">{contractor.name}</h1>
          <div className="project-hero-meta">
            {contractor.rubros.map((r) => <CBadge key={r} color={RUBRO_COLOR[r]}>{RUBRO_LABEL[r]}</CBadge>)}
            <CBadge color={contractor.status === "activo" ? "success" : "secondary"}>{contractor.status}</CBadge>
            {contractor.city && <span>📍 {contractor.city}{contractor.province ? `, ${contractor.province}` : ""}</span>}
          </div>
        </div>
        <div className="project-hero-kpis">
          <CCard><CCardBody>
            <div className="label">Calificación promedio</div>
            <div className="value"><Stars value={contractor.avgRating} size="lg" /></div>
            <div className="sub">{contractor.historyCount} obra(s) registradas</div>
          </CCardBody></CCard>
        </div>
      </div>

      <CCard className="mb-4">
        <CCardHeader className="fw-semibold">Datos de contacto</CCardHeader>
        <CCardBody>
          <CRow className="g-3">
            <CCol md={3}><span className="module-desc">Contacto</span><div>{contractor.contactName || "—"}</div></CCol>
            <CCol md={3}><span className="module-desc">Celular</span><div>{contractor.phone || "—"}</div></CCol>
            <CCol md={3}><span className="module-desc">Email</span><div>{contractor.email || "—"}</div></CCol>
            <CCol md={3}><span className="module-desc">RUC</span><div>{contractor.ruc || "—"}</div></CCol>
          </CRow>
          {contractor.notes && <p className="item-row-notes mt-3 mb-0">{contractor.notes}</p>}
        </CCardBody>
      </CCard>

      <CCard>
        <CCardHeader className="module-panel-head">
          <div>
            <span className="fw-semibold fs-5">Historial de obras</span>
            <p className="module-desc mb-0">Cada obra trabajada junto a este contratista, con su propia calificación.</p>
          </div>
          <CButton color="primary" size="sm" onClick={() => setShowForm(true)}>
            <CIcon icon={cilPlus} className="me-1" /> Agregar obra
          </CButton>
        </CCardHeader>
        <CCardBody>
          {history.length === 0 && <p className="empty-col">Sin obras registradas todavía.</p>}
          <CListGroup>
            {history.map((h) => (
              <CListGroupItem key={h.id} className="item-row border-0 border-bottom rounded-0 px-0">
                <div className="item-row-main">
                  <span className="item-title">{h.obraNombre}</span>
                  {h.rating !== null && <span className="stars">{"★".repeat(h.rating)}{"☆".repeat(5 - h.rating)}</span>}
                </div>
                <div className="item-row-sub">{fmtDate(h.fecha)}</div>
                {h.comentario && <div className="item-row-notes">{h.comentario}</div>}
              </CListGroupItem>
            ))}
          </CListGroup>
        </CCardBody>

        {showForm && (
          <CModal visible onClose={() => setShowForm(false)} alignment="center">
            <CModalHeader><CModalTitle>Agregar obra al historial</CModalTitle></CModalHeader>
            <CForm onSubmit={handleSubmit}>
              <CModalBody>
                {formError && <CAlert color="danger">{formError}</CAlert>}
                <div className="mb-3">
                  <CFormLabel>Nombre de la obra</CFormLabel>
                  <CFormInput value={form.obraNombre} onChange={(e) => setForm({ ...form, obraNombre: e.target.value })} required />
                </div>
                <div className="mb-3">
                  <CFormLabel>Vincular a un proyecto existente (opcional)</CFormLabel>
                  <CFormSelect value={form.projectId ?? ""} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                    <option value="">— Ninguno —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </CFormSelect>
                </div>
                <CRow className="mb-3 g-2">
                  <CCol><CFormLabel>Fecha</CFormLabel><CFormInput type="date" value={form.fecha ?? ""} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></CCol>
                  <CCol>
                    <CFormLabel>Calificación (1-5)</CFormLabel>
                    <CFormSelect value={form.rating ?? ""} onChange={(e) => setForm({ ...form, rating: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Sin calificar</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
                    </CFormSelect>
                  </CCol>
                </CRow>
                <div className="mb-1">
                  <CFormLabel>Comentario</CFormLabel>
                  <CFormTextarea rows={3} value={form.comentario ?? ""} onChange={(e) => setForm({ ...form, comentario: e.target.value })} />
                </div>
              </CModalBody>
              <CModalFooter>
                <CButton color="secondary" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</CButton>
                <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
              </CModalFooter>
            </CForm>
          </CModal>
        )}
      </CCard>
    </AppShell>
  );
}
