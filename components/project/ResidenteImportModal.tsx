"use client";

// Importar el archivo que se baja de Residente de Obra (CSV o JSON) en UNA
// obra. Dos pasos: "Revisar" (muestra qué va a pasar, sin guardar nada) e
// "Importar". Ver app/api/projects/[id]/residente/importar/route.ts.

import { useState } from "react";
import {
  CAlert, CButton, CFormInput, CFormLabel, CListGroup, CListGroupItem, CModal, CModalBody, CModalFooter, CModalHeader,
  CModalTitle, CSpinner,
} from "@coreui/react";
import { ArrowRight, FileArrowUp, WarningCircle } from "@phosphor-icons/react";
import Icon from "@/components/ui/Icon";
import { notificar } from "@/lib/ui/alerts";

type Outcome = "nuevo" | "actualizado" | "sin_cambios" | "error";

interface Respuesta {
  modo: "preview" | "aplicar";
  formato: "json" | "csv";
  conteos: { total: number; nuevos: number; actualizados: number; sinCambios: number; errores: number };
  avance: { antes: number; despues: number; yaEraDeResidente: boolean; aplicado: boolean; motivo: string | null } | null;
  avisos: string[];
  muestra: { id: string; fecha: string; autor: string | null; resumen: string; outcome: Outcome }[];
}

const OUTCOME: Record<Outcome, { texto: string; clase: string }> = {
  nuevo: { texto: "Nuevo", clase: "status-generic" },
  actualizado: { texto: "Se actualiza", clase: "status-generic" },
  sin_cambios: { texto: "Igual", clase: "status-generic opacity-75" },
  error: { texto: "Con problema", clase: "status-generic text-danger" },
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** "12 partes nuevos, 3 actualizados y 5 iguales" */
export function resumenConteos(c: Respuesta["conteos"], tiempo: "preview" | "aplicar"): string {
  const partes: string[] = [];
  if (c.nuevos) partes.push(plural(c.nuevos, "parte nuevo", "partes nuevos"));
  if (c.actualizados) partes.push(plural(c.actualizados, tiempo === "preview" ? "se actualiza" : "actualizado", tiempo === "preview" ? "se actualizan" : "actualizados"));
  if (c.sinCambios) partes.push(plural(c.sinCambios, "igual (ya estaba)", "iguales (ya estaban)"));
  if (c.errores) partes.push(plural(c.errores, "con problemas", "con problemas"));
  if (!partes.length) return "El archivo no trae partes.";
  return partes.length === 1 ? partes[0] : partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1];
}

const fechaCorta = (ymd: string) => ymd.split("-").reverse().join("/");

