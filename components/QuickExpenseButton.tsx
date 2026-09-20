"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CButton, CBadge, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CAlert,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilBolt } from "@coreui/icons";
import { MEDIO_PAGO_OPTIONS } from "@/components/GeneralMovementFormModal";
import type { QuickExpenseDTO } from "@/lib/types";

/**
 * Botón siempre visible (en el header, ver AppShell) para anotar un pago en
 * el momento en que sucede — pedido puntual del usuario: no tiene tiempo de
 * elegir obra/rubro/proveedor ahí mismo, solo quiere que quede el monto, el
 * medio de pago y una nota antes de que se le olvide. Se clasifica después,
 * con calma, en /registro-rapido — ahí es donde se convierte en un
 * movimiento real de obra o un gasto general.
 */
export default function QuickExpenseButton() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [monto, setMonto] = useState("");
  const [medioPago, setMedioPago] = useState("Efectivo");
  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    fetch("/api/quick-expenses")
      .then((r) => (r.ok ? r.json() : []))
      .then((items: QuickExpenseDTO[]) => setPendingCount(items.filter((i) => !i.resuelto).length))
      .catch(() => {});
  }, []);

  function openModal() {
    setMonto("");
    setMedioPago("Efectivo");
    setNota("");
    setFecha(new Date().toISOString().slice(0, 10));
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const montoNum = Number(monto);
    if (!(montoNum > 0)) { setError("Cargá un monto mayor a cero."); return; }
    if (!medioPago) { setError("Elegí el medio de pago."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/quick-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, monto: montoNum, medioPago, nota: nota.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setPendingCount((c) => (c ?? 0) + 1);
      setOpen(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err: any) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <CButton color="warning" variant={savedFlash ? undefined : "outline"} size="sm" onClick={openModal} title="Anotar un pago rápido, sin elegir obra todavía">
        <CIcon icon={cilBolt} className="me-1" />
        {savedFlash ? "¡Guardado! ✓" : "Registro rápido"}
        {!savedFlash && pendingCount !== null && pendingCount > 0 && (
          <CBadge color="danger" className="ms-1">{pendingCount}</CBadge>
        )}
      </CButton>

      {open && (
        <CModal visible onClose={() => setOpen(false)} alignment="center">
          <CModalHeader>
            <CModalTitle>⚡ Registro rápido</CModalTitle>
          </CModalHeader>
          <CForm onSubmit={handleSubmit}>
            <CModalBody>
              {error && <CAlert color="danger">{error}</CAlert>}
              <p className="form-hint mt-0">
                Solo lo esencial, para no perder tiempo ahora. Después lo clasificás con calma en{" "}
                <Link href="/registro-rapido">Registro rápido</Link>.
              </p>
              <div className="mb-3">
                <CFormLabel>Monto (Gs.)</CFormLabel>
                <CFormInput type="number" min={0} autoFocus value={monto} onChange={(e) => setMonto(e.target.value)} required placeholder="0" />
              </div>
              <div className="mb-3">
                <CFormLabel>Medio de pago</CFormLabel>
                <CFormSelect value={medioPago} onChange={(e) => setMedioPago(e.target.value)} required>
                  {MEDIO_PAGO_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                </CFormSelect>
              </div>
              <div className="mb-3">
                <CFormLabel>Fecha</CFormLabel>
                <CFormInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
              </div>
              <div className="mb-1">
                <CFormLabel>Nota (opcional, pero ayuda después)</CFormLabel>
                <CFormInput value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. combustible, materiales ferretería…" />
              </div>
            </CModalBody>
            <CModalFooter>
              <CButton color="secondary" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancelar</CButton>
              <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
            </CModalFooter>
          </CForm>
        </CModal>
      )}
    </>
  );
}
