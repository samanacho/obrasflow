"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CAlert, CButton, CCol, CForm, CFormInput, CFormLabel, CFormSelect, CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle, CRow,
} from "@coreui/react";
import Select2 from "@/components/ui/Select2";
import { useProveedores } from "./shared";
import { MEDIOS_PAGO, fmtCantUnidad, fmtGs, fmtMiles, hoyPy, parseNumero } from "@/lib/compras/labels";
import type { PurchaseOrderDTO } from "@/lib/compras/core";

/**
 * Registrar el pago de un pedido aprobado. Crea el gasto en la Ejecución de
 * la obra. El total se suma solo con los precios de cada material, pero se
 * puede escribir a mano (descuentos, flete, redondeo).
 */
export default function PagarModal({
  order,
  visible,
  onClose,
  onPaid,
}: {
  order: PurchaseOrderDTO;
  visible: boolean;
  onClose: () => void;
  onPaid: (o: PurchaseOrderDTO) => void;
}) {
  const { options: proveedores } = useProveedores(visible);
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [monto, setMonto] = useState("");
  const [montoManual, setMontoManual] = useState(false);
  const [fecha, setFecha] = useState(hoyPy());
  const [medio, setMedio] = useState<string>("Efectivo");
  const [supplierId, setSupplierId] = useState("");
  const [proveedorNombre, setProveedorNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Cada vez que se abre arranca con los precios del presupuesto (o los ya cargados).
  useEffect(() => {
    if (!visible) return;
    const p: Record<string, string> = {};
    for (const l of order.lines) {
      const v = l.precioUnitario ?? l.presupuesto?.precioUnitario ?? null;
      p[l.id] = v === null ? "" : fmtMiles(v);
    }
    setPrecios(p);
    setMontoManual(false);
    setMonto(order.montoEstimado ? fmtMiles(order.montoEstimado) : "");
    setFecha(hoyPy());
    setSupplierId(order.supplierId ?? "");
    setProveedorNombre(order.supplierId ? "" : order.proveedorNombre ?? "");
    setError(null);
  }, [visible, order]);

  const suma = useMemo(
    () => Math.round(order.lines.reduce((s, l) => s + (parseNumero(precios[l.id]) ?? 0) * l.cantidad, 0)),
    [precios, order.lines]
  );
  const montoFinal = montoManual ? parseNumero(monto) ?? 0 : suma || parseNumero(monto) || 0;

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    if (!(montoFinal > 0)) { setError("Escribí cuánto se pagó."); return; }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/compras/${order.id}/pagar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monto: montoFinal,
          fecha,
          medioPago: medio,
          supplierId: supplierId || null,
          proveedorNombre: supplierId ? null : proveedorNombre.trim() || null,
          precios: order.lines
            .map((l) => ({ lineId: l.id, precioUnitario: parseNumero(precios[l.id]) }))
            .filter((p) => p.precioUnitario !== null),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "No se pudo registrar el pago.");
      onPaid(body as PurchaseOrderDTO);
    } catch (err: any) {
      setError(err.message || "No se pudo registrar el pago.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <CModal visible={visible} onClose={onClose} alignment="center" size="lg" backdrop="static">
      <CModalHeader><CModalTitle>Registrar pago del pedido #{order.numero}</CModalTitle></CModalHeader>
      <CForm onSubmit={pagar} noValidate>
        <CModalBody>
          {error && <CAlert color="danger" role="alert">{error}</CAlert>}
          <p className="module-desc mt-0">
            Al registrar el pago se carga el gasto en la Ejecución de <strong>{order.projectName}</strong> (rubro Materiales).
          </p>

          <fieldset className="mb-3">
            <legend className="form-label fs-6 mb-1">Precio de cada material</legend>
            <div className="table-wrap">
              <table className="table table-sm align-middle mb-1 cmp-lineas">
                <thead>
                  <tr><th>Material</th><th className="num">Cantidad</th><th className="num" style={{ width: 160 }}>Precio unitario (Gs.)</th><th className="num">Subtotal</th></tr>
                </thead>
                <tbody>
                  {order.lines.map((l) => {
                    const p = parseNumero(precios[l.id]);
                    return (
                      <tr key={l.id}>
                        <td>{l.descripcion}</td>
                        <td className="num">{fmtCantUnidad(l.cantidad, l.unidad)}</td>
                        <td>
                          <CFormInput
                            size="sm" inputMode="numeric" className="text-end"
                            aria-label={`Precio unitario de ${l.descripcion}`}
                            value={precios[l.id] ?? ""}
                            placeholder={l.presupuesto ? fmtMiles(l.presupuesto.precioUnitario) : "0"}
                            onChange={(e) => setPrecios({ ...precios, [l.id]: e.target.value })}
                          />
                        </td>
                        <td className="num">{p !== null ? fmtGs(p * l.cantidad) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="small text-body-secondary mb-0">Vienen con el precio del presupuesto: cambialo por el precio real de la factura.</p>
          </fieldset>

          <CRow className="g-3">
            <CCol md={6}>
              <CFormLabel htmlFor="pg-monto">Total pagado (Gs.)</CFormLabel>
              <CFormInput
                id="pg-monto" inputMode="numeric" className="fw-semibold"
                value={montoManual ? monto : suma ? fmtMiles(suma) : monto}
                onChange={(e) => { setMontoManual(true); setMonto(e.target.value); }}
                required
              />
              <div className="small text-body-secondary mt-1">
                {montoManual && suma > 0 && suma !== montoFinal ? (
                  <>Suma de los materiales: {fmtGs(suma)} · <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setMontoManual(false)}>usar la suma</button></>
                ) : suma > 0 ? "Se suma solo con los precios de arriba. Podés cambiarlo." : "Escribí el total de la factura."}
              </div>
            </CCol>
            <CCol md={3} xs={6}>
              <CFormLabel htmlFor="pg-fecha">Fecha del pago</CFormLabel>
              <CFormInput id="pg-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </CCol>
            <CCol md={3} xs={6}>
              <CFormLabel htmlFor="pg-medio">Medio de pago</CFormLabel>
              <CFormSelect id="pg-medio" value={medio} onChange={(e) => setMedio(e.target.value)}>
                {MEDIOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
              </CFormSelect>
            </CCol>
            <CCol md={6}>
              <CFormLabel htmlFor="pg-prov">Proveedor</CFormLabel>
              <Select2 id="pg-prov" options={proveedores} value={supplierId} onChange={setSupplierId} placeholder="Elegí el proveedor" allowClear />
            </CCol>
            {!supplierId && (
              <CCol md={6}>
                <CFormLabel htmlFor="pg-prov-txt">¿No está en la lista? Escribí el nombre</CFormLabel>
                <CFormInput id="pg-prov-txt" value={proveedorNombre} onChange={(e) => setProveedorNombre(e.target.value)} placeholder="Ej.: Ferretería del barrio" />
              </CCol>
            )}
          </CRow>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="outline" onClick={onClose}>Cancelar</CButton>
          <CButton color="primary" type="submit" disabled={guardando}>
            {guardando ? "Registrando…" : `Registrar pago de ${fmtGs(montoFinal)}`}
          </CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  );
}