export default function ResidenteImportModal({
  projectId, visible, onClose, onImported,
}: {
  projectId: string;
  visible: boolean;
  onClose: () => void;
  /** Se importó: volver a traer los partes y la obra (el avance pudo cambiar). */
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [preview, setPreview] = useState<Respuesta | null>(null);
  const [busy, setBusy] = useState<"preview" | "aplicar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorAvisos, setErrorAvisos] = useState<string[]>([]);

  function reset() {
    setFile(null);
    setPreview(null);
    setError(null);
    setErrorAvisos([]);
    setInputKey((k) => k + 1);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function enviar(modo: "preview" | "aplicar"): Promise<Respuesta | null> {
    if (!file) return null;
    setBusy(modo);
    setError(null);
    setErrorAvisos([]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("modo", modo);
      const res = await fetch(`/api/projects/${projectId}/residente/importar`, { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "No se pudo leer el archivo. Probá de nuevo.");
        setErrorAvisos(Array.isArray(j.avisos) ? j.avisos : []);
        return null;
      }
      return j as Respuesta;
    } catch {
      setError("No hay conexión con la app. Probá de nuevo en un rato.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function revisar() {
    setPreview(await enviar("preview"));
  }

  async function importar() {
    const r = await enviar("aplicar");
    if (!r) return;
    const avance = r.avance?.aplicado && r.avance.antes !== r.avance.despues ? ` Avance de la obra: ${r.avance.despues} %.` : "";
    notificar(`Listo: ${resumenConteos(r.conteos, "aplicar")}.${avance}`, r.conteos.errores ? "warning" : "success");
    onImported();
    reset();
    onClose();
  }

  const nadaQueHacer =
    preview && !preview.conteos.nuevos && !preview.conteos.actualizados && (!preview.avance || !preview.avance.aplicado || (preview.avance.antes === preview.avance.despues && preview.avance.yaEraDeResidente));

  return (
    <CModal visible={visible} onClose={close} alignment="center" size="lg" scrollable>
      <CModalHeader>
        <CModalTitle>Importar de Residente de Obra</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {!preview && (
          <>
            <p className="module-desc">
              En Residente de Obra, entrá a esta obra y bajá el archivo de exportación (CSV o JSON). Después elegilo acá.
              Primero vas a ver qué cambia; no se guarda nada hasta que toques <strong>Importar</strong>.
            </p>
            <CFormLabel htmlFor="residente-archivo">Archivo exportado</CFormLabel>
            <CFormInput
              key={inputKey}
              id="residente-archivo"
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={(e) => {
                setFile((e.target as HTMLInputElement).files?.[0] ?? null);
                setError(null);
                setErrorAvisos([]);
              }}
            />
            <div className="form-hint">Máximo 4 MB. Si importás el mismo archivo dos veces no se duplica nada.</div>
          </>
        )}

        {error && (
          <CAlert color="danger" className="mt-3 mb-0">
            {error}
            {errorAvisos.length > 0 && (
              <ul className="mb-0 mt-2 small">
                {errorAvisos.slice(0, 8).map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            )}
          </CAlert>
        )}

        {preview && (
          <>
            <p className="mb-1 text-body-secondary small">Archivo: {file?.name}</p>
            <p className="fs-5 fw-semibold mb-2">{resumenConteos(preview.conteos, "preview")}</p>
            {preview.avance && !preview.avance.aplicado && preview.avance.motivo && (
              <p className="mb-2">Avance de la obra: {preview.avance.motivo}</p>
            )}
            {preview.avance?.aplicado && (
              <p className="mb-2 d-flex align-items-center gap-2 flex-wrap">
                <span>Avance de la obra:</span>
                <span className="mono">{preview.avance.antes} %</span>
                <Icon icon={ArrowRight} size={16} />
                <strong className="mono">{preview.avance.despues} %</strong>
              </p>
            )}
            {preview.avance?.aplicado && !preview.avance.yaEraDeResidente && (
              <p className="module-desc">
                Desde ahora el avance de esta obra lo va a marcar Residente de Obra (ya no se cambia a mano en ObrasFlow).
              </p>
            )}
            {nadaQueHacer && (
              <CAlert color="info" className="py-2">Todo lo del archivo ya estaba importado: no hay nada nuevo.</CAlert>
            )}

            {preview.muestra.length > 0 && (
              <>
                <div className="fw-semibold mt-3 mb-1">
                  {preview.conteos.total > preview.muestra.length ? `Primeros ${preview.muestra.length} de ${preview.conteos.total} partes` : "Partes del archivo"}
                </div>
                <CListGroup flush className="mb-2">
                  {preview.muestra.map((m) => (
                    <CListGroupItem key={m.id} className="px-0">
                      <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
                        <span>
                          <strong className="mono">{fechaCorta(m.fecha)}</strong>
                          {m.autor && <span> · {m.autor}</span>}
                        </span>
                        <span className={"status-chip " + OUTCOME[m.outcome].clase}>{OUTCOME[m.outcome].texto}</span>
                      </div>
                      {m.resumen && <div className="small text-body-secondary">{m.resumen}</div>}
                    </CListGroupItem>
                  ))}
                </CListGroup>
              </>
            )}

            {preview.avisos.length > 0 && (
              <details className="mt-2">
                <summary className="d-inline-flex align-items-center gap-1">
                  <Icon icon={WarningCircle} size={18} /> {plural(preview.avisos.length, "aviso", "avisos")} sobre el archivo
                </summary>
                <ul className="small mt-2 mb-0">
                  {preview.avisos.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </details>
            )}
          </>
        )}
      </CModalBody>
      <CModalFooter>
        {preview ? (
          <>
            <CButton color="secondary" variant="ghost" onClick={reset} disabled={busy !== null}>Elegir otro archivo</CButton>
            <CButton color="primary" onClick={importar} disabled={busy !== null || !!nadaQueHacer}>
              {busy === "aplicar" ? <><CSpinner size="sm" className="me-1" /> Importando…</> : "Importar"}
            </CButton>
          </>
        ) : (
          <>
            <CButton color="secondary" variant="ghost" onClick={close} disabled={busy !== null}>Cancelar</CButton>
            <CButton color="primary" onClick={revisar} disabled={!file || busy !== null} className="d-inline-flex align-items-center gap-1">
              {busy === "preview" ? <><CSpinner size="sm" /> Revisando…</> : <><Icon icon={FileArrowUp} size={18} /> Revisar</>}
            </CButton>
          </>
        )}
      </CModalFooter>
    </CModal>
  );
}
