"use client";

import { useState } from "react";
import { CButton, CFormInput, CFormLabel, CInputGroup } from "@coreui/react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import Icon from "@/components/ui/Icon";

/**
 * Campo de contraseña con botón para verla. Verla ayuda a no equivocarse al
 * escribir en el celular, donde el teclado es chico y no hay forma de revisar.
 */
export default function CampoContrasena({
  id,
  etiqueta,
  valor,
  onCambio,
  autoComplete,
  error,
  ayuda,
  autoFocus,
  onBlur,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  /** Problema de este campo (se muestra debajo, en rojo y con texto). */
  error?: string | null;
  /** Ayuda corta debajo del campo ("Al menos 8 caracteres"). */
  ayuda?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const describe = error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined;
  return (
    <div className="mb-3">
      <CFormLabel htmlFor={id}>{etiqueta}</CFormLabel>
      <CInputGroup className="of-pass">
        <CFormInput
          id={id}
          type={visible ? "text" : "password"}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          invalid={Boolean(error)}
          aria-describedby={describe}
        />
        <CButton
          type="button"
          color="secondary"
          variant="outline"
          className="of-pass-ver"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={id}
          title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          <Icon icon={visible ? EyeSlash : Eye} label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} />
        </CButton>
      </CInputGroup>
      {error && (
        <div id={`${id}-error`} className="of-field-error">
          {error}
        </div>
      )}
      {ayuda && !error && (
        <div id={`${id}-ayuda`} className="of-field-hint">
          {ayuda}
        </div>
      )}
    </div>
  );
}
