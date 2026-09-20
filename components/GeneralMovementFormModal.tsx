"use client";

import { useState } from "react";
import {
  CButton, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea, CAlert, CRow, CCol,
} from "@coreui/react";
import { COST_CENTER_SUGGESTIONS } from "@/lib/itemKinds";
import type { GeneralMovementDTO, GeneralMovementInput, GeneralMovementTipo } from "@/lib/types";

// Extraído de app/movimientos/page.tsx (mismo criterio que components/
// ItemFormModal.tsx) para poder reusarlo también desde /registro-rapido al
// clasificar una captura rápida como gasto general.

export const MEDIO_PAGO_OPTIONS = ["Efectivo", "Transferencia", "Cheque", "Tarjeta", "Crédito"];
export const ESTADO_GENERAL_OPTIONS = ["Pendiente", "Pagado", "Conciliado"];
export const RESPONSABLE_SUGGESTIONS_BASE = ["Ignacio Samaniego", "Hugo Rotela"];

export const EMPTY_GENERAL_FORM: GeneralMovementInput = {
  fecha: new Date().toISOString().slice(0, 10),
  tipo: "ingreso",
  concepto: "",
  categoria: "",
  monto: 0,
  medioPago: "",
  estado: "Pendiente",
  procesadoPor: "",
  responsable: "",
  notas: "",
};

/**
 * Alta/edición de un movimiento general (sin obra) — POST/PUT
 * /api/general-movements. `initialData` prellena el formulario al crear
 * (ignorado si `editing` no es null) — lo usa /registro-rapido para pasar
 * monto/fecha/medioPago/notas ya cargados desde una captura rápida, así no
 * hay que volver a escribirlos ni recordarlos de memoria.
 */
export default function GeneralMovementFormModal({
  editing,
  existingResponsables,
  initialData,
  onClose,
  onSaved,
}: {
  editing: GeneralMovementDTO | null;
  existingResponsables: string[];
  initialData?: Partial<GeneralMovementInput>;
  onClose: () => void;
  onSaved: (g: GeneralMovementDTO) => void;
}) {
  const [form, setForm] = useState<GeneralMovementInput>(
    editing
      ? {
          fecha: editing.fecha,
          tipo: editing.tipo,
          concepto: editing.concepto,
          categoria: editing.categoria ?? "",
          monto: editing.monto,
          medioPago: editing.medioPago ?? "",
          estado: editing.estado ?? "Pendiente",
          procesadoPor: editing.procesadoPor ?? "",
          responsable: editing.responsable ?? "",
          notas: editing.notas ?? "",
        }
      : { ...EMPTY_GENERAL_FORM, ...initialData }
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const responsableSuggestions = Array.from(new Set([...RESPONSABLE_SUGGESTIONS_BASE, ...existingResponsables])).sort();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fecha) { setError("La fecha es obligatoria."); return; }
    if (!form.concepto.trim()) { setError("El concepto es obligatorio."); return; }
    if (!(Number(form.monto) > 0)) { setError("El monto tiene que ser mayor a cero."); return; }
    if (form.tipo === "ingreso" && !(form.responsable ?? "").trim()) {
      setError("El responsable es obligatorio para un ingreso — es quien consiguió ese ingreso, para el reparto de beneficios de Personal.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editing ? `/api/general-movements/${editing.id}` : "/api/general-movements";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const saved: GeneralMovementDTO = await res.json();
      onSaved(saved);
    } catch (err: any) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CModal visible onClose={onClose} alignment="center" size="lg">
      <CModalHeader>
        <CModalTitle>{editing ? "Editar" : "Nuevo"} movimiento general</CModalTitle>
      </CModalHeader>
      <CForm onSubmit={handleSubmit}>
        <CModalBody>
          {error && <CAlert color="danger">{error}</CAlert>}
          <CRow className="mb-3 g-2">
            <CCol md={6}>
              <CFormLabel>Fecha</CFormLabel>
              <CFormInput type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            </CCol>
            <CCol md={6}>
              <CFormLabel>Tipo</CFormLabel>
              <CFormSelect
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as GeneralMovementTipo })}
                required
              >
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </CFormSelect>
            </CCol>
          </CRow>
          <div className="mb-3">
            <CFormLabel>Concepto</CFormLabel>
            <CFormInput
              value={form.concepto}
              onChange={(e) => setForm({ ...form, concepto: e.target.value })}
              required
              placeholder="Ej. Venta de excedente de material, Alquiler de oficina…"
            />
          </div>
          <CRow className="mb-3 g-2">
            <CCol md={6}>
              <CFormLabel>Categoría</CFormLabel>
              <CFormInput
                list="categoria-general-suggestions"
                value={form.categoria ?? ""}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder="Escribí para buscar o elegí una sugerencia…"
              />
              <datalist id="categoria-general-suggestions">
                {COST_CENTER_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </CCol>
            <CCol md={6}>
              <CFormLabel>Monto (Gs.)</CFormLabel>
              <CFormInput
                type="number"
                min={0}
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })}
                required
              />
            </CCol>
          </CRow>
          <CRow className="mb-3 g-2">
            <CCol md={6}>
              <CFormLabel>Medio de pago</CFormLabel>
              <CFormSelect value={form.medioPago ?? ""} onChange={(e) => setForm({ ...form, medioPago: e.target.value })}>
                <option value="">Seleccioná…</option>
                {MEDIO_PAGO_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </CFormSelect>
            </CCol>
            <CCol md={6}>
              <CFormLabel>Estado</CFormLabel>
              <CFormSelect value={form.estado ?? "Pendiente"} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
                {ESTADO_GENERAL_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </CFormSelect>
            </CCol>
          </CRow>
          <CRow className="mb-3 g-2">
            <CCol md={6}>
              <CFormLabel>Procesado por</CFormLabel>
              <CFormInput
                value={form.procesadoPor ?? ""}
                onChange={(e) => setForm({ ...form, procesadoPor: e.target.value })}
                placeholder="Nombre de quien gestionó/cargó este movimiento"
              />
            </CCol>
            <CCol md={6}>
              <CFormLabel>Responsable{form.tipo === "ingreso" && <span className="text-danger"> *</span>}</CFormLabel>
              <CFormInput
                list="responsable-general-suggestions"
                value={form.responsable ?? ""}
                onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                required={form.tipo === "ingreso"}
                placeholder="Quién consiguió este ingreso"
              />
              <datalist id="responsable-general-suggestions">
                {responsableSuggestions.map((r) => <option key={r} value={r} />)}
              </datalist>
              {form.tipo === "ingreso" && (
                <p className="form-hint mb-0 mt-1">Se usa para el reparto de beneficios de Personal — distinto de &quot;Procesado por&quot;.</p>
              )}
            </CCol>
          </CRow>
          <div className="mb-1">
            <CFormLabel>Notas</CFormLabel>
            <CFormTextarea rows={3} value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={onClose} disabled={saving}>Cancelar</CButton>
          <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  );
}
