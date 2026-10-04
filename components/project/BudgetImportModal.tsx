"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CAlert, CButton, CFormCheck, CFormInput, CFormLabel, CFormSelect, CFormTextarea, CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle,
} from "@coreui/react";
import { CAMPO_LABEL, celdasDeTexto, leerPlanilla, type ResultadoPlanilla } from "@/lib/compras/planilla";
import {
  armarPlan, compararConExistentes, decisionSugerida,
  type Cambio, type Comparacion, type Decision, type FilaNueva, type ItemExistente,
} from "@/lib/compras/reimportar";
import { fmtCant, fmtGs } from "@/lib/compras/labels";
import "@/app/styles/compras.css";

const MAX_FILAS_VISTA = 200;

const CAMBIO_LABEL: Record<Cambio["campo"], string> = {
  descripcion: "Descripción",
  unidad: "Unidad",
  cantidad: "Cantidad",
  precioUnitario: "Precio unitario",
  categoria: "Categoría",
};
const fmtValor = (c: Cambio, v: Cambio["antes"]) =>
  v === null || v === "" ? "—" : c.campo === "precioUnitario" ? fmtGs(Number(v)) : c.campo === "cantidad" ? fmtCant(Number(v)) : String(v);
const resumenItem = (i: FilaNueva) => `${fmtCant(i.cantidad)}${i.unidad ? ` ${i.unidad}` : ""} × ${fmtGs(i.precioUnitario)} = ${fmtGs(i.cantidad * i.precioUnitario)}`;
const decisionValor = (d: Decision | null) => (!d ? "" : d.accion === "actualizar" ? `actualizar:${d.id}` : d.accion);
const valorDecision = (v: string): Decision | null =>
  v.startsWith("actualizar:") ? { accion: "actualizar", id: v.slice("actualizar:".length) } : v === "agregar" ? { accion: "agregar" } : v === "omitir" ? { accion: "omitir" } : null;

type Resultado = { agregados: number; actualizados?: number; borrados: number };

