"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CCard, CCardBody, CCardHeader, CRow, CCol,
  CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell, CBadge,
} from "@coreui/react";
import AppShell from "@/components/AppShell";
import PinGate from "@/components/PinGate";
import type { ProjectDTO, GeneralMovementDTO } from "@/lib/types";
import { summarizeProfitShare, PARTNERS, SIN_RESPONSABLE_LABEL } from "@/lib/profitShare";

function fmtMoney(n: number) {
  const sign = n < 0 ? "-" : "";
  return sign + "Gs. " + Math.abs(Math.round(n)).toLocaleString("es-PY");
}
function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}
function amountColor(n: number) {
  return n >= 0 ? "var(--ok)" : "var(--crit)";
}

/**
 * Reparto de beneficios — pedido puntual: del 100% del beneficio de cada
 * obra (budget - spent) o cada ingreso general (monto), 15% es para quien
 * lo consiguió ("Responsable" de la obra, o el campo "responsable" del
 * ingreso general); del 85% restante, 55% para Ignacio Samaniego y 45%
 * para Hugo Rotela. Ver lib/profitShare.ts para el cálculo.
 */
function ReparoBeneficios() {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [generalMovements, setGeneralMovements] = useState<GeneralMovementDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      fetch("/api/projects").then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch("/api/general-movements").then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
    ])
      .then(([p, g]) => { setProjects(p); setGeneralMovements(g); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => summarizeProfitShare(projects, generalMovements), [projects, generalMovements]);

  const responsableRows = useMemo(() => {
    const rows = Array.from(summary.porResponsable.entries())
      .map(([nombre, monto]) => ({ nombre, monto }))
      .sort((a, b) => b.monto - a.monto);
    if (summary.sinResponsableTotal !== 0) rows.push({ nombre: SIN_RESPONSABLE_LABEL, monto: summary.sinResponsableTotal });
    return rows;
  }, [summary]);

  const sortedSources = useMemo(() => summary.sources.slice().sort((a, b) => b.beneficio - a.beneficio), [summary]);

  // "SAMRO" = Samaniego + Rotela: la suma de lo que le corresponde a ambos
  // socios juntos (el 85% restante repartido entero, sin el 15% del
  // responsable).
  const samroTotal = useMemo(
    () => PARTNERS.reduce((sum, p) => sum + (summary.socioTotales.get(p.nombre) ?? 0), 0),
    [summary]
  );

  if (loading) return <p className="state-message">Cargando reparto de beneficios…</p>;
  if (loadError) return <p className="state-message form-error">No se pudo cargar la información para el reparto.</p>;
  if (sortedSources.length === 0) return <p className="empty-col">Todavía no hay obras ni ingresos generales cargados.</p>;

  return (
    <>
      <CRow className="g-3 mb-4">
        <CCol md={6} xl={3}>
          <CCard className="h-100">
            <CCardBody>
              <div className="text-uppercase text-body-secondary small mb-1">Beneficio total</div>
              <div className="fs-3 fw-bold mono" style={{ color: amountColor(summary.totalBeneficio) }}>{fmtMoney(summary.totalBeneficio)}</div>
              <div className="text-body-secondary small">obras + ingresos generales</div>
            </CCardBody>
          </CCard>
        </CCol>
        {PARTNERS.map((p) => {
          const monto = summary.socioTotales.get(p.nombre) ?? 0;
          return (
            <CCol md={6} xl={3} key={p.nombre}>
              <CCard className="h-100">
                <CCardBody>
                  <div className="text-uppercase text-body-secondary small mb-1">{p.nombre}</div>
                  <div className="fs-3 fw-bold mono" style={{ color: amountColor(monto) }}>{fmtMoney(monto)}</div>
                  <div className="text-body-secondary small">{Math.round(p.pct * 100)}% del 85% restante</div>
                </CCardBody>
              </CCard>
            </CCol>
          );
        })}
        <CCol md={6} xl={3}>
          <CCard className="h-100">
            <CCardBody>
              <div className="text-uppercase text-body-secondary small mb-1">Samro</div>
              <div className="fs-3 fw-bold mono" style={{ color: amountColor(samroTotal) }}>{fmtMoney(samroTotal)}</div>
              <div className="text-body-secondary small">Ignacio + Hugo (85% restante)</div>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      <CCard className="mb-4">
        <CCardHeader className="fw-semibold">Por responsable (15%)</CCardHeader>
        <CCardBody>
          <CRow className="g-3">
            {responsableRows.map((r) => (
              <CCol md={4} key={r.nombre}>
                <div className="d-flex justify-content-between align-items-center gap-2">
                  <span className={r.nombre === SIN_RESPONSABLE_LABEL ? "text-body-secondary fst-italic" : ""}>{r.nombre}</span>
                  <span className="mono fw-semibold" style={{ color: amountColor(r.monto) }}>{fmtMoney(r.monto)}</span>
                </div>
              </CCol>
            ))}
          </CRow>
          {summary.sinResponsableTotal !== 0 && (
            <p className="form-hint mt-3 mb-0">
              Hay ingresos generales sin responsable asignado todavía — cargalo en <Link href="/movimientos">Movimientos</Link>{" "}
              para que se sumen a la persona correcta.
            </p>
          )}
        </CCardBody>
      </CCard>

      <CCard>
        <CCardHeader className="fw-semibold">Detalle por obra / ingreso</CCardHeader>
        <CCardBody>
          <div className="table-wrap">
            <CTable hover responsive>
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Fuente</CTableHeaderCell>
                  <CTableHeaderCell>Tipo</CTableHeaderCell>
                  <CTableHeaderCell>Fecha</CTableHeaderCell>
                  <CTableHeaderCell>Beneficio</CTableHeaderCell>
                  <CTableHeaderCell>Responsable</CTableHeaderCell>
                  <CTableHeaderCell>15% responsable</CTableHeaderCell>
                  {PARTNERS.map((p) => <CTableHeaderCell key={p.nombre}>{p.nombre}</CTableHeaderCell>)}
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {sortedSources.map((s) => (
                  <CTableRow key={s.id}>
                    <CTableDataCell><Link href={s.href}>{s.label} ↗</Link></CTableDataCell>
                    <CTableDataCell>
                      <CBadge color={s.kind === "obra" ? "info" : s.kind === "egreso" ? "danger" : "dark"}>
                        {s.kind === "obra" ? "Obra" : s.kind === "egreso" ? "Egreso" : "Ingreso"}
                      </CBadge>
                    </CTableDataCell>
                    <CTableDataCell className="mono">{s.fecha ? fmtDate(s.fecha) : "—"}</CTableDataCell>
                    <CTableDataCell className="mono" style={{ color: amountColor(s.beneficio) }}>{fmtMoney(s.beneficio)}</CTableDataCell>
                    <CTableDataCell>
                      {s.responsable || <span className="text-body-secondary fst-italic">Sin asignar</span>}
                    </CTableDataCell>
                    <CTableDataCell className="mono">{fmtMoney(s.responsableMonto)}</CTableDataCell>
                    {s.partnerMontos.map((p) => (
                      <CTableDataCell className="mono" key={p.nombre}>{fmtMoney(p.monto)}</CTableDataCell>
                    ))}
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          </div>
        </CCardBody>
      </CCard>
    </>
  );
}

/**
 * Módulo "Personal" — tapado con PinGate (PIN "9061") a pedido. Por ahora
 * tiene una sola sección funcional (Reparto de beneficios); legajos,
 * asistencia, liquidaciones, etc. quedan para cuando se defina qué tienen
 * que manejar.
 */
export default function PersonalPage() {
  return (
    <AppShell crumbs={[{ label: "Personal" }]}>
      <PinGate pin="9061" storageKey="obrasflow-personal-unlocked" title="Módulo Personal">
        <h1 className="of-page-title">👤 Personal</h1>
        <p className="module-desc mb-4">
          Todavía no maneja legajos, asistencia ni liquidaciones — está reservado a la espera de esa definición. Por
          ahora, el reparto de beneficios de cada obra e ingreso, neto de los egresos generales de la empresa.
        </p>
        <ReparoBeneficios />
      </PinGate>
    </AppShell>
  );
}
