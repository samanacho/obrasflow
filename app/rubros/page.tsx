"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CCard, CCardBody, CBadge } from "@coreui/react";
import AppShell from "@/components/AppShell";
import type { ProjectDTO, ProjectType } from "@/lib/types";

const TYPE_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const TYPE_ICON: Record<ProjectType, string> = { civil: "🏢", electrico: "⚡", vial: "🛣️", otro: "🔧" };
const TYPE_COLOR: Record<ProjectType, string> = { civil: "info", electrico: "warning", vial: "secondary", otro: "dark" };
const TYPES: ProjectType[] = ["civil", "electrico", "vial", "otro"];

function fmtMoney(n: number) {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY");
}

interface Bucket {
  count: number;
  budget: number;
  proyectadas: number;
  enCurso: number;
  terminadas: number;
}

/**
 * "Base de datos" de obras agrupada por rubro — punto de entrada desde el
 * dashboard (KPI "Proyectos totales" y el módulo "Todas las obras"). Cada
 * tarjeta de rubro lleva a /rubros/[type], donde esas obras se ven
 * clasificadas por estado (proyectada / en curso / terminada).
 */
export default function RubrosPage() {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ProjectDTO[]) => setProjects(data))
      .finally(() => setLoading(false));
  }, []);

  const byType = useMemo(() => {
    const acc: Record<ProjectType, Bucket> = {
      civil: { count: 0, budget: 0, proyectadas: 0, enCurso: 0, terminadas: 0 },
      electrico: { count: 0, budget: 0, proyectadas: 0, enCurso: 0, terminadas: 0 },
      vial: { count: 0, budget: 0, proyectadas: 0, enCurso: 0, terminadas: 0 },
      otro: { count: 0, budget: 0, proyectadas: 0, enCurso: 0, terminadas: 0 },
    };
    projects.forEach((p) => {
      const bucket = acc[p.type];
      bucket.count++;
      bucket.budget += p.budget;
      if (p.status === "planificado") bucket.proyectadas++;
      else if (p.status === "finalizado") bucket.terminadas++;
      else bucket.enCurso++; // en_curso + pausado se agrupan como "en curso"
    });
    return acc;
  }, [projects]);

  return (
    <AppShell crumbs={[{ label: "Obras por rubro" }]}>
      <h1 className="of-page-title">📂 Obras por rubro</h1>
      <p className="module-desc mb-4">
        Toda la cartera de proyectos, agrupada por rubro. Entrá a un rubro para ver sus obras
        proyectadas, en curso y terminadas.
      </p>

      {loading && <p className="state-message">Cargando…</p>}
      {!loading && projects.length === 0 && (
        <p className="empty-col">Todavía no hay proyectos cargados.</p>
      )}

      {!loading && (
        <div className="row g-3">
          {TYPES.map((t) => {
            const b = byType[t];
            return (
              <div className="col-sm-6 col-lg-3" key={t}>
                <Link href={`/rubros/${t}`} className="text-decoration-none text-reset d-block h-100">
                  <CCard className="h-100 kpi-card">
                    <CCardBody>
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <span className="rubro-card-icon">{TYPE_ICON[t]}</span>
                        <CBadge color={TYPE_COLOR[t]}>{TYPE_LABEL[t]}</CBadge>
                      </div>
                      <div className="fs-3 fw-bold mono">{b.count}</div>
                      <div className="text-body-secondary small mb-2">
                        obra{b.count === 1 ? "" : "s"} · {fmtMoney(b.budget)}
                      </div>
                      <div className="rubro-card-breakdown">
                        <span>{b.proyectadas} proyectada{b.proyectadas === 1 ? "" : "s"}</span>
                        <span>{b.enCurso} en curso</span>
                        <span>{b.terminadas} terminada{b.terminadas === 1 ? "" : "s"}</span>
                      </div>
                    </CCardBody>
                  </CCard>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
