"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CCard, CCardBody, CCardHeader, CBadge } from "@coreui/react";
import AppShell from "@/components/AppShell";
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

/**
 * Obras de un rubro puntual, clasificadas en 3 columnas por estado —
 * "pausado" se muestra dentro de "En curso" con una etiqueta propia, para no
 * perder esa distinción sin agregar una cuarta columna que el usuario no pidió.
 */
export default function RubroDetailPage({ params }: { params: { type: string } }) {
  const type = params.type;
  const isValidType = VALID_TYPES.includes(type);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isValidType) {
      setLoading(false);
      return;
    }
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ProjectDTO[]) => setProjects(data.filter((p) => p.type === type)))
      .finally(() => setLoading(false));
  }, [type, isValidType]);

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
    <AppShell crumbs={[{ label: "Obras por rubro", href: "/rubros" }, { label: TYPE_LABEL[t] }]}>
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
                    {items.map((p) => (
                      <Link key={p.id} href={`/project/${p.id}`} className="rubro-project-card">
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <span className="rubro-project-name">{p.name}</span>
                          {p.status === "pausado" && <CBadge color="secondary">Pausado</CBadge>}
                        </div>
                        <div className="rubro-project-meta">
                          {typeLabel(p)} · {p.manager} · {fmtMoney(p.budget)}
                        </div>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{ width: `${Math.max(0, Math.min(100, p.progress))}%`, background: `var(--${p.type})` }}
                          />
                        </div>
                      </Link>
                    ))}
                  </CCardBody>
                </CCard>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
