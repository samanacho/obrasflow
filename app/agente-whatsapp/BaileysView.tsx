"use client";

import { useCallback, useEffect, useState } from "react";
import { CCard, CCardBody, CCardHeader, CBadge, CButton, CForm, CFormInput, CAlert, CSpinner } from "@coreui/react";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { PanelData } from "./page";

// Vista de la conexión por QR (Baileys): estado de la conexión, el QR para
// vincular la cuenta y los pasos para dejar el conector funcionando. El
// conector (worker/whatsapp-baileys.mts) corre en una PC y escribe el estado
// en la base; esta pantalla lo lee cada pocos segundos.

interface SessionInfo {
  model: string;
  effort: string;
  allowedCount: number;
  ai: { ok: boolean; detail: string };
  startedAt: string;
}
interface Session {
  exists: boolean;
  workerOnline: boolean;
  status: "desconectado" | "conectando" | "esperando_qr" | "conectado" | string;
  heartbeatAt: string | null;
  phone: string | null;
  name: string | null;
  lastError: string | null;
  pendingCommand: string | null;
  qr: string | null;
  unlocked: boolean;
  info: SessionInfo | null;
}

type StepState = "done" | "todo" | "warn" | "info";
const STEP_BADGE: Record<StepState, { label: string; color: string; dark?: boolean }> = {
  done: { label: "Listo", color: "success" },
  todo: { label: "Pendiente", color: "secondary" },
  warn: { label: "Revisar", color: "warning" },
  info: { label: "Referencia", color: "light", dark: true },
};

