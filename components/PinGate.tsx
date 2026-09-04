"use client";

import { useEffect, useState } from "react";
import { CCard, CCardBody, CForm, CFormInput, CButton, CAlert } from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilLockLocked } from "@coreui/icons";

/**
 * Gate simple por PIN para tapar el contenido de un módulo — pedido
 * puntual para Personal. IMPORTANTE: esto NO es autenticación real (no hay
 * sistema de usuarios/login en la app, ver decisiones anteriores de la
 * sesión) — el PIN vive en el bundle de JS del cliente, así que cualquiera
 * con acceso al código fuente lo puede leer. Es un freno liviano para que
 * no cualquiera que pase por el navegador entre sin querer, no una
 * protección seria de datos sensibles.
 *
 * El desbloqueo se guarda en sessionStorage (por pestaña/sesión del
 * navegador, no localStorage) — se vuelve a pedir el PIN la próxima vez
 * que se abra el navegador, no queda desbloqueado para siempre en una
 * compu compartida.
 */
export default function PinGate({
  pin, storageKey, title, children,
}: {
  pin: string;
  storageKey: string;
  title?: string;
  children: React.ReactNode;
}) {
  // null = todavía no se chequeó sessionStorage — evita el parpadeo de
  // mostrar el formulario un instante aunque ya esté desbloqueado.
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ok = false;
    try {
      ok = sessionStorage.getItem(storageKey) === "1";
    } catch {
      /* sessionStorage puede no estar disponible (navegación privada, etc.) — se pide el PIN igual. */
    }
    setUnlocked(ok);
  }, [storageKey]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (value === pin) {
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {
        /* si no se puede guardar, igual se deja pasar esta vez — no vale la pena bloquear por esto. */
      }
      setUnlocked(true);
      setError(null);
    } else {
      setError("PIN incorrecto.");
      setValue("");
    }
  }

  if (unlocked === null) return null;
  if (unlocked) return <>{children}</>;

  return (
    <div className="d-flex justify-content-center pt-5">
      <CCard style={{ maxWidth: 360, width: "100%" }}>
        <CCardBody className="text-center">
          <CIcon icon={cilLockLocked} size="xl" className="mb-3 text-body-secondary" />
          <h2 className="h5 mb-2">{title || "Acceso restringido"}</h2>
          <p className="module-desc mb-3">Ingresá el PIN para entrar a este módulo.</p>
          <CForm onSubmit={handleSubmit}>
            {error && <CAlert color="danger" className="py-2">{error}</CAlert>}
            <CFormInput
              type="password"
              inputMode="numeric"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="PIN"
              className="text-center mb-3"
            />
            <CButton color="primary" type="submit" className="w-100">Acceder</CButton>
          </CForm>
        </CCardBody>
      </CCard>
    </div>
  );
}