/**
 * Importar el presupuesto por ítem desde Excel: pegando las celdas o
 * subiendo el archivo. Antes de guardar muestra cómo se entendió cada fila.
 * Si la obra ya tiene presupuesto, compara la planilla con lo cargado y
 * pregunta qué hacer con cada ítem que coincide o que ya no aparece, así
 * nada se duplica ni se borra sin querer.
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
  onImported: (r: Resultado) => void;
}) {
  const [texto, setTexto] = useState("");
  const [celdasArchivo, setCeldasArchivo] = useState<unknown[][] | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Paso de revisión (solo si la obra ya tenía presupuesto).
  const [comp, setComp] = useState<Comparacion | null>(null);
  const [decisiones, setDecisiones] = useState<(Decision | null)[]>([]);
  const [borrar, setBorrar] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setTexto(""); setCeldasArchivo(null); setNombreArchivo(""); setError(null);
    setComp(null); setDecisiones([]); setBorrar(new Set());
  }, [visible]);

  const resultado = useMemo<ResultadoPlanilla | null>(() => {
    if (celdasArchivo) return leerPlanilla(celdasArchivo);
    if (texto.trim()) return leerPlanilla(celdasDeTexto(texto));
    return null;
  }, [texto, celdasArchivo]);
  const items = resultado?.filas.filter((f) => f.tipo === "item") ?? [];
  const titulos = resultado?.filas.filter((f) => f.tipo === "titulo").length ?? 0;
  const errores = resultado?.filas.filter((f) => f.tipo === "error").length ?? 0;
  const filasNuevas: FilaNueva[] = items.map((f) => ({
    codigo: f.codigo, descripcion: f.descripcion, unidad: f.unidad, cantidad: f.cantidad ?? 0, precioUnitario: f.precioUnitario ?? 0, categoria: f.categoria,
  }));

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

  async function enviar(body: unknown) {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/presupuesto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  /** Paso 1 → guardar directo (obra sin presupuesto) o comparar con lo cargado. */
  async function siguiente() {
    if (!filasNuevas.length) return;
    if (!hayItems) return enviar({ items: filasNuevas });
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/presupuesto?para=importar`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const existentes = (await res.json()) as ItemExistente[];
      const c = compararConExistentes(existentes, filasNuevas);
      const hayQuePreguntar = c.faltantes.length > 0 || c.filas.some((f) => f.tipo === "cambio" || f.tipo === "ambiguo");
      if (!hayQuePreguntar) {
        // Todo nuevo o igual: no hay nada que decidir. ("return await": así el
        // botón sigue deshabilitado hasta que termina de guardar.)
        const agregar = c.filas.filter((f) => f.tipo === "nuevo").map((f) => f.fila);
        if (!agregar.length) return onImported({ agregados: 0, borrados: 0 });
        return await enviar({ agregar, actualizar: [], borrar: [] });
      }
      setComp(c);
      setDecisiones(c.filas.map(decisionSugerida));
      setBorrar(new Set());
    } catch {
      setError("No se pudo leer el presupuesto que ya está cargado. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  const plan = comp ? armarPlan(comp, decisiones, borrar) : null;
  const pendientes = comp ? comp.filas.filter((f) => !decisiones[f.indice]).length : 0;

  async function guardarRevision() {
    if (!plan) return;
    if ("error" in plan) return setError(plan.error);
    await enviar(plan.plan);
  }

  const casos = comp?.filas.filter((f) => f.tipo === "ambiguo" || f.tipo === "cambio") ?? [];
  const cuantos = (t: string) => comp?.filas.filter((f) => f.tipo === t).length ?? 0;
  const borrables = comp?.faltantes.filter((e) => e.pedidos === 0) ?? [];

  return (
    <CModal visible={visible} onClose={onClose} alignment="center" size="xl" backdrop="static" scrollable>
      <CModalHeader>
        <CModalTitle>{comp ? "Revisá los ítems que ya estaban cargados" : "Importar presupuesto desde una planilla"}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {error && <CAlert color="danger" role="alert">{error}</CAlert>}

        {comp ? (
          <>
            <p className="mb-2" role="status">
              <strong>{cuantos("nuevo")}</strong> nuevos se agregan · <strong>{cuantos("igual")}</strong> iguales no cambian
              {casos.length > 0 && <> · <strong>{casos.length}</strong> coinciden con algo ya cargado</>}
              {comp.faltantes.length > 0 && <> · <strong>{comp.faltantes.length}</strong> ya no están en la planilla</>}
            </p>
            <p className="small text-body-secondary">
              Nada se guarda hasta que toques <strong>Guardar cambios</strong>. Los pedidos de compra siguen vinculados al ítem que actualices.
            </p>

            {casos.length > 0 && <h3 className="h6 fw-semibold mt-3">Ítems que coinciden con lo cargado</h3>}
            {casos.map((c) => {
              const d = decisiones[c.indice];
              const id = `reimp-${c.indice}`;
              return (
                <div key={c.indice} className={`reimp-caso${d ? "" : " is-pendiente"}`}>
                  <div className="fw-semibold">
                    {c.fila.codigo ? `${c.fila.codigo} · ` : ""}{c.fila.descripcion}
                    {c.fila.categoria && <span className="fw-normal small text-body-secondary"> · {c.fila.categoria}</span>}
                  </div>
                  <dl className="reimp-datos">
                    <dt>Planilla nueva</dt>
                    <dd>{resumenItem(c.fila)}</dd>
                    {c.tipo === "cambio" && (
                      <>
                        <dt>Ya cargado</dt>
                        <dd>
                          {resumenItem(c.candidatos[0])}
                          {c.candidatos[0].pedidos > 0 && ` · con pedidos (${fmtCant(c.candidatos[0].pedido)} pedidos aprobados)`}
                        </dd>
                        <dt>Cambia</dt>
                        <dd>{c.cambios.map((x) => `${CAMBIO_LABEL[x.campo]}: ${fmtValor(x, x.antes)} → ${fmtValor(x, x.despues)}`).join(" · ")}</dd>
                      </>
                    )}
                  </dl>
                  {c.avisos.map((a) => <p key={a} className="reimp-aviso">{a}</p>)}
                  <CFormLabel htmlFor={id} className="small fw-semibold mb-1">¿Qué hago con esta fila?</CFormLabel>
                  <CFormSelect
                    id={id}
                    size="sm"
                    value={decisionValor(d)}
                    onChange={(e) => {
                      const v = valorDecision((e.target as HTMLSelectElement).value);
                      setDecisiones((cur) => cur.map((x, i) => (i === c.indice ? v : x)));
                      setError(null);
                    }}
                  >
                    {c.tipo === "ambiguo" && <option value="">Elegí una opción…</option>}
                    {c.candidatos.map((e) => (
                      <option key={e.id} value={`actualizar:${e.id}`}>
                        {c.tipo === "cambio" ? "Actualizar el ítem cargado con los datos nuevos (recomendado)" : `Actualizar: ${e.descripcion}${e.categoria ? ` (${e.categoria})` : ""} · ${resumenItem(e)}${e.pedidos ? " · con pedidos" : ""}`}
                      </option>
                    ))}
                    <option value="agregar">Agregarlo como un ítem aparte (quedan los dos)</option>
                    <option value="omitir">No cargarlo (dejar lo que ya está)</option>
                  </CFormSelect>
                </div>
              );
            })}

            {comp.faltantes.length > 0 && (
              <>
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-4">
                  <h3 className="h6 fw-semibold mb-0">Ítems cargados que ya no están en la planilla</h3>
                  {borrables.length > 0 && (
                    <CButton
                      color="secondary" variant="outline" size="sm"
                      onClick={() => setBorrar(borrar.size === borrables.length ? new Set() : new Set(borrables.map((e) => e.id)))}
                    >
                      {borrar.size === borrables.length ? "No borrar ninguno" : "Marcar todos para borrar"}
                    </CButton>
                  )}
                </div>
                <p className="small text-body-secondary mb-1">
                  Si la planilla nueva es el presupuesto completo, estos probablemente sobran. Si no marcás nada, se conservan.
                </p>
                {comp.faltantes.map((e) => (
                  <div key={e.id} className="reimp-falta">
                    <div>
                      {e.codigo ? `${e.codigo} · ` : ""}{e.descripcion}
                      <div className="small text-body-secondary">{resumenItem(e)}</div>
                    </div>
                    {e.pedidos > 0 ? (
                      <span className="small text-body-secondary text-end">Tiene pedidos: se conserva</span>
                    ) : (
                      <CFormCheck
                        id={`reimp-borrar-${e.id}`}
                        label="Borrar"
                        checked={borrar.has(e.id)}
                        onChange={(ev) => {
                          const next = new Set(borrar);
                          if ((ev.target as HTMLInputElement).checked) next.add(e.id);
                          else next.delete(e.id);
                          setBorrar(next);
                        }}
                      />
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <>
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
                  <strong>{items.length} {items.length === 1 ? "ítem leído" : "ítems leídos"}</strong>
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
            {hayItems && items.length > 0 && (
              <p className="small text-body-secondary mt-3 mb-0">
                Esta obra ya tiene presupuesto: en el paso siguiente te muestro qué ítems coinciden con lo cargado y qué hacer con cada uno.
              </p>
            )}
          </>
        )}
      </CModalBody>
      <CModalFooter>
        {comp ? (
          <>
            <CButton color="secondary" variant="outline" onClick={() => { setComp(null); setError(null); }} disabled={guardando}>Volver a la planilla</CButton>
            <CButton color="primary" onClick={guardarRevision} disabled={guardando || pendientes > 0}>
              {guardando ? "Guardando…" : pendientes > 0 ? `Faltan ${pendientes} por elegir` : "Guardar cambios"}
            </CButton>
          </>
        ) : (
          <>
            <CButton color="secondary" variant="outline" onClick={onClose}>Cancelar</CButton>
            <CButton color="primary" onClick={siguiente} disabled={!items.length || guardando || leyendo}>
              {guardando
                ? hayItems ? "Comparando…" : "Guardando…"
                : !items.length ? "Guardar"
                : hayItems ? "Siguiente: revisar" : `Guardar ${items.length} ${items.length === 1 ? "ítem" : "ítems"}`}
            </CButton>
          </>
        )}
      </CModalFooter>
    </CModal>
  );
}
