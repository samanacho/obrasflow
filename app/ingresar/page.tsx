"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CButton, CFormCheck, CFormInput, CFormLabel } from "@coreui/react";
import { Info, WarningCircle } from "@phosphor-icons/react";
import Icon from "@/components/ui/Icon";
import PantallaIngreso from "@/components/auth/PantallaIngreso";
import CampoContrasena from "@/components/auth/CampoContrasena";
import { olvidarSesion, volverSeguro } from "@/lib/ui/session";

/**
 * Pantalla de ingreso. Funciona sin haber entrado (middleware.ts la deja
 * pasar). Al entrar vuelve a la pantalla que se quería abrir (?volver=).
 */
export default function IngresarPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [recordar, setRecordar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [esLocal, setEsLocal] = useState(false);

  // En la PC local no hace falta ingresar: se avisa para que nadie se trabe acá.
  useEffect(() => {
    fetch("/api/auth/yo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((y) => setEsLocal(Boolean(y?.local)))
      .catch(() => {});
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    if (!usuario.trim() || !contrasena) {
      setError("Escribí tu usuario y tu contraseña.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/ingresar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, contrasena, recordar }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || "No se pudo ingresar. Probá de nuevo.");
        setEnviando(false);
        return;
      }
      olvidarSesion();
      router.replace(volverSeguro(new URLSearchParams(window.location.search).get("volver")));
      // Queda "Entrando…" hasta que cargue la pantalla siguiente.
    } catch {
      setError("No hay conexión con ObrasFlow. Revisá internet y probá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <PantallaIngreso
      titulo="Ingresar"
      subtitulo="Entrá con tu usuario y contraseña."
      nota="¿No tenés usuario? Pedile un link de invitación a quien administra ObrasFlow."
    >
      {esLocal && (
        <div className="of-form-info">
          <Icon icon={Info} />
          <span>
            Estás en la PC local: acá no hace falta ingresar. <Link href="/">Ir al inicio</Link>
          </span>
        </div>
      )}
      <form onSubmit={entrar} noValidate>
        {error && (
          <div className="of-form-error" role="alert">
            <Icon icon={WarningCircle} />
            <span>{error}</span>
          </div>
        )}
        <div className="mb-3">
          <CFormLabel htmlFor="ing-usuario">Usuario</CFormLabel>
          <CFormInput
            id="ing-usuario"
            name="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
        </div>
        <CampoContrasena id="ing-contrasena" etiqueta="Contraseña" valor={contrasena} onCambio={setContrasena} autoComplete="current-password" />
        <CFormCheck id="ing-recordar" label="Recordarme en este dispositivo (30 días)" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
        <CButton type="submit" color="primary" className="of-auth-submit" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </CButton>
      </form>
    </PantallaIngreso>
  );
}
