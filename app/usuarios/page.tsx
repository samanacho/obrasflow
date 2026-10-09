"use client";

import { useCallback, useEffect, useState } from "react";
import { CButton } from "@coreui/react";
import { ArrowClockwise, Info, UserPlus, UsersThree, WarningCircle } from "@phosphor-icons/react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/ui/Icon";
import CampoContrasena from "@/components/auth/CampoContrasena";
import { compartirLink, confirmarAccion, confirmarConTexto, notificar } from "@/lib/ui/alerts";
import { fmtFechaHora, haceCuanto } from "@/lib/dayjs";
import { useSesion } from "@/lib/ui/session";
import "@/app/styles/auth.css";

/**
 * Quiénes pueden entrar a ObrasFlow. Se entra solo con un link de invitación
 * (un solo uso, 48 horas); desactivar a alguien le corta el acceso en pocas
 * horas (lib/auth/token.ts).
 */

interface Usuario {
  id: string;
  username: string;
  name: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
interface Invitacion {
  id: string;
  name: string;
  createdBy: string | null;
  expiresAt: string;
  /** Si viene, es un link de contraseña nueva para ese usuario. */
  userId: string | null;
}
interface Datos {
  yo: string | null;
  usuarios: Usuario[];
  invitaciones: Invitacion[];
}

/** Lanza el error que devuelve la API (para que los diálogos lo muestren adentro). */
async function pedir(url: string, init: RequestInit & { json?: unknown } = {}) {
  const { json, ...rest } = init;
  const r = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "No se pudo completar. Probá de nuevo.");
  return data;
}

function inicial(nombre: string) {
  return (nombre.trim()[0] ?? "?").toUpperCase();
}

