"use client";

// Acciones rápidas de una obra sin abrir su ficha: cambiar estado, ajustar
// el avance y anotar un gasto (con el mismo formulario que usa la ficha).

import { useEffect, useState } from "react";
import Link from "next/link";
import { CButton, CModal, CModalBody, CModalHeader, CModalTitle, CSpinner } from "@coreui/react";
import ItemFormModal from "@/components/ItemFormModal";
import { notificar } from "@/lib/ui/alerts";
import type { ProjectDTO, ProjectStatus } from "@/lib/types";
import { budgetState, fmtGs, STATUS_LABEL } from "./HomeWidgets";

const STATUSES: ProjectStatus[] = ["planificado", "en_curso", "pausado", "finalizado"];

export default function QuickActions({
  project,
  onClose,
  onUpdated,
  onSpentChanged,
}: {
  project: ProjectDTO | null;
  onClose: () => void;
  /** La obra cambió (estado o avance): se reemplaza en la lista sin recargar todo. */
  onUpdated: (p: ProjectDTO) => void;
  /** Se anotó un gasto: el ejecutado lo recalcula el servidor, hay que volver a pedir las obras. */
  onSpentChanged: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [gasto, setGasto] = useState(false);

  useEffect(() => {
    if (project) setProgress(Math.round(project.progress));
  }, [project]);

  async function patch(body: Record<string, unknown>, label: string) {
    if (!project) return;
    setBusy(label);
    try {
      const r = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "No se pudo guardar.");
      onUpdated(j as ProjectDTO);
      notificar(`${project.name}: ${label}`, "success");
    } catch (err) {
      notificar((err as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  if (!project) return null;
  const b = budgetState(project);
  const saved = Math.round(project.progress);

  return (
    <>
      <CModal visible={!gasto} onClose={onClose} alignment="center" className="of-qa-modal">
        <CModalHeader>
          <CModalTitle className="fs-5">
            {project.name}
            {project.reference && <span className="text-body-secondary fw-normal"> · {project.reference}</span>}
          </CModalTitle>
        </CModalHeader>
        <CModalBody>
          <div className={`of-qa-budget is-${b.light}`}>
            <span>
              Ejecutado <strong>{fmtGs(project.spent)}</strong> de {fmtGs(project.budget)}
            </span>
            <strong>{b.pct === null ? "—" : `${b.pct} %`}</strong>
          </div>

          <div className="of-qa-section">
            <div className="of-qa-label">Anotar un gasto o pago</div>
            <CButton color="primary" onClick={() => setGasto(true)}>
              + Anotar gasto
            </CButton>
          </div>

          <div className="of-qa-section">
            <div className="of-qa-label">Estado</div>
            <div className="home-chips">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={project.status === s ? "on" : ""}
                  aria-pressed={project.status === s}
                  disabled={busy !== null}
                  onClick={() => s !== project.status && patch(s === "finalizado" ? { status: s, progress: 100 } : { status: s }, `estado ${STATUS_LABEL[s].toLowerCase()}`)}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="of-qa-section">
            <div className="of-qa-label">
              Avance de obra <strong className="ms-1">{progress}&nbsp;%</strong>
            </div>
            <div className="d-flex align-items-center gap-3">
              <input
                type="range"
                className="form-range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                aria-label="Avance de obra"
              />
              <CButton
                color="secondary"
                variant="outline"
                size="sm"
                disabled={progress === saved || busy !== null}
                onClick={() => patch({ progress }, `avance ${progress} %`)}
              >
                {busy?.startsWith("avance") ? <CSpinner size="sm" /> : "Guardar"}
              </CButton>
            </div>
          </div>

          <div className="text-end">
            <Link href={`/project/${project.id}`} className="small">
              Abrir la ficha completa →
            </Link>
          </div>
        </CModalBody>
      </CModal>

      {gasto && (
        <ItemFormModal
          projectId={project.id}
          kind="change_order"
          existing={null}
          contextLabel={project.name}
          showToast={(m) => notificar(m, "info")}
          onClose={() => setGasto(false)}
          onSaved={() => {
            setGasto(false);
            notificar("Gasto anotado", "success");
            onSpentChanged();
            onClose();
          }}
        />
      )}
    </>
  );
}
