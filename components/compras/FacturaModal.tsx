"use client";

import { useEffect, useRef, useState } from "react";
import {
  CAlert, CButton, CCol, CForm, CFormInput, CFormLabel, CFormSelect, CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle, CRow,
} from "@coreui/react";
import { TIPOS_COMPROBANTE, fmtGs, fmtMiles, hoyPy, parseNumero } from "@/lib/compras/labels";
import type { PurchaseOrderDTO } from "@/lib/compras/core";

const MAX_BYTES = 4 * 1024 * 1024;
const TIPOS_ARCHIVO = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

/** Datos de la factura (y la foto o PDF). Si el pedido ya está pagado, también se completan en el gasto de la obra. */
export default function FacturaModal({
  order,
  visible,
  onClose,
  onSaved,
}: {
  order: PurchaseOrderDTO;
  visible: boolean;
  onClose: () => void;
  onSaved: (o: PurchaseOrderDTO) => void;
}) {
  const [tipo, setTipo] = useState<string>("Factura");
  const [numero, setNumero] = useState("");
  const [ruc, setRuc] = useState("");
  const [fecha, setFecha] = useState("");
  const [iva10, setIva10] = useState("");
  const [iva5, setIva5] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!visible) return;
    setTipo(order.facturaTipo ?? "Factura");
    setNumero(order.facturaNumero ?? "");
    setRuc(order.facturaRuc ?? "");
    setFecha(order.facturaFecha ? order.facturaFecha.slice(0, 10) : order.pagadoAt ? order.pagadoAt.slice(0, 10) : hoyPy());
    setIva10(order.iva10 ? fmtMiles(order.iva10) : "");
    setIva5(order.iva5 ? fmtMiles(order.iva5) : "");
    setArchivo(null);
    setError(null);
  }, [visible, order]);

  // En Paraguay el IVA está incluido en el precio: 10 % = total ÷ 11, 5 % = total ÷ 21.
  const total = order.montoPagado ?? order.montoEstimado ?? 0;
  const sugerido10 = total > 0 ? Math.round(total / 11) : null;

  function elegirArchivo(f: File | null) {
    setError(null);
    if (f && f.size > MAX_BYTES) { setError("El archivo pesa más de 4 MB. Probá con una foto más liviana o un PDF comprimido."); setArchivo(null); if (fileRef.current) fileRef.current.value = ""; return; }
    if (f && f.type && !TIPOS_ARCHIVO.includes(f.type)) { setError("Subí una foto (JPG, PNG, WEBP) o un PDF."); setArchivo(null); if (fileRef.current) fileRef.current.value = ""; return; }
    setArchivo(f);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!numero.trim() && !archivo) { setError("Cargá al menos el número o la foto de la factura."); return; }
    setGuardando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("tipo", tipo);
      fd.set("numero", numero.trim());
      fd.set("ruc", ruc.trim());
      if (fecha) fd.set("fecha", fecha);
      fd.set("iva10", String(parseNumero(iva10) ?? ""));
      fd.set("iva5", String(parseNumero(iva5) ?? ""));
      if (archivo) fd.set("file", archivo);
      const res = await fetch(`/api/compras/${order.id}/factura`, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "No se pudo guardar la factura.");
      onSaved(body as PurchaseOrderDTO);
    } catch (err: any) {
      setError(err.message || "No se pudo guardar la factura.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <CModal visible={visible} onClose={onClose} alignment="center" backdrop="static">
      <CModalHeader><CModalTitle>Factura del pedido #{order.numero}</CModalTitle></CModalHeader>
      <CForm onSubmit={guardar} noValidate>
        <CModalBody>
          {error && <CAlert color="danger" role="alert">{error}</CAlert>}
          <CRow className="g-3">
            <CCol xs={6}>
              <CFormLabel htmlFor="fc-tipo">Tipo</CFormLabel>
              <CFormSelect id="fc-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_COMPROBANTE.map((t) => <option key={t} value={t}>{t}</option>)}
              </CFormSelect>
            </CCol>
            <CCol xs={6}>
              <CFormLabel htmlFor="fc-fecha">Fecha</CFormLabel>
              <CFormInput id="fc-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </CCol>
            <CCol xs={7}>
              <CFormLabel htmlFor="fc-num">Número</CFormLabel>
              <CFormInput id="fc-num" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="001-001-0001234" autoFocus />
              {!numero.trim() && <div className="small text-body-secondary mt-1">Sin el número, el pedido sigue en “Falta factura”.</div>}
            </CCol>
            <CCol xs={5}>
              <CFormLabel htmlFor="fc-ruc">RUC del proveedor</CFormLabel>
              <CFormInput id="fc-ruc" value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="80012345-6" />
            </CCol>
            <CCol xs={6}>
              <CFormLabel htmlFor="fc-iva10">IVA 10 % (Gs.)</CFormLabel>
              <CFormInput id="fc-iva10" inputMode="numeric" value={iva10} onChange={(e) => setIva10(e.target.value)} placeholder="0" />
              {sugerido10 !== null && !iva10 && (
                <div className="small text-body-secondary mt-1">
                  Si todo es al 10 %: {fmtGs(sugerido10)} ·{" "}
                  <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setIva10(fmtMiles(sugerido10))}>usar</button>
                </div>
              )}
            </CCol>
            <CCol xs={6}>
              <CFormLabel htmlFor="fc-iva5">IVA 5 % (Gs.)</CFormLabel>
              <CFormInput id="fc-iva5" inputMode="numeric" value={iva5} onChange={(e) => setIva5(e.target.value)} placeholder="0" />
            </CCol>
            <CCol xs={12}>
              <CFormLabel htmlFor="fc-file">Foto o PDF de la factura <span className="text-body-secondary">(opcional, hasta 4 MB)</span></CFormLabel>
              <CFormInput ref={fileRef} id="fc-file" type="file" accept="image/*,application/pdf" onChange={(e) => elegirArchivo((e.target as HTMLInputElement).files?.[0] ?? null)} />
              {order.status !== "pagado" && <div className="small text-body-secondary mt-1">Queda guardada y pasa al gasto de la obra cuando se registre el pago.</div>}
            </CCol>
          </CRow>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="outline" onClick={onClose}>Cancelar</CButton>
          <CButton color="primary" type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar factura"}</CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  );
}
