"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CButton, CFormInput, CFormLabel } from "@coreui/react";
import { WarningCircle } from "@phosphor-icons/react";
import Icon from "@/components/ui/Icon";
import PantallaIngreso from "@/components/auth/PantallaIngreso";
import CampoContrasena from "@/components/auth/CampoContrasena";
import { olvidarSesion } from "@/lib/ui/session";

/**
 * Link de invitación: la persona elige su usuario y contraseña y queda
 * adentro. Si el link es para restablecer la contraseña, solo elige la
 * contraseña nueva. El link sirve una sola vez (app/api/auth/invitacion).
 */

/** Igual que normalizeUsername (lib/auth/password.ts): lo que se ve es lo que se guarda. */
function limpiarUsuario(u: string): string {
  return u
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

const MIN_CONTRASENA = 8;

type Estado = { paso: "cargando" } | { paso: "invalido"; error: string } | { paso: "formulario" };

export default function InvitacionPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const token = decodeURIComponent(params.token);
  const [estado, setEstado] = useState<Estado>({ paso: "cargando" });
  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  /** Link para restablecer la contraseña de un usuario que ya existe. */
  const [restablecer, setRestablecer] = useState(false);
  const [contrasena, setContrasena] = useState("");
  const [repetir, setRepetir] = useState("");
  const [tocado, setTocado] = useState({ contrasena: false, repetir: false });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/auth/invitacion?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) return setEstado({ paso: "invalido", error: data.error || "Este link de invitación no sirve. Pedí uno nuevo." });
        setNombre(data.nombre ?? "");
        setRestablecer(Boolean(data.restablecer));
        setUsuario(data.restablecer ? data.restablecer.usuario : limpiarUsuario(data.usuarioSugerido ?? ""));
        setEstado({ paso: "formulario" });
      })
      .catch(() => setEstado({ paso: "invalido", error: "No hay conexión con ObrasFlow. Revisá internet y volvé a abrir el link." }));
  }, [token]);

  // Validación al salir del campo (no mientras se escribe).
  const errorContrasena = tocado.contrasena && contrasena.length < MIN_CONTRASENA ? `Tiene que tener al menos ${MIN_CONTRASENA} caracteres.` : null;
  const errorRepetir = tocado.repetir && repetir !== contrasena ? "Las dos contraseñas no son iguales." : null;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setTocado({ contrasena: true, repetir: true });
    if (!restablecer && !nombre.trim()) return setError("Escribí tu nombre.");
    if (!restablecer && usuario.length < 3) return setError("El usuario tiene que tener al menos 3 letras o números.");
    if (contrasena.length < MIN_CONTRASENA || repetir !== contrasena) return setError("Revisá la contraseña: hay un problema marcado abajo.");
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/invitacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(restablecer ? { token, contrasena } : { token, nombre: nombre.trim(), usuario, contrasena }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 201) {
        olvidarSesion();
        router.replace("/");
        return;
      }
      if (r.status === 404) {
        setEstado({ paso: "invalido", error: data.error || "Este link de invitación ya se usó o venció. Pedí uno nuevo." });
        return;
      }
      setError(data.error || (restablecer ? "No se pudo cambiar la contraseña. Probá de nuevo." : "No se pudo crear el usuario. Probá de nuevo."));
      setEnviando(false);
    } catch {
      setError("No hay conexión con ObrasFlow. Revisá internet y probá de nuevo.");
      setEnviando(false);
    }
  }

  if (estado.paso === "cargando") {
    return (
      <PantallaIngreso titulo="Crear tu usuario">
        <p className="of-auth-sub mb-0" role="status">
          Revisando el link…
        </p>
      </PantallaIngreso>
    );
  }

  if (estado.paso === "invalido") {
    return (
      <PantallaIngreso titulo="El link no sirve">
        <div className="of-form-error" role="alert">
          <Icon icon={WarningCircle} />
          <span>{estado.error}</span>
        </div>
        <p className="of-auth-sub">Pedile a quien administra ObrasFlow que te mande un link nuevo. Si ya tenés usuario, entrá directamente.</p>
        <Link href="/ingresar" className="btn btn-outline-primary of-auth-submit d-inline-flex align-items-center justify-content-center">
          Ir a ingresar
        </Link>
      </PantallaIngreso>
    );
  }

  return (
    <PantallaIngreso
      titulo={restablecer ? "Contraseña nueva" : "Crear tu usuario"}
      subtitulo={
        restablecer
          ? `Hola ${nombre}. Elegí la contraseña nueva con la que vas a entrar.`
          : "Te invitaron a ObrasFlow. Elegí con qué usuario y contraseña vas a entrar."
      }
      nota={
        restablecer ? (
          <>
            ¿Te acordaste la contraseña? <Link href="/ingresar">Entrá acá</Link>
          </>
        ) : (
          <>
            ¿Ya tenés usuario? <Link href="/ingresar">Entrá acá</Link>
          </>
        )
      }
    >
      <form onSubmit={crear} noValidate>
        {error && (
          <div className="of-form-error" role="alert">
            <Icon icon={WarningCircle} />
            <span>{error}</span>
          </div>
        )}
        {restablecer ? (
          <div className="mb-3">
            <CFormLabel htmlFor="inv-usuario">Tu usuario</CFormLabel>
            <CFormInput id="inv-usuario" name="username" value={usuario} autoComplete="username" readOnly aria-describedby="inv-usuario-ayuda" />
            <div id="inv-usuario-ayuda" className="of-field-hint">
              Es lo que escribís para entrar. No cambia.
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3">
              <CFormLabel htmlFor="inv-nombre">Tu nombre</CFormLabel>
              <CFormInput id="inv-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={80} aria-describedby="inv-nombre-ayuda" />
              <div id="inv-nombre-ayuda" className="of-field-hint">
                Así te van a ver los demás en ObrasFlow.
              </div>
            </div>
            <div className="mb-3">
              <CFormLabel htmlFor="inv-usuario">Usuario</CFormLabel>
              <CFormInput
                id="inv-usuario"
                name="username"
                value={usuario}
                onChange={(e) => setUsuario(limpiarUsuario(e.target.value))}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={40}
                aria-describedby="inv-usuario-ayuda"
              />
              <div id="inv-usuario-ayuda" className="of-field-hint">
                Es lo que vas a escribir para entrar. Solo minúsculas, números, punto y guion.
              </div>
            </div>
          </>
        )}
        <CampoContrasena
          id="inv-contrasena"
          etiqueta="Contraseña"
          valor={contrasena}
          onCambio={setContrasena}
          onBlur={() => setTocado((t) => ({ ...t, contrasena: true }))}
          autoComplete="new-password"
          ayuda={`Al menos ${MIN_CONTRASENA} caracteres.`}
          error={errorContrasena}
        />
        <CampoContrasena
          id="inv-repetir"
          etiqueta="Repetir contraseña"
          valor={repetir}
          onCambio={setRepetir}
          onBlur={() => setTocado((t) => ({ ...t, repetir: true }))}
          autoComplete="new-password"
          error={errorRepetir}
        />
        <CButton type="submit" color="primary" className="of-auth-submit" disabled={enviando}>
          {restablecer ? (enviando ? "Guardando…" : "Guardar y entrar") : enviando ? "Creando…" : "Crear mi usuario"}
        </CButton>
      </form>
    </PantallaIngreso>
  );
}
