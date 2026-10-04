"use client";

import { useEffect, useState } from "react";
import {
  CAlert, CButton, CCol, CForm, CFormInput, CFormLabel, CFormTextarea, CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle, CRow,
} from "@coreui/react";
import Select2 from "@/components/ui/Select2";
import { RenglonesEditor, renglonVacio, renglonesParaApi, useObras, usePresupuesto, validarRenglones, type RenglonForm } from "./shared";
import type { PurchaseOrderDTO } from "@/lib/compras/core";

const SOLICITANTE_KEY = "obrasflow-compras-solicitante";

/** Pedido de compra cargado desde la app (los de WhatsApp los carga Memby). */
export default function NuevoPedidoModal({
  visible,
  onClose,
  onCreated,
  obraInicial,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (o: PurchaseOrderDTO) => void;
  obraInicial?: string | null;
}) {
  const { options: obras, error: errorObras } = useObras();
  const [projectId, setProjectId] = useState(obraInicial ?? "");
  const [solicitante, setSolicitante] = useState("");
  const [renglones, setRenglones] = useState<RenglonForm[]>([renglonVacio()]);
  const [fechaNecesaria, setFechaNecesaria] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const { items: presupuesto } = usePresupuesto(projectId || null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    try {
      setSolicitante((s) => s || localStorage.getItem(SOLICITANTE_KEY) || "");
    } catch { /* sin localStorage se escribe a mano */ }
  }, [visible]);
  useEffect(() => { if (obraInicial) setProjectId(obraInicial); }, [obraInicial]);
  // Otra obra = otro presupuesto: los ítems elegidos ya no corresponden.
  useEffect(() => { setRenglones((rs) => rs.map((r) => (r.vinculo ? { ...r, vinculo: "" } : r))); }, [projectId]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) { setError("Elegí la obra."); return; }
    const problema = validarRenglones(renglones);
    if (problema) { setError(problema); return; }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, solicitante: solicitante.trim(), notas: notas.trim() || null, fechaNecesaria: fechaNecesaria || null, lines: renglonesParaApi(renglones) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "No se pudo guardar el pedido.");
      try { if (solicitante.trim()) localStorage.setItem(SOLICITANTE_KEY, solicitante.trim()); } catch { /* opcional */ }
      setRenglones([renglonVacio()]);
      setNotas("");
      setFechaNecesaria("");
      onCreated(body as PurchaseOrderDTO);
    } catch (err: any) {
      setError(err.message || "No se pudo guardar el pedido.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <CModal visible={visible} onClose={onClose} alignment="center" size="xl" backdrop="static">
      <CModalHeader><CModalTitle>Nuevo pedido de compra</CModalTitle></CModalHeader>
      <CForm onSubmit={guardar} noValidate>
        <CModalBody>
          {error && <CAlert color="danger" role="alert">{error}</CAlert>}
          <CRow className="g-3 mb-3">
            <CCol md={7}>
              <CFormLabel htmlFor="np-obra">Obra</CFormLabel>
              <Select2 id="np-obra" options={obras} value={projectId} onChange={setProjectId} placeholder={errorObras ? "No se pudieron cargar las obras" : "Elegí la obra"} />
            </CCol>
            <CCol md={5}>
              <CFormLabel htmlFor="np-quien">Quién lo pide</CFormLabel>
              <CFormInput id="np-quien" value={solicitante} onChange={(e) => setSolicitante(e.target.value)} placeholder="Nombre del encargado" autoComplete="name" />
            </CCol>
          </CRow>

          <fieldset className="mb-3">
            <legend className="form-label fs-6 mb-2">Materiales</legend>
            <RenglonesEditor renglones={renglones} onChange={setRenglones} presupuesto={presupuesto} sinObra={!projectId} />
          </fieldset>

          <CRow className="g-3">
            <CCol md={4}>
              <CFormLabel htmlFor="np-fecha">Para cuándo lo necesitan <span className="text-body-secondary">(opcional)</span></CFormLabel>
              <CFormInput id="np-fecha" type="date" value={fechaNecesaria} onChange={(e) => setFechaNecesaria(e.target.value)} />
            </CCol>
            <CCol md={8}>
              <CFormLabel htmlFor="np-notas">Notas <span className="text-body-secondary">(opcional)</span></CFormLabel>
              <CFormTextarea id="np-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej.: entregar en obra antes del mediodía" />
            </CCol>
          </CRow>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="outline" onClick={onClose}>Cancelar</CButton>
          <CButton color="primary" type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Cargar pedido"}</CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  );
}
