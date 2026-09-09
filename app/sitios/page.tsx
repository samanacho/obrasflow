"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CCard, CCardBody, CBadge } from "@coreui/react";
import AppShell from "@/components/AppShell";
import type { SitioDTO, ProjectType } from "@/lib/types";

const TYPE_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const TYPE_COLOR: Record<ProjectType, string> = { civil: "info", electrico: "warning", vial: "secondary", otro: "dark" };

function fmtMoney(n: number) {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY");
}

/**
 * Listado de Sitios — obras (frentes) que en realidad pertenecen a un
 * mismo lugar (ej. la parte civil y la eléctrica de "Congreso"), ver model
 * Sitio en prisma/schema.prisma. No hay alta acá: un Sitio se crea/vincula
 * escribiendo su nombre en el campo "Sitio" del alta de una obra
 * (components/NewProjectWizard.tsx) — acá se administra (editar nombre/
 * responsable, agregar o sacar frentes, borrar) desde /sitios/[id].
 */
export default function SitiosPage() {
  const [sitios, setSitios] = useState<SitioDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sitios")
      .then((r) => (r.ok ? r.json() : []))
      .then(setSitios)
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell crumbs={[{ label: "Obras por rubro", href: "/rubros" }, { label: "Sitios" }]}>
      <h1 className="of-page-title">📍 Sitios</h1>
      <p className="module-desc mb-4">
        Obras que en realidad son frentes (civil, eléctrico…) de un mismo lugar, agrupadas para ver junto su
        presupuesto, ejecutado y beneficio. Para vincular una obra a un sitio, escribí el mismo nombre de sitio al
        cargarla o editarla en <Link href="/rubros">Obras por rubro</Link>.
      </p>

      {loading && <p className="state-message">Cargando…</p>}
      {!loading && sitios.length === 0 && (
        <p className="empty-col">
          Todavía no hay ningún sitio armado. Se crea solo cuando cargás el campo &quot;Sitio&quot; al dar de alta o
          editar una obra.
        </p>
      )}

      {!loading && sitios.length > 0 && (
        <div className="row g-3">
          {sitios.map((s) => {
            const saldo = s.budget - s.spent;
            const porRubro = new Map<ProjectType, number>();
            s.frentes.forEach((f) => porRubro.set(f.type, (porRubro.get(f.type) ?? 0) + 1));
            return (
              <div className="col-md-6 col-lg-4" key={s.id}>
                <Link href={`/sitios/${s.id}`} className="text-decoration-none text-reset d-block h-100">
                  <CCard className="h-100 kpi-card">
                    <CCardBody className="d-flex flex-column gap-2">
                      <div className="d-flex justify-content-between align-items-start">
                        <span className="fw-semibold">{s.nombre}</span>
                        <CBadge color="primary">{s.frentes.length} frente{s.frentes.length === 1 ? "" : "s"}</CBadge>
                      </div>
                      <div className="d-flex gap-1 flex-wrap">
                        {Array.from(porRubro.entries()).map(([t, count]) => (
                          <CBadge key={t} color={TYPE_COLOR[t]}>{TYPE_LABEL[t]}{count > 1 ? ` ×${count}` : ""}</CBadge>
                        ))}
                      </div>
                      <div className="contractor-meta">
                        <span className="mono">{fmtMoney(s.budget)} ppto</span>
                        <span className="mono">{fmtMoney(s.spent)} ejecutado</span>
                      </div>
                      <div className={"text-body-secondary small" + (saldo < 0 ? " alert-text" : "")}>
                        Saldo {fmtMoney(saldo)}
                      </div>
                      <div className="text-body-secondary small">Responsable: {s.responsable}</div>
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