export default function UsuariosPage() {
  const yo = useSesion();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setDatos(await pedir("/api/usuarios", { cache: "no-store" }));
    } catch (e: any) {
      setError(e?.message || "No se pudo cargar la lista de usuarios.");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function invitar() {
    let creado: { link: string; vence: string; nombre: string } | null = null;
    const ok = await confirmarConTexto({
      titulo: "Invitar a alguien",
      texto: "Se crea un link para que esa persona elija su usuario y contraseña.",
      etiqueta: "¿Cómo se llama?",
      placeholder: "Por ejemplo: Juan Pérez",
      campo: "linea",
      obligatorio: true,
      confirmar: "Crear link",
      accion: async (nombre) => {
        creado = await pedir("/api/auth/invitaciones", { method: "POST", json: { nombre } });
      },
    });
    if (!ok || !creado) return;
    const inv = creado as { link: string; vence: string; nombre: string };
    void cargar();
    await compartirLink({
      titulo: "Link listo",
      texto: `Mandale este link a ${inv.nombre}. Ahí elige su usuario y contraseña.`,
      link: inv.link,
      mensajeWhatsApp: `Hola ${inv.nombre}, te invito a ObrasFlow. Entrá a este link para crear tu usuario y contraseña (sirve una sola vez y vence en 48 horas): ${inv.link}`,
      nota: `El link sirve una sola vez y vence en 48 horas (${fmtFechaHora(inv.vence)}).`,
    });
  }

  async function restablecer(u: Usuario) {
    let creado: { link: string; vence: string } | null = null;
    const ok = await confirmarAccion({
      titulo: `¿Restablecer la contraseña de ${u.name}?`,
      texto: `Se crea un link para que ${u.name} elija una contraseña nueva. Su usuario sigue siendo "${u.username}" y la contraseña de ahora sirve hasta que use el link.`,
      confirmar: "Crear link",
      accion: async () => {
        creado = await pedir("/api/auth/invitaciones", { method: "POST", json: { usuario: u.username } });
      },
    });
    if (!ok || !creado) return;
    const inv = creado as { link: string; vence: string };
    void cargar();
    await compartirLink({
      titulo: "Link listo",
      texto: `Mandale este link a ${u.name}. Ahí elige su contraseña nueva.`,
      link: inv.link,
      mensajeWhatsApp: `Hola ${u.name}, entrá a este link para elegir una contraseña nueva de ObrasFlow. Tu usuario es "${u.username}" (el link sirve una sola vez y vence en 48 horas): ${inv.link}`,
      nota: `El link sirve una sola vez y vence en 48 horas (${fmtFechaHora(inv.vence)}). Si había otro link de contraseña para ${u.name}, ese deja de servir.`,
    });
  }

  async function cambiarNombre(u: Usuario) {
    const ok = await confirmarConTexto({
      titulo: "Cambiar nombre",
      texto: `Usuario: ${u.username}. El usuario para entrar no cambia.`,
      etiqueta: "Nombre que se ve",
      valor: u.name,
      campo: "linea",
      obligatorio: true,
      confirmar: "Guardar",
      accion: (nombre) => pedir(`/api/usuarios/${u.id}`, { method: "PATCH", json: { nombre } }),
    });
    if (ok) {
      notificar("Nombre cambiado");
      void cargar();
    }
  }

  async function cambiarEstado(u: Usuario) {
    const activar = !u.active;
    const ok = await confirmarAccion({
      titulo: activar ? `¿Activar a ${u.name}?` : `¿Desactivar a ${u.name}?`,
      texto: activar
        ? "Va a poder volver a entrar con su usuario y contraseña."
        : "No va a poder entrar más. Si ahora tiene ObrasFlow abierto, pierde el acceso en unas horas como mucho. Lo que cargó queda guardado.",
      confirmar: activar ? "Activar" : "Desactivar",
      peligro: !activar,
      accion: () => pedir(`/api/usuarios/${u.id}`, { method: "PATCH", json: { activo: activar } }),
    });
    if (ok) {
      notificar(activar ? `${u.name} puede volver a entrar` : `${u.name} quedó desactivado`);
      void cargar();
    }
  }

  const esLocal = yo?.local === true;
  const usuarios = datos?.usuarios ?? [];
  const invitaciones = datos?.invitaciones ?? [];

  return (
    <AppShell crumbs={[{ label: "Usuarios" }]}>
      <div className="usr-head">
        <div>
          <h1 className="of-page-title">Usuarios</h1>
          <p className="module-desc">Quiénes pueden entrar a ObrasFlow. Cada persona entra con su propio usuario, así el historial muestra quién hizo cada cambio.</p>
        </div>
        <CButton color="primary" className="d-inline-flex align-items-center justify-content-center gap-2" onClick={invitar}>
          <Icon icon={UserPlus} size={18} /> Invitar a alguien
        </CButton>
      </div>

      {esLocal && (
        <div className="of-form-info">
          <Icon icon={Info} />
          <span>En la PC local no se pide login; los usuarios se manejan en la app publicada.</span>
        </div>
      )}

      {error && (
        <div className="of-form-error" role="alert">
          <Icon icon={WarningCircle} />
          <span className="flex-grow-1">{error}</span>
          <CButton size="sm" color="secondary" variant="outline" className="d-inline-flex align-items-center gap-1" onClick={() => void cargar()}>
            <Icon icon={ArrowClockwise} size={16} /> Probar de nuevo
          </CButton>
        </div>
      )}

      <section className="usr-section" aria-labelledby="usr-personas">
        <h2 id="usr-personas">Personas con acceso</h2>
        {!datos && !error && (
          <p className="module-desc" role="status">
            Cargando usuarios…
          </p>
        )}
        {datos && usuarios.length === 0 && (
          <div className="of-empty">
            <Icon icon={UsersThree} size={36} />
            <p className="of-empty-title">Todavía no hay usuarios</p>
            <p className="of-empty-sub">Invitá a la primera persona con &quot;Invitar a alguien&quot;: le llega un link para elegir su usuario y contraseña.</p>
          </div>
        )}
        {usuarios.length > 0 && (
          <ul className="usr-list">
            {usuarios.map((u) => {
              const esYo = datos?.yo === u.id;
              return (
                <li key={u.id} className={"usr-row" + (u.active ? "" : " is-off")}>
                  <div className="usr-who">
                    <span className="usr-avatar" aria-hidden="true">
                      {inicial(u.name)}
                    </span>
                    <div className="usr-who-text">
                      <div className="usr-name">
                        {u.name}
                        {esYo && <span className="usr-yo">Vos</span>}
                      </div>
                      <div className="usr-user">Usuario: {u.username}</div>
                    </div>
                  </div>
                  <div className="usr-when" title={u.lastLoginAt ? fmtFechaHora(u.lastLoginAt) : undefined}>
                    {u.lastLoginAt ? (
                      <>
                        Último ingreso <strong>{haceCuanto(u.lastLoginAt)}</strong>
                      </>
                    ) : (
                      <>Todavía no entró</>
                    )}
                  </div>
                  <span className={"usr-estado " + (u.active ? "is-on" : "is-off")}>{u.active ? "Activo" : "Desactivado"}</span>
                  <div className="usr-actions">
                    <CButton size="sm" color="secondary" variant="outline" onClick={() => cambiarNombre(u)} aria-label={`Cambiar el nombre de ${u.name}`}>
                      Cambiar nombre
                    </CButton>
                    {!esYo && u.active && (
                      <CButton size="sm" color="secondary" variant="outline" onClick={() => restablecer(u)} aria-label={`Restablecer la contraseña de ${u.name}`}>
                        Restablecer contraseña
                      </CButton>
                    )}
                    {esYo ? (
                      <span className="usr-self" title="No podés desactivarte a vos mismo">
                        Es tu usuario
                      </span>
                    ) : u.active ? (
                      <CButton size="sm" color="danger" variant="outline" onClick={() => cambiarEstado(u)} aria-label={`Desactivar a ${u.name}`}>
                        Desactivar
                      </CButton>
                    ) : (
                      <CButton size="sm" color="success" variant="outline" onClick={() => cambiarEstado(u)} aria-label={`Activar a ${u.name}`}>
                        Activar
                      </CButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {invitaciones.length > 0 && (
        <section className="usr-section" aria-labelledby="usr-invitaciones">
          <h2 id="usr-invitaciones">Invitaciones sin usar</h2>
          <p className="module-desc">Links que todavía nadie usó. Si alguien perdió el suyo, creale uno nuevo; este vence solo.</p>
          <ul className="usr-list">
            {invitaciones.map((i) => (
              <li key={i.id} className="usr-inv">
                <span className="usr-name">{i.userId ? `Contraseña nueva para ${i.name}` : i.name}</span>
                <span className="meta" title={fmtFechaHora(i.expiresAt)}>
                  Vence {haceCuanto(i.expiresAt)}
                  {i.createdBy ? ` · la creó ${i.createdBy}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {yo && !esLocal && datos?.yo && <MiContrasena userId={datos.yo} usuario={yo.usuario ?? ""} />}
    </AppShell>
  );
}

/** Cambiar la propia contraseña (cada uno la suya). */
function MiContrasena({ userId, usuario }: { userId: string; usuario: string }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [tocado, setTocado] = useState({ nueva: false, repetir: false });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorNueva = tocado.nueva && nueva.length < 8 ? "Tiene que tener al menos 8 caracteres." : null;
  const errorRepetir = tocado.repetir && repetir !== nueva ? "Las dos contraseñas no son iguales." : null;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;
    setTocado({ nueva: true, repetir: true });
    if (!actual) return setError("Escribí tu contraseña actual.");
    if (nueva.length < 8 || repetir !== nueva) return setError("Revisá la contraseña nueva: hay un problema marcado abajo.");
    setGuardando(true);
    setError(null);
    try {
      await pedir(`/api/usuarios/${userId}`, { method: "PATCH", json: { contrasenaActual: actual, contrasenaNueva: nueva } });
      setActual("");
      setNueva("");
      setRepetir("");
      setTocado({ nueva: false, repetir: false });
      notificar("Listo, cambiaste tu contraseña");
    } catch (err: any) {
      setError(err?.message || "No se pudo cambiar la contraseña.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="usr-section" aria-labelledby="usr-mi-contrasena">
      <h2 id="usr-mi-contrasena">Mi contraseña</h2>
      <p className="module-desc">Para cambiarla necesitás la actual. Si te la olvidaste, pedile a otra persona con usuario que entre acá y toque &quot;Restablecer contraseña&quot; al lado de tu nombre.</p>
      <form className="usr-pass" onSubmit={guardar} noValidate>
        {/* Para que el navegador sepa de qué usuario es la contraseña que guarda. */}
        <input type="text" name="username" autoComplete="username" value={usuario} hidden readOnly />
        {error && (
          <div className="of-form-error" role="alert">
            <Icon icon={WarningCircle} />
            <span>{error}</span>
          </div>
        )}
        <CampoContrasena id="pass-actual" etiqueta="Contraseña actual" valor={actual} onCambio={setActual} autoComplete="current-password" />
        <CampoContrasena
          id="pass-nueva"
          etiqueta="Contraseña nueva"
          valor={nueva}
          onCambio={setNueva}
          onBlur={() => setTocado((t) => ({ ...t, nueva: true }))}
          autoComplete="new-password"
          ayuda="Al menos 8 caracteres."
          error={errorNueva}
        />
        <CampoContrasena
          id="pass-repetir"
          etiqueta="Repetir contraseña nueva"
          valor={repetir}
          onCambio={setRepetir}
          onBlur={() => setTocado((t) => ({ ...t, repetir: true }))}
          autoComplete="new-password"
          error={errorRepetir}
        />
        <CButton type="submit" color="primary" variant="outline" disabled={guardando} style={{ minHeight: 44 }}>
          {guardando ? "Guardando…" : "Cambiar contraseña"}
        </CButton>
      </form>
    </section>
  );
}
