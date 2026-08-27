"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CCard, CCardBody, CCardHeader, CNav, CNavItem, CNavLink,
  CButton, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea,
  CBadge, CAlert, CListGroup, CListGroupItem, CRow, CCol,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilPlus, cilPencil, cilTrash } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import NewProjectWizard from "@/components/NewProjectWizard";
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
  const router = useRouter();
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("rfi");
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function handleDelete() {
    if (!project) return;
    if (!confirm(`¿Eliminar "${project.name}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      router.push(`/rubros/${project.type}`);
    } catch {
      setDeleting(false);
      alert("No se pudo eliminar el proyecto.");
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
          <CButton color="danger" variant="outline" size="sm" onClick={handleDelete} disabled={deleting}>
            <CIcon icon={cilTrash} className="me-1" /> {deleting ? "Eliminando…" : "Eliminar"}
          </CButton>
        </>
      }
    >
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

      {project.sector &&
        project.sectorData &&
        Object.values(project.sectorData).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v))) && (
        <CCard className="mb-4">
          <CCardHeader className="fw-semibold">{SECTOR_LABEL[project.sector]} — datos adicionales</CCardHeader>
          <CCardBody>
            <CRow className="g-3">
              {(project.sector === "publico" ? PUBLIC_FIELDS : PRIVATE_FIELDS)
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

      <ModuleView key={tab} projectId={id} kind={tab} project={project} onProjectChanged={refreshProject} />

      <NewProjectWizard
        visible={editOpen}
        editingProject={project}
        onClose={() => setEditOpen(false)}
        onSaved={handleSaved}
      />
    </AppShell>
  );
}

function ModuleView({
  projectId, kind, project, onProjectChanged,
}: {
  projectId: string;
  kind: string;
  project: ProjectDTO;
  onProjectChanged: () => void;
}) {
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

  async function handleDelete(item: ProjectItemDTO) {
    if (!confirm(`¿Eliminar "${item.title}"?`)) return;
    const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setItems((cur) => cur.filter((i) => i.id !== item.id));
      if (kind === "change_order") onProjectChanged();
    }
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
        {isCotizacion && !loading && (
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

        {isMovimientos && !loading && (
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

        {loading && <p className="empty-col">Cargando…</p>}
        {!loading && items.length === 0 && <p className="empty-col">Sin registros todavía.</p>}

        <CListGroup>
          {items.map((item) => {
            const isWinner = isCotizacion && item.status === "Seleccionada";
            return (
              <CListGroupItem key={item.id} className={"item-row border-0 border-bottom rounded-0 px-0" + (isWinner ? " item-row-winner" : "")}>
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
            );
          })}
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
            if (kind === "change_order") onProjectChanged();
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
  const [quotes, setQuotes] = useState<ProjectItemDTO[]>([]);

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
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={onClose}>Cancelar</CButton>
          <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  );
}