const ENV_TEMPLATE = `POSTGRES_PRISMA_URL="(copialo de Vercel > Storage > tu base > .env.local)"
POSTGRES_URL_NON_POOLING="(copialo de Vercel > Storage > tu base > .env.local)"
ANTHROPIC_API_KEY="(tu clave de platform.claude.com)"
ANTHROPIC_MODEL="claude-sonnet-5"
ANTHROPIC_EFFORT="low"
WHATSAPP_ALLOWED_NUMBERS="595981111111:Ignacio Samaniego,595982222222:Hugo Rotela"
APP_BASE_URL="https://obrasflow-app.vercel.app"`;
const START_COMMAND = "npm run wa:conector";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}
function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function BaileysView({
  data,
  panelKey,
  onUnlock,
  onLock,
  onShowCloud,
  copy,
  activity,
}: {
  data: PanelData;
  panelKey: string | null;
  onUnlock: (key: string) => Promise<string | null>;
  onLock: () => void;
  onShowCloud: () => void;
  copy: (text: string, what: string) => void;
  activity: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [panelSecret, setPanelSecret] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [commandBusy, setCommandBusy] = useState<string | null>(null);
  const [commandMsg, setCommandMsg] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/session", { headers: panelKey ? { "x-panel-key": panelKey } : {}, cache: "no-store" });
      if (res.ok) setSession(await res.json());
    } catch {
      /* se reintenta en el próximo ciclo */
    }
  }, [panelKey]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [poll]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!keyInput.trim()) return;
    setUnlocking(true);
    setKeyError(await onUnlock(keyInput.trim()));
    setUnlocking(false);
    setKeyInput("");
  }

  async function sendCommand(command: "logout" | "restart") {
    if (!panelKey) return;
    setCommandBusy(command);
    setCommandMsg(null);
    try {
      const res = await fetch("/api/whatsapp/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-panel-key": panelKey },
        body: JSON.stringify({ command }),
      });
      if (res.status === 401) return onLock();
      setCommandMsg(
        command === "logout"
          ? "Pedido enviado: el conector desvincula la cuenta en unos segundos y muestra un QR nuevo."
          : "Pedido enviado: el conector se reconecta en unos segundos."
      );
      setTimeout(poll, 1500);
    } finally {
      setCommandBusy(null);
    }
  }

  const s = session;
  const connected = s?.workerOnline && s.status === "conectado";
  const connection = !s
    ? { label: "Consultando…", color: "secondary" }
    : !s.workerOnline
      ? { label: "Conector apagado", color: "secondary" }
      : s.status === "conectado"
        ? { label: "Conectado", color: "success" }
        : s.status === "esperando_qr"
          ? { label: "Esperando QR", color: "warning" }
          : { label: "Conectando", color: "info" };

  const unlockForm = (
    <CForm onSubmit={unlock} className="d-flex gap-2 flex-wrap">
      <CFormInput
        type="password"
        autoComplete="off"
        value={keyInput}
        onChange={(e) => setKeyInput(e.target.value)}
        placeholder="Clave del panel"
        style={{ maxWidth: 280 }}
      />
      <CButton type="submit" color="primary" disabled={unlocking || !keyInput.trim()}>
        {unlocking ? <CSpinner size="sm" /> : "Entrar"}
      </CButton>
      {keyError && <div className="w-100 small text-danger">{keyError}</div>}
    </CForm>
  );

  const copyBlock = (label: string, value: string) => (
    <div className="mb-2">
      <div className="d-flex align-items-center gap-2 mb-1">
        <span className="small text-body-secondary">{label}</span>
        <CButton size="sm" color="secondary" variant="outline" className="ms-auto" onClick={() => copy(value, label)}>Copiar</CButton>
      </div>
      <pre className="small p-2 border rounded mb-0" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{value}</pre>
    </div>
  );

  // ------------------------------------------------------------------ tarjeta de conexión
  function connectionBody() {
    if (!s) return <p className="state-message py-3 mb-0">Consultando el estado…</p>;
    if (!s.workerOnline) {
      return (
        <>
          <p className="mb-2">
            ⚪ <strong>El conector no está corriendo.</strong> Es el programa que mantiene la sesión de WhatsApp abierta; tiene
            que estar encendido en una PC para que el agente responda (pasos 3 y 4).
          </p>
          {copyBlock("En la carpeta del proyecto (E:\\Desarrollos\\ObrasFlow), en una terminal:", START_COMMAND)}
          {s.heartbeatAt && <p className="small text-body-secondary mb-0">Última señal del conector: {fmtDateTime(s.heartbeatAt)}.</p>}
          {s.lastError && <p className="small text-body-secondary mb-0">{s.lastError}</p>}
        </>
      );
    }
    if (s.status === "esperando_qr") {
      if (!s.qr) {
        return (
          <>
            <p className="mb-2">
              El conector está listo para vincular. Para ver el QR, ingresá la clave del panel (<code>WHATSAPP_PANEL_KEY</code>):
              así nadie más puede vincular su cuenta al agente.
            </p>
            {unlockForm}
          </>
        );
      }
      return (
        <div className="d-flex flex-wrap gap-4 align-items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.qr} alt="Código QR para vincular WhatsApp" width={260} height={260} style={{ background: "#fff", padding: 8, borderRadius: 8 }} />
          <div style={{ flex: "1 1 240px" }}>
            <p className="fw-semibold mb-2">Escanealo desde el teléfono del número del agente:</p>
            <ol className="ps-3 mb-2">
              <li>Abrí <strong>WhatsApp Business</strong> en ese teléfono.</li>
              <li>Tocá <strong>⋮</strong> (Android) o <strong>Configuración</strong> (iPhone) &gt; <strong>Dispositivos vinculados</strong>.</li>
              <li>Tocá <strong>Vincular un dispositivo</strong> y apuntá la cámara a este código.</li>
            </ol>
            <p className="small text-body-secondary mb-0">
              El código se renueva solo cada ~20 segundos. La app del teléfono sigue funcionando normal: el agente queda como un
              dispositivo vinculado más (como WhatsApp Web).
            </p>
          </div>
        </div>
      );
    }
    if (s.status === "conectado") {
      return (
        <>
          <p className="mb-2">
            ✅ <strong>Conectado</strong> como {s.name ? <strong>{s.name}</strong> : "la cuenta vinculada"}
            {s.phone ? ` (+${s.phone})` : ""}. El agente ya responde a los números autorizados.
          </p>
          {panelKey ? (
            <div className="d-flex gap-2 flex-wrap">
              <CButton size="sm" color="secondary" variant="outline" disabled={commandBusy !== null} onClick={() => sendCommand("restart")}>
                {commandBusy === "restart" ? <CSpinner size="sm" /> : "Reiniciar conexión"}
              </CButton>
              <CButton size="sm" color="danger" variant="outline" disabled={commandBusy !== null} onClick={() => setConfirmLogout(true)}>
                Desvincular
              </CButton>
            </div>
          ) : (
            <p className="small text-body-secondary mb-0">Con la clave del panel podés reiniciar o desvincular la sesión.</p>
          )}
        </>
      );
    }
    return (
      <p className="mb-0">
        <CSpinner size="sm" className="me-2" />
        Conectando con WhatsApp…
      </p>
    );
  }

  // ------------------------------------------------------------------------ pasos
  const info = s?.info ?? null;
  const steps: { n: number; title: string; state: StepState; body: React.ReactNode }[] = [
    {
      n: 1,
      title: "Clave de la IA (Claude)",
      state: !info ? "todo" : info.ai.ok ? "done" : "warn",
      body: (
        <>
          <p className="mb-2">
            En <a href="https://platform.claude.com" target="_blank" rel="noreferrer">platform.claude.com</a> creá la cuenta y una{" "}
            <strong>API key</strong>. Para probar alcanza el crédito gratis inicial (no cargues plata todavía). La clave va en el
            archivo <code>.env.local</code> del conector (paso 3).
          </p>
          {info && <p className="small mb-0">{info.ai.ok ? "✅" : "❌"} {info.ai.detail} · modelo {info.model} · esfuerzo {info.effort}</p>}
        </>
      ),
    },
    {
      n: 2,
      title: "Clave del panel en Vercel",
      state: data.panelKeyConfigured ? "done" : "todo",
      body: (
        <>
          <p className="mb-2">
            Protege el QR y los controles de esta pantalla. Generala acá, guardala en tu gestor de contraseñas y cargala en
            Vercel &gt; Project &gt; Settings &gt; Environment Variables como <code>WHATSAPP_PANEL_KEY</code>. Después,{" "}
            <strong>Redeploy</strong>.
          </p>
          {panelSecret ? (
            copyBlock("WHATSAPP_PANEL_KEY", panelSecret)
          ) : (
            <CButton size="sm" color="primary" variant="outline" onClick={() => setPanelSecret(randomHex(24))}>Generar clave</CButton>
          )}
        </>
      ),
    },
    {
      n: 3,
      title: "Conector en una PC encendida",
      state: s?.workerOnline ? "done" : "todo",
      body: (
        <>
          <p className="mb-2">
            WhatsApp necesita una conexión abierta todo el tiempo, y Vercel no puede mantenerla: el conector corre en una PC (o
            servidor) que quede prendida. En la carpeta <code>E:\Desarrollos\ObrasFlow</code> creá el archivo{" "}
            <code>.env.local</code> con esto (reemplazando lo que está entre paréntesis; nunca lo compartas):
          </p>
          {copyBlock(".env.local", ENV_TEMPLATE)}
          {copyBlock("Después, en una terminal en esa carpeta:", START_COMMAND)}
          <p className="small text-body-secondary mb-0">Cuando arranca, este paso se marca solo y aparece el QR arriba.</p>
        </>
      ),
    },
    {
      n: 4,
      title: "Vincular la cuenta de WhatsApp (QR)",
      state: connected ? "done" : "todo",
      body: (
        <p className="mb-0">
          Con el conector corriendo, escaneá el QR de arriba desde el teléfono del número del agente (WhatsApp Business &gt;
          Dispositivos vinculados &gt; Vincular un dispositivo). La sesión queda guardada en la PC: no hace falta volver a
          escanear cada vez que se reinicia el conector.
        </p>
      ),
    },
    {
      n: 5,
      title: "Primera prueba",
      state: data.lastInboundAt ? "done" : "todo",
      body: (
        <>
          <p className="mb-2">
            Desde tu WhatsApp personal (un número autorizado), escribile al número del agente: <em>&quot;¿cuánto llevamos gastado en
            Congreso?&quot;</em>. Después probá una carga: el agente responde con una propuesta y un código; respondé{" "}
            <strong>OK 1234</strong> (con el código que te mande) para registrarla o <strong>NO 1234</strong> para descartarla.
          </p>
          <p className="small mb-0">
            {data.lastInboundAt ? `✅ Último mensaje recibido: ${fmtDateTime(data.lastInboundAt)}.` : "Todavía no llegó ningún mensaje."}
          </p>
        </>
      ),
    },
    {
      n: 6,
      title: "Dejarlo funcionando",
      state: "info",
      body: (
        <ul className="mb-0 ps-3">
          <li>La PC del conector tiene que quedar encendida y con internet. Si se reinicia, volvé a correr <code>{START_COMMAND}</code>.</li>
          <li>
            La conexión por QR no es la API oficial: WhatsApp puede bloquear cuentas que la usan de forma automatizada. Usala
            solo para este agente interno (sin mensajes masivos ni a desconocidos: el agente ignora a quien no está autorizado).
          </li>
          <li>
            Si algún día el número se bloquea o querés algo más estable, está la{" "}
            <button type="button" className="btn btn-link p-0 align-baseline" onClick={onShowCloud}>guía de la API oficial de Meta</button>.
          </li>
        </ul>
      ),
    },
  ];

  return (
    <>
      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Conexión</div>
          <div className="mt-1"><CBadge color={connection.color} className="fs-6">{connection.label}</CBadge></div>
          <div className="sub">{s?.heartbeatAt ? `Última señal: ${fmtDateTime(s.heartbeatAt)}` : "Sin señal del conector"}</div>
        </div>
        <div className="kpi">
          <div className="label">Cuenta vinculada</div>
          <div className="value" style={{ fontSize: "1.3rem" }}>{connected ? s?.name || (s?.phone ? `+${s.phone}` : "—") : "—"}</div>
        </div>
        <div className="kpi">
          <div className="label">Modelo de IA</div>
          <div className="value" style={{ fontSize: "1.3rem" }}>{info?.model ?? "—"}</div>
          <div className="sub">{info ? `esfuerzo ${info.effort}` : "lo informa el conector"}</div>
        </div>
        <div className="kpi">
          <div className="label">Último mensaje recibido</div>
          <div className="value" style={{ fontSize: "1.3rem" }}>{data.lastInboundAt ? fmtDateTime(data.lastInboundAt) : "—"}</div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-7">
          <CCard className="mb-4">
            <CCardHeader className="d-flex align-items-center gap-2">
              <span className="fw-semibold">Conexión con WhatsApp</span>
              <CBadge color={connection.color} className="ms-auto">{connection.label}</CBadge>
            </CCardHeader>
            <CCardBody>
              {connectionBody()}
              {s?.workerOnline && s.lastError && s.status !== "conectado" && (
                <CAlert color="warning" className="py-2 mt-3 mb-0 small">{s.lastError}</CAlert>
              )}
              {commandMsg && <CAlert color="info" className="py-2 mt-3 mb-0 small">{commandMsg}</CAlert>}
            </CCardBody>
          </CCard>

          <h2 className="h5 fw-semibold mb-3">Pasos</h2>
          <div className="d-flex flex-column gap-3">
            {steps.map((st) => (
              <CCard key={st.n}>
                <CCardHeader className="d-flex align-items-center gap-2">
                  <span className="fw-semibold">{st.n}. {st.title}</span>
                  <CBadge color={STEP_BADGE[st.state].color} textColor={STEP_BADGE[st.state].dark ? "dark" : undefined} className="ms-auto">
                    {STEP_BADGE[st.state].label}
                  </CBadge>
                </CCardHeader>
                <CCardBody>{st.body}</CCardBody>
              </CCard>
            ))}
          </div>
        </div>

        <div className="col-lg-5">
          <h2 className="h5 fw-semibold mb-3">Panel</h2>
          {!panelKey ? (
            <CCard>
              <CCardBody>
                <p className="mb-2">
                  Con la clave del panel (<code>WHATSAPP_PANEL_KEY</code>) ves el QR, la actividad del agente y podés reiniciar o
                  desvincular la sesión.
                </p>
                {data.panelKeyConfigured ? unlockForm : <p className="small text-body-secondary mb-0">Primero cargala en Vercel (paso 2).</p>}
              </CCardBody>
            </CCard>
          ) : (
            <div className="d-flex flex-column gap-3">
              <CCard>
                <CCardBody className="d-flex align-items-center gap-2">
                  <span className="small">🔓 Panel desbloqueado{info ? ` · ${info.allowedCount} número(s) autorizado(s) en el conector` : ""}</span>
                  <CButton size="sm" color="secondary" variant="ghost" className="ms-auto" onClick={onLock}>Salir</CButton>
                </CCardBody>
              </CCard>
              {activity}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title="Desvincular WhatsApp"
        message="El agente deja de responder hasta que vuelvas a escanear un QR. La cuenta de WhatsApp del teléfono no se toca. ¿Seguimos?"
        confirmLabel="Desvincular"
        busy={commandBusy === "logout"}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={async () => {
          setConfirmLogout(false);
          await sendCommand("logout");
        }}
      />
    </>
  );
}
