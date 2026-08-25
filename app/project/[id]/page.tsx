"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CCard, CCardBody, CCardHeader, CNav, CNavItem, CNavLink,
  CButton, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea,
  CBadge, CAlert, CListGroup, CListGroupItem, CRow, CCol,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilPlus, cilPencil, cilTrash } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import type { ProjectDTO, ProjectItemDTO, ContractorDTO } from "@/lib/types";
import { ITEM_KINDS, ITEM_KIND_ORDER, ItemField } from "@/lib/itemKinds";
import { PUBLIC_FIELDS, PRIVATE_FIELDS } from "@/lib/sectorFields";

const TYPE_LABEL: Record<string, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const TYPE_COLOR: Record<string, string> = { civil: "info", electrico: "warning", vial: "secondary", otro: "dark" };
const STATUS_COLOR: Record<string, string> = { planificado: "info", en_curso: "warning", pausado: "secondary", finalizado: "success" };
const SECTOR_LABEL: Record<string, string> = { privado: "Obra privada", publico: "Obra pública" };

function fmtMoney(n: number) {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY");
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ProjectDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("rfi");

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

  if (loading) return <AppShell crumbs={[{ label: "Proyectos", href: "/" }]}><p className="state-message">Cargando proyecto…</p></AppShell>;
  if (error || !project) return <AppShell crumbs={[{ label: "Proyectos", href: "/" }]}><p className="state-message form-error">{error || "Proyecto no encontrado."}</p></AppShell>;

  const overBudget = project.spent > project.budget;
  const daysLeft = Math.ceil((new Date(project.end).getTime() - Date.now()) / 86400000);

  return (
    <AppShell crumbs={[{ label: "Proyectos", href: "/" }, { label: project.name }]}>
      <div className="project-hero">
        <div>
          <h1 className="of-page-title mb-2">{project.name}</h1>
          <div className="project-hero-meta">
            <CBadge color={TYPE_COLOR[project.type]}>{project.type === "otro" && project.customType ? project.customType : TYPE_LABEL[project.type]}</CBadge>
            <CBadge color={STATUS_COLOR[project.status]}>{project.status.replace("_", " ")}</CBadge>
            {project.sector && <CBadge color={project.sector === "publico" ? "dark" : "info"}>{SECTOR_LABEL[project.sector]}</CBadge>}
            <span>{project.manager}</span>
          </div>
        </div>
        <div className="project-hero-kpis">
          <CCard><CCardBody><div className="label">Presupuesto</div><div className="value mono">{fmtMoney(project.budget)}</div><div className={"sub" + (overBudget ? " alert-text" : "")}>{fmtMoney(project.spent)} ejecutado{overBudget ? " · sobre presupuesto" : ""}</div></CCardBody></CCard>
          <CCard><CCardBody><div className="label">Avance</div><div className="value mono">{project.progress}%</div><div className="sub">Estado: {project.status.replace("_", " ")}</div></CCardBody></CCard>
          <CCard><CCardBody><div className="label">Fecha fin</div><div className="value mono">{project.end.split("-").reverse().join("/")}</div><div className={"sub" + (daysLeft < 7 ? " alert-text" : "")}>{daysLeft < 0 ? `Vencido hace ${Math.abs(daysLeft)}d` : `${daysLeft} días restantes`}</div></CCardBody></CCard>
        </div>
      </div>

      {project.sector && project.sectorData && Object.values(project.sectorData).some(Boolean) && (
        <CCard className="mb-4">
          <CCardHeader className="fw-semibold">{SECTOR_LABEL[project.sector]} — datos adicionales</CCardHeader>
          <CCardBody>
            <CRow className="g-3">
              {(project.sector === "publico" ? PUBLIC_FIELDS : PRIVATE_FIELDS)
                .filter((f) => project.sectorData?.[f.key])
                .map((f) => (
                  <CCol md={4} key={f.key}>
                    <span className="module-desc">{f.label}</span>
                    <div>{f.type === "number" ? fmtMoney(Number(project.sectorData?.[f.key])) : String(project.sectorData?.[f.key])}</div>
                  </CCol>
                ))}
            </CRow>
          </CCardBody>
        </CCard>
      )}

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

      <ModuleView key={tab} projectId={id} kind={tab} />
    </AppShell>
  );
}

