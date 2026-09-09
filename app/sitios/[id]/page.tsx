"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CCard, CCardBody, CCardHeader, CBadge, CButton, CRow, CCol,
  CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter, CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea, CAlert,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilPencil, cilTrash, cilLinkBroken, cilPlus } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import type { SitioDTO, SitioInput, ProjectDTO, ProjectType, ProjectStatus } from "@/lib/types";

const TYPE_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const TYPE_COLOR: Record<ProjectType, string> = { civil: "info", electrico: "warning", vial: "secondary", otro: "dark" };
const STATUS_LABEL: Record<ProjectStatus, string> = {
  planificado: "Planificado",
  en_curso: "En curso",
  pausado: "Pausado",
  finalizado: "Finalizado",
};
const STATUS_COLOR: Record<ProjectStatus, string> = {
  planificado: "info",
  en_curso: "warning",
  pausado: "secondary",
  finalizado: "success",
};

function fmtMoney(n: number) {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY");
}
function typeLabel(p: { type: ProjectType; customType?: string | null }): string {
  return p.type === "otro" && p.customType ? p.customType : TYPE_LABEL[p.type];
}

/**
 * Ficha de un Sitio — agrupa las obras (frentes) que en realidad son un
 * mismo lugar. Presupuesto/ejecutado/saldo son siempre la suma en vivo de
 * los frentes (nunca un valor guardado en el Sitio, ver comentario en
 * prisma/schema.prisma) para que la plata nunca se cuente dos veces.
 */
