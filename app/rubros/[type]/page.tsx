"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CCard, CCardBody, CCardHeader, CBadge, CButton } from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilPlus, cilPencil, cilTrash } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import NewProjectWizard from "@/components/NewProjectWizard";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import type { ProjectDTO, ProjectStatus, ProjectType } from "@/lib/types";

const TYPE_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const TYPE_ICON: Record<ProjectType, string> = { civil: "🏢", electrico: "⚡", vial: "🛣️", otro: "🔧" };
const VALID_TYPES: string[] = ["civil", "electrico", "vial", "otro"];

const COLUMNS: { key: string; label: string; statuses: ProjectStatus[] }[] = [
  { key: "proyectada", label: "Proyectada", statuses: ["planificado"] },
  { key: "en_curso", label: "En curso", statuses: ["en_curso", "pausado"] },
  { key: "terminada", label: "Terminada", statuses: ["finalizado"] },
];

function fmtMoney(n: number) {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY");
}
function typeLabel(p: { type: ProjectType; customType?: string | null }): string {
  return p.type === "otro" && p.customType ? p.customType : TYPE_LABEL[p.type];
}
/** "lat,lng" (como se guarda en Project.coordinates) -> {lat,lng}, o null si no hay nada cargado. */
function parseCoords(raw: string | null): { lat: number; lng: number } | null {
  const [latStr, lngStr] = String(raw ?? "").split(",");
  const lat = Number(latStr);
  const lng = Number(lngStr);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * Obras de un rubro puntual, clasificadas en 3 columnas por estado —
 * "pausado" se muestra dentro de "En curso" con una etiqueta propia, para no
 * perder esa distinción sin agregar una cuarta columna que el usuario no pidió.
 * CRUD completo acá mismo: crear (pre-cargando este rubro), editar y
 * eliminar cada obra sin tener que volver a la tabla plana.
 */
export default function RubroDetailPage({ params }: { params: { type: string } }) {
  const type = params.type;
  const isValidType = VALID_TYPES.includes(type);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectDTO | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ProjectDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast, showToast } = useToast();

  function load() {
    if (!isValidType) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ProjectDTO[]) => setProjects(data.filter((p) => p.type === type)))
      .finally(() => setLoading(false));
  }
  useEffect(load, [type, isValidType]);

  function openCreate() {
    setEditingProject(null);
    setModalOpen(true);
  }
  function openEdit(p: ProjectDTO) {
    setEditingProject(p);
    setModalOpen(true);
  }

  function handleSaved(saved: ProjectDTO) {
    setProjects((prev) => {
      // Si se editó y cambió de rubro, ya no pertenece a esta lista.
      if (saved.type !== type) return prev.filter((p) => p.id !== saved.id);
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx > -1) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
    setModalOpen(false);
    setEditingProject(null);
  }

  async function handleDelete(p: ProjectDTO) {
    setDeleting(true);
    const prev = projects;
    setProjects((cur) => cur.filter((x) => x.id !== p.id));
    try {
      const res = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setConfirmTarget(null);
    } catch {
      setProjects(prev);
      showToast("No se pudo eliminar el proyecto.");
    } finally {
      setDeleting(false);
    }
  }

  if (!isValidType) {
    return (
      <AppShell crumbs={[{ label: "Obras por rubro", href: "/rubros" }, { label: "Rubro desconocido" }]}>
        <p className="empty-col">
          Rubro no encontrado. <Link href="/rubros">Volver a Obras por rubro</Link>.
        </p>
      </AppShell>
    );
  }

  const t = type as ProjectType;

  return (
    <AppShell
      crumbs={[{ label: "Obras por rubro", href: "/rubros" }, { label: TYPE_LABEL[t] }]}
      headerActions={
        <CButton color="primary" size="sm" onClick={openCreate}>
          <CIcon icon={cilPlus} className="me-1" /> Nueva obra
        </CButton>
      }
    >
      <h1 className="of-page-title">{TYPE_ICON[t]} Obras — {TYPE_LABEL[t]}</h1>
      <p className="module-desc mb-4">
        {projects.length} obra{projects.length === 1 ? "" : "s"} de este rubro, clasificadas por estado.
      </p>

      {loading && <p className="state-message">Cargando…</p>}
      {!loading && projects.length === 0 && (
        <p className="empty-col">Todavía no hay obras de este rubro.</p>
      )}

      {!loading && projects.length > 0 && (
        <div className="row g-3">
          {COLUMNS.map((col) => {
            const items = projects.filter((p) => col.statuses.includes(p.status));
            return (
              <div className="col-md-4" key={col.key}>
                <CCard className="h-100">
                  <CCardHeader className="d-flex justify-content-between align-items-center">
                    <span className="fw-semibold">{col.label}</span>
                    <CBadge color="secondary" shape="rounded-pill">{items.length}</CBadge>
                  </CCardHeader>
                  <CCardBody className="d-flex flex-column gap-2">
                    {items.length === 0 && <p className="empty-col">Sin obras en este estado.</p>}
                    {items.map((p) => {
                      const coords = parseCoords(p.coordinates);
                      return (
                      <div key={p.id} className="rubro-project-card">
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <Link href={`/project/${p.id}`} className="rubro-project-name">{p.name}</Link>
                          {p.status === "pausado" && <CBadge color="secondary">Pausado</CBadge>}
                        </div>
                        <div className="rubro-project-meta">
                          {typeLabel(p)} · {p.manager} · {fmtMoney(p.budget)}
                          {p.city && (
                            <>
                              {" · "}
                              {coords ? (
                                <a
                                  href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=17/${coords.lat}/${coords.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="📍 Ver ubicación en el mapa ↗"
                                  className="rubro-project-city-link"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {p.city}
                                </a>
                              ) : (
                                p.city
                              )}
                            </>
                          )}
                        </div>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{ width: `${Math.max(0, Math.min(100, p.progress))}%`, background: `var(--${p.type})` }}
                          />
                        </div>
                        <div className="row-actions mt-2">
                          <CButton size="sm" color="secondary" variant="outline" onClick={() => openEdit(p)}>
                            <CIcon icon={cilPencil} size="sm" />
                          </CButton>
                          <CButton size="sm" color="danger" variant="outline" onClick={() => setConfirmTarget(p)}>
                            <CIcon icon={cilTrash} size="sm" />
                          </CButton>
                        </div>
                      </div>
                      );
                    })}
                  </CCardBody>
                </CCard>
              </div>
            );
          })}
        </div>
      )}

      <NewProjectWizard
        visible={modalOpen}
        editingProject={editingProject}
        initialType={t}
        onClose={() => { setModalOpen(false); setEditingProject(null); }}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Eliminar obra"
        message={`¿Eliminar "${confirmTarget?.name}"? Esta acción no se puede deshacer.`}
        busy={deleting}
        onConfirm={() => confirmTarget && handleDelete(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
      <Toast message={toast} />
    </AppShell>
  );
}