function ModuleView({ projectId, kind }: { projectId: string; kind: string }) {
  const cfg = ITEM_KINDS[kind];
  const [items, setItems] = useState<ProjectItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProjectItemDTO | null>(null);

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

  async function handleDelete(item: ProjectItemDTO) {
    if (!confirm(`¿Eliminar "${item.title}"?`)) return;
    const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) setItems((cur) => cur.filter((i) => i.id !== item.id));
  }

  return (
    <CCard>
      <CCardHeader className="module-panel-head">
        <div>
          <span className="fw-semibold fs-5">{cfg.icon} {cfg.label}</span>
          <p className="module-desc mb-0">{cfg.description}</p>
        </div>
        {!cfg.readOnly && (
          <CButton color="primary" size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
            <CIcon icon={cilPlus} className="me-1" /> Agregar {cfg.singular}
          </CButton>
        )}
      </CCardHeader>
      <CCardBody>
        {loading && <p className="empty-col">Cargando…</p>}
        {!loading && items.length === 0 && <p className="empty-col">Sin registros todavía.</p>}

        <CListGroup>
          {items.map((item) => (
            <CListGroupItem key={item.id} className="item-row border-0 border-bottom rounded-0 px-0">
              <div className="item-row-main">
                <span className="item-title">{item.title}</span>
                {item.status && <span className={"status-chip status-generic status-" + item.status.toLowerCase().replace(/\s+/g, "_")}>{item.status}</span>}
              </div>
              <div className="item-row-sub">
                {cfg.summary(item.data)}{cfg.summary(item.data) ? " · " : ""}{fmtDateTime(item.createdAt)}
              </div>
              {item.data?.notas && <div className="item-row-notes">{item.data.notas}</div>}
              {item.data?.respuesta && <div className="item-row-notes">↳ {item.data.respuesta}</div>}
              {item.data?.motivo && <div className="item-row-notes">{item.data.motivo}</div>}
              {!cfg.readOnly && (
                <div className="item-row-actions">
                  <CButton size="sm" color="secondary" variant="outline" onClick={() => { setEditing(item); setShowForm(true); }}><CIcon icon={cilPencil} size="sm" /></CButton>
                  <CButton size="sm" color="danger" variant="outline" onClick={() => handleDelete(item)}><CIcon icon={cilTrash} size="sm" /></CButton>
                </div>
              )}
            </CListGroupItem>
          ))}
        </CListGroup>
      </CCardBody>

      {showForm && (
        <ItemFormModal
          projectId={projectId}
          kind={kind}
          existing={editing}
          onClose={() => setShowForm(false)}
          onSaved={(saved) => {
            setShowForm(false);
            setItems((cur) => {
              const idx = cur.findIndex((i) => i.id === saved.id);
              if (idx > -1) { const next = [...cur]; next[idx] = saved; return next; }
              return [saved, ...cur];
            });
          }}
        />
      )}
    </CCard>
  );
}

function ItemFormModal({
  projectId, kind, existing, onClose, onSaved,
}: {
  projectId: string;
  kind: string;
  existing: ProjectItemDTO | null;
  onClose: () => void;
  onSaved: (item: ProjectItemDTO) => void;
}) {
  const cfg = ITEM_KINDS[kind];
  const [title, setTitle] = useState(existing?.title ?? "");
  const [status, setStatus] = useState(existing?.status ?? cfg.defaultStatus ?? "");
  const [data, setData] = useState<Record<string, any>>(existing?.data ?? {});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [contractors, setContractors] = useState<ContractorDTO[]>([]);

  useEffect(() => {
    if (!cfg.fields.some((f) => f.type === "contractor")) return;
    fetch("/api/contractors?status=activo")
      .then((r) => (r.ok ? r.json() : []))
      .then(setContractors)
      .catch(() => setContractors([]));
  }, []);

  function setField(key: string, value: string) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function setContractorField(key: string, contractorId: string) {
    const chosen = contractors.find((c) => c.id === contractorId);
    setData((d) => ({ ...d, [key]: contractorId, [key + "Nombre"]: chosen?.name ?? "" }));
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
      onSaved(await res.json());
    } catch (err: any) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CModal visible onClose={onClose} alignment="center">
      <CModalHeader>
        <CModalTitle>{existing ? "Editar" : "Nuevo"} {cfg.singular}</CModalTitle>
      </CModalHeader>
      <CForm onSubmit={handleSubmit}>
        <CModalBody>
          {error && <CAlert color="danger">{error}</CAlert>}
          <div className="mb-3">
            <CFormLabel>{cfg.titleLabel}</CFormLabel>
            <CFormInput value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          {cfg.statusOptions && (
            <div className="mb-3">
              <CFormLabel>Estado</CFormLabel>
              <CFormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {cfg.statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </CFormSelect>
            </div>
          )}
          {cfg.fields.map((f: ItemField) => (
            <div className="mb-3" key={f.key}>
              <CFormLabel>{f.label}</CFormLabel>
              {f.type === "textarea" ? (
                <CFormTextarea rows={3} value={data[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} required={f.required} />
              ) : f.type === "contractor" ? (
                <CFormSelect value={data[f.key] ?? ""} onChange={(e) => setContractorField(f.key, e.target.value)} required={f.required}>
                  <option value="">Seleccioná un contratista…</option>
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ""}</option>
                  ))}
                </CFormSelect>
              ) : (
                <CFormInput type={f.type} value={data[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} required={f.required} placeholder={f.placeholder} />
              )}
            </div>
          ))}
          {cfg.fields.some((f) => f.type === "contractor") && contractors.length === 0 && (
            <p className="form-hint">No hay contratistas activos todavía. <Link href="/contratistas">Cargá uno en el directorio</Link> primero.</p>
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
