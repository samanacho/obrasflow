"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CAlert, CButton, CFormCheck, CFormInput, CFormLabel, CFormTextarea, CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle,
} from "@coreui/react";
import { CAMPO_LABEL, celdasDeTexto, leerPlanilla, type ResultadoPlanilla } from "@/lib/compras/planilla";
import { fmtCant, fmtGs } from "@/lib/compras/labels";
import { confirmar } from "@/lib/ui/alerts";
import "@/app/styles/compras.css";

const MAX_FILAS_VISTA = 200;

/**
 * Importar el presupuesto por ítem desde Excel: pegando las celdas o
 * subiendo el archivo. Antes de guardar muestra cómo se entendió cada fila,
 * así nada entra a ciegas.
 */
export default function BudgetImportModal({
  projectId,
  visible,
  hayItems,
  onClose,
  onImported,
}: {
  projectId: string;
  visible: boolean;
  hayItems: boolean;
  onClose: () => void;
  onImported: (r: { agregados: number; borrados: number }) => void;
}) {
  const [texto, setTexto] = useState("");
  const [celdasArchivo, setCeldasArchivo] = useState<unknown[][] | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [reemplazar, setReemplazar] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTexto(""); setCeldasArchivo(null); setNombreArchivo(""); setReemplazar(false); setError(null);
  }, [visible]);

  const resultado = useMemo<ResultadoPlanilla | null>(() => {
    if (celdasArchivo) return leerPlanilla(celdasArchivo);
    if (texto.trim()) return leerPlanilla(celdasDeTexto(texto));
    return null;
  }, [texto, celdasArchivo]);
  const items = resultado?.filas.filter((f) => f.tipo === "item") ?? [];
  const titulos = resultado?.filas.filter((f) => f.tipo === "titulo").length ?? 0;
  const errores = resultado?.filas.filter((f) => f.tipo === "error").length ?? 0;

  async function leerArchivo(f: File | null) {
    setError(null);
    setCeldasArchivo(null);
    setNombreArchivo(f?.name ?? "");
    if (!f) return;
    setLeyendo(true);
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        setCeldasArchivo((await readSheet(f)) as unknown[][]);
      } else if (/\.(csv|txt|tsv)$/i.test(f.name)) {
        setCeldasArchivo(celdasDeTexto(await f.text()));
      } else {
        setError("Ese archivo no se puede leer. Usá un Excel .xlsx o un .csv (si es .xls viejo, guardalo como .xlsx).");
      }
    } catch {
      setError("No se pudo leer el archivo. Probá abrirlo en Excel, copiar las celdas y pegarlas arriba.");
    } finally {
      setLeyendo(false);
    }
  }

  async function guardar() {
    if (!items.length) return;
    if (reemplazar) {
      const ok = await confirmar({
        titulo: "¿Reemplazar el presupuesto?",
        texto: `Se borran los ítems actuales que no tienen pedidos y se cargan los ${items.length} nuevos. Los ítems con pedidos se quedan.`,
        confirmar: "Reemplazar",
        peligro: true,
      });
      if (!ok) return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/presupuesto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reemplazar,
          items: items.map((f) => ({ codigo: f.codigo, descripcion: f.descripcion, unidad: f.unidad, cantidad: f.cantidad, precioUnitario: f.precioUnitario, categoria: f.categoria })),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "No se pudo guardar el presupuesto.");
      onImported(d);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <CModal visible={visible} onClose={onClose} alignment="center" size="xl" backdrop="static" scrollable>
      <CModalHeader><CModalTitle>Importar presupuesto desde una planilla</CModalTitle></CModalHeader>
      <CModalBody>
        {error && <CAlert color="danger" role="alert">{error}</CAlert>}
        <CFormLabel htmlFor="imp-texto" className="fw-semibold">Pegá desde Excel</CFormLabel>
        <p className="small text-body-secondary mb-1">
          En Excel, seleccioná las filas del presupuesto <strong>con la fila de títulos</strong> (Código, Descripción, Unidad, Cantidad, Precio unitario), copiá y pegá acá.
        </p>
        <CFormTextarea
          id="imp-texto" rows={5} className="mono small"
          placeholder={"Ítem\tDescripción\tUnid.\tCant.\tP. Unit.\n1.1\tCemento Portland\tbolsa\t120\t62.000"}
          value={texto}
          disabled={Boolean(celdasArchivo)}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="d-flex flex-wrap align-items-end gap-2 mt-3">
          <div style={{ flex: "1 1 280px" }}>
            <CFormLabel htmlFor="imp-file" className="fw-semibold">O subí el archivo <span className="fw-normal text-body-secondary">(.xlsx o .csv; se lee la primera hoja)</span></CFormLabel>
            <CFormInput id="imp-file" type="file" accept=".xlsx,.csv,.txt,.tsv" onChange={(e) => leerArchivo((e.target as HTMLInputElement).files?.[0] ?? null)} />
          </div>
          {celdasArchivo && (
            <CButton color="secondary" variant="outline" size="sm" onClick={() => { setCeldasArchivo(null); setNombreArchivo(""); }}>Quitar archivo</CButton>
          )}
        </div>
        {leyendo && <p className="state-message py-3">Leyendo {nombreArchivo}…</p>}

        {resultado && !leyendo && (
          <div className="mt-3">
            <p className="mb-2" role="status">
              <strong>{items.length} {items.length === 1 ? "ítem listo" : "ítems listos"} para guardar</strong>
              {titulos > 0 && <> · {titulos} {titulos === 1 ? "título de grupo" : "títulos de grupo"} (se usan como categoría)</>}
              {errores > 0 && <span className="cmp-pasa"> · {errores} {errores === 1 ? "fila con problemas" : "filas con problemas"} (no se guardan)</span>}
            </p>
            {!resultado.conTitulos && (
              <CAlert color="info" className="py-2 small">
                No encontré la fila de títulos, así que supuse este orden de columnas: {resultado.columnas.filter(Boolean).map((c) => CAMPO_LABEL[c!]).join(", ")}. Si no es así, copiá también la fila de títulos.
              </CAlert>
            )}
            {resultado.conTitulos && (
              <p className="small text-body-secondary mb-2">
                Columnas reconocidas: {resultado.columnas.map((c, i) => (c ? CAMPO_LABEL[c] : `(columna ${i + 1} sin usar)`)).join(" · ")}
              </p>
            )}
            <div className="bud-preview">
              <table className="table table-sm align-middle">
                <thead>
                  <tr><th>Fila</th><th>Código</th><th>Descripción</th><th>Unidad</th><th className="text-end">Cantidad</th><th className="text-end">Precio unit.</th><th className="text-end">Total</th><th>Observación</th></tr>
                </thead>
                <tbody>
                  {resultado.filas.slice(0, MAX_FILAS_VISTA).map((f) => (
                    <tr key={f.fila} className={f.tipo === "error" ? "is-error" : f.tipo === "titulo" ? "is-titulo" : undefined}>
                      <td className="text-body-secondary">{f.fila}</td>
                      <td>{f.codigo ?? ""}</td>
                      <td>{f.descripcion}{f.tipo === "item" && f.categoria && <div className="small text-body-secondary">{f.categoria}</div>}</td>
                      <td>{f.unidad ?? ""}</td>
                      <td className="text-end">{f.tipo === "titulo" ? "" : fmtCant(f.cantidad)}</td>
                      <td className="text-end">{f.tipo === "titulo" || f.precioUnitario === null ? "" : fmtGs(f.precioUnitario)}</td>
                      <td className="text-end">{f.tipo === "item" ? fmtGs((f.cantidad ?? 0) * (f.precioUnitario ?? 0)) : ""}</td>
                      <td className="small">{f.tipo === "error" ? f.error : f.tipo === "titulo" ? "Título de grupo" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {resultado.filas.length > MAX_FILAS_VISTA && <p className="small text-body-secondary mt-1">Y {resultado.filas.length - MAX_FILAS_VISTA} filas más.</p>}
            {resultado.filas.length === 0 && <p className="state-message py-3">No encontré filas con datos.</p>}
          </div>
        )}

        {hayItems && (
          <CFormCheck
            className="mt-3"
            id="imp-reemplazar"
            checked={reemplazar}
            onChange={(e) => setReemplazar((e.target as HTMLInputElement).checked)}
            label="Reemplazar el presupuesto actual (no borra los ítems que ya tienen pedidos)"
          />
        )}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="outline" onClick={onClose}>Cancelar</CButton>
        <CButton color="primary" onClick={guardar} disabled={!items.length || guardando || leyendo}>
          {guardando ? "Guardando…" : items.length ? `Guardar ${items.length} ${items.length === 1 ? "ítem" : "ítems"}` : "Guardar"}
        </CButton>
      </CModalFooter>
    </CModal>
  );
}
