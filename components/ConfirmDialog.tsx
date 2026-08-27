"use client";

import { CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter, CButton, CAlert } from "@coreui/react";

/**
 * Reemplazo de window.confirm() para toda la app. El diálogo nativo del
 * navegador puede quedar silenciado sin avisar (Chrome lo bloquea solo
 * después de varios usos seguidos en la misma pestaña, o una extensión lo
 * suprime) — ahí el botón que lo dispara "no hace nada" sin ningún error
 * visible. Este modal es parte de la propia UI, así que no depende de que
 * el navegador decida mostrar o no un diálogo.
 *
 * Uso: guardar en estado el ítem a confirmar (o null si no hay ninguno),
 * pasar `open={Boolean(ese estado)}` y disparar la acción real recién en
 * `onConfirm`.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Eliminar",
  confirmColor = "danger",
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: "danger" | "primary";
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <CModal visible onClose={onCancel} alignment="center">
      <CModalHeader>
        <CModalTitle>{title}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {error && <CAlert color="danger">{error}</CAlert>}
        <p className="mb-0">{message}</p>
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</CButton>
        <CButton color={confirmColor} onClick={onConfirm} disabled={busy}>{busy ? "Un momento…" : confirmLabel}</CButton>
      </CModalFooter>
    </CModal>
  );
}