export default function SitioDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast, showToast } = useToast();

  const [sitio, setSitio] = useState<SitioDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [availableProjects, setAvailableProjects] = useState<ProjectDTO[]>([]);
  const [addingId, setAddingId] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ProjectDTO | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<SitioInput>({ nombre: "", responsable: "", notas: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    fetch(`/api/sitios/${params.id}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: SitioDTO) => setSitio(data))
      .catch(() => setError("No se pudo cargar el sitio."))
      .finally(() => setLoading(false));
  }
  useEffect(load, [params.id]);

  useEffect(() => {
    fetch("/api/projects").then((r) => (r.ok ? r.json() : [])).then(setAvailableProjects).catch(() => {});
  }, [sitio?.id]);

  const assignable = useMemo(
    () => availableProjects.filter((p) => !p.sitioId).sort((a, b) => a.name.localeCompare(b.name)),
    [availableProjects]
  );

  const saldo = sitio ? sitio.budget - sitio.spent : 0;

  async function handleAssign() {
    if (!addingId || !sitio) return;
    setAddBusy(true);
    try {
      const res = await fetch(`/api/projects/${addingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sitioNombre: sitio.nombre }),
      });
      if (!res.ok) throw new Error();
      setAddingId("");
      load();
    } catch {
      showToast("No se pudo agregar la obra al sitio.");
    } finally {
      setAddBusy(false);
    }
  }

  async function handleRemove(p: ProjectDTO) {
    setRemoveBusy(true);
    try {
      const res = await fetch(`/api/projects/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sitioNombre: null }),
      });
      if (!res.ok) throw new Error();
      setRemoveTarget(null);
      load();
    } catch {
      showToast("No se pudo quitar la obra del sitio.");
    } finally {
      setRemoveBusy(false);
    }
  }

  function openEdit() {
    if (!sitio) return;
    setEditForm({ nombre: sitio.nombre, responsable: sitio.responsable, notas: sitio.notas ?? "" });
    setEditError(null);
    setShowEdit(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm.nombre.trim() || !editForm.responsable.trim()) {
      setEditError("Completá nombre y responsable.");
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/sitios/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setShowEdit(false);
      load();
    } catch (err: any) {
      setEditError(err.message || "No se pudo guardar.");
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete() {
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/sitios/${params.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error();
      router.push("/sitios");
    } catch {
      showToast("No se pudo eliminar el sitio.");
      setDeleteBusy(false);
    }
  }

  if (loading) return <AppShell crumbs={[{ label: "Sitios", href: "/sitios" }]}><p className="state-message">Cargando…</p></AppShell>;
  if (error || !sitio) return <AppShell crumbs={[{ label: "Sitios", href: "/sitios" }]}><p className="state-message form-error">{error || "Sitio no encontrado."}</p></AppShell>;

  return (
    <AppShell crumbs={[{ label: "Sitios", href: "/sitios" }, { label: sitio.nombre }]}>
      <div className="project-hero">
        <div>
          <h1 className="of-page-title mb-2">📍 {sitio.nombre}</h1>
          <div className="project-hero-meta">
            <span>{sitio.frentes.length} frente{sitio.frentes.length === 1 ? "" : "s"}</span>
            <span>· Responsable: {sitio.responsable}</span>
          </div>
          {sitio.notas && <p className="module-desc mt-2 mb-0">{sitio.notas}</p>}
          <div className="d-flex gap-2 mt-3">
            <CButton size="sm" color="secondary" variant="outline" onClick={openEdit}>
              <CIcon icon={cilPencil} className="me-1" /> Editar
            </CButton>
            <CButton size="sm" color="danger" variant="outline" onClick={() => setConfirmDelete(true)}>
              <CIcon icon={cilTrash} className="me-1" /> Eliminar sitio
            </CButton>
          </div>
        </div>
        <div className="project-hero-kpis">
          <CCard>
            <CCardBody>
              <div className="label">Presupuesto</div>
              <div className="value mono">{fmtMoney(sitio.budget)}</div>
              <div className="sub">{fmtMoney(sitio.spent)} ejecutado</div>
            </CCardBody>
          </CCard>
          <CCard>
            <CCardBody>
              <div className="label">Saldo disponible</div>
              <div className={"value mono" + (saldo < 0 ? " alert-text" : "")}>{fmtMoney(saldo)}</div>
              <div className="sub">suma en vivo de los frentes</div>
            </CCardBody>
          </CCard>
        </div>
      </div>

      <CCard className="mb-4">
        <CCardHeader className="fw-semibold">Frentes de este sitio</CCardHeader>
        <CCardBody>
          {sitio.frentes.length === 0 && <p className="empty-col mb-3">Este sitio todavía no tiene ninguna obra vinculada.</p>}
          <div className="d-flex flex-column gap-2 mb-3">
            {sitio.frentes.map((p) => (
              <div key={p.id} className="d-flex justify-content-between align-items-center flex-wrap gap-2 item-row border-bottom pb-2">
                <div>
                  <Link href={`/project/${p.id}`} className="fw-semibold text-decoration-none">{p.name} ↗</Link>
                  <div className="item-row-sub d-flex gap-2 flex-wrap">
                    <CBadge color={TYPE_COLOR[p.type]}>{typeLabel(p)}</CBadge>
                    <CBadge color={STATUS_COLOR[p.status]}>{STATUS_LABEL[p.status]}</CBadge>
                    <span className="mono">{fmtMoney(p.budget)} ppto · {fmtMoney(p.spent)} ejecutado</span>
                  </div>
                </div>
                <CButton size="sm" color="secondary" variant="outline" onClick={() => setRemoveTarget(p)}>
                  <CIcon icon={cilLinkBroken} className="me-1" /> Quitar del sitio
                </CButton>
              </div>
            ))}
          </div>

          {assignable.length > 0 && (
            <div className="d-flex gap-2 align-items-end flex-wrap">
              <div style={{ minWidth: 260 }}>
                <CFormLabel className="small mb-1">Agregar una obra ya cargada a este sitio</CFormLabel>
                <CFormSelect value={addingId} onChange={(e) => setAddingId(e.target.value)}>
                  <option value="">Seleccioná una obra…</option>
                  {assignable.map((p) => <option key={p.id} value={p.id}>{p.name} ({typeLabel(p)})</option>)}
                </CFormSelect>
              </div>
              <CButton color="primary" size="sm" disabled={!addingId || addBusy} onClick={handleAssign}>
                <CIcon icon={cilPlus} className="me-1" /> {addBusy ? "Agregando…" : "Agregar"}
              </CButton>
            </div>
          )}
          <p className="form-hint mt-2 mb-0">
            Para sumar una obra que todavía no está cargada, creála desde <Link href="/rubros">Obras por rubro</Link> y
            escribí &quot;{sitio.nombre}&quot; en su campo Sitio.
          </p>
        </CCardBody>
      </CCard>

      <p className="module-desc">
        Para ver los movimientos de estos frentes cruzados en una sola planilla, entrá a{" "}
        <Link href="/movimientos">Movimientos</Link> y filtrá por este sitio.
      </p>

      {showEdit && (
        <CModal visible onClose={() => setShowEdit(false)} alignment="center">
          <CForm onSubmit={handleEditSubmit}>
            <CModalHeader><CModalTitle>Editar sitio</CModalTitle></CModalHeader>
            <CModalBody>
              {editError && <CAlert color="danger">{editError}</CAlert>}
              <div className="mb-3">
                <CFormLabel>Nombre</CFormLabel>
                <CFormInput required value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} />
              </div>
              <div className="mb-3">
                <CFormLabel>Responsable</CFormLabel>
                <CFormInput required value={editForm.responsable} onChange={(e) => setEditForm({ ...editForm, responsable: e.target.value })} />
                <div className="form-hint mb-0">Quién consiguió el sitio completo — se usa para el 15% de Personal.</div>
              </div>
              <div className="mb-1">
                <CFormLabel>Notas (opcional)</CFormLabel>
                <CFormTextarea rows={2} value={editForm.notas ?? ""} onChange={(e) => setEditForm({ ...editForm, notas: e.target.value })} />
              </div>
            </CModalBody>
            <CModalFooter>
              <CButton color="secondary" variant="ghost" onClick={() => setShowEdit(false)} disabled={editBusy}>Cancelar</CButton>
              <CButton color="primary" type="submit" disabled={editBusy}>{editBusy ? "Guardando…" : "Guardar"}</CButton>
            </CModalFooter>
          </CForm>
        </CModal>
      )}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Quitar del sitio"
        message={`¿Quitar "${removeTarget?.name}" de "${sitio.nombre}"? La obra sigue existiendo con todo su historial, solo deja de estar agrupada acá.`}
        confirmLabel="Quitar"
        confirmColor="primary"
        busy={removeBusy}
        onConfirm={() => removeTarget && handleRemove(removeTarget)}
        onCancel={() => setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar sitio"
        message={`¿Eliminar "${sitio.nombre}"? Sus ${sitio.frentes.length} obra(s) NO se borran — quedan sueltas, sin sitio asignado.`}
        busy={deleteBusy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      {toast && <Toast message={toast} />}
    </AppShell>
  );
}
