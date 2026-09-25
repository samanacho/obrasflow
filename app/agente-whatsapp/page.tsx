"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CCard, CCardBody, CCardHeader, CBadge, CButton, CForm, CFormInput, CFormSelect, CAlert, CSpinner,
} from "@coreui/react";
import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import BaileysView from "./BaileysView";

// Módulo para configurar y controlar el agente de WhatsApp (ver
// docs/WHATSAPP_AGENT.md). Lo público solo dice qué variables están
// cargadas; el diagnóstico, la actividad y las acciones piden la clave del
// panel, que se verifica en el servidor (app/api/whatsapp/panel).

type CheckStatus = "ok" | "warn" | "error" | "skip";
interface Check { id: string; group: "Meta" | "Claude"; label: string; status: CheckStatus; detail?: string; hint?: string }
export interface PanelData {
  vars: Record<string, boolean>;
  allowedCount: number;
  webhookReady: boolean;
  agentReady: boolean;
  model: string;
  effort: string;
  graphVersion: string;
  panelKeyConfigured: boolean;
  lastInboundAt: string | null;
  provider: "baileys" | "cloud";
  webhookUrl: string;
  unlocked: boolean;
  diagnostics?: { checks: Check[]; phoneDisplay: string | null; isTestNumber: boolean | null; wabaId: string | null };
  activity?: {
    inbound7: number;
    outbound7: number;
    proposals7: Record<string, number>;
    recent: { id: string; kind: string; status: string; createdAt: string; by: string; detail: string }[];
    allowed: { name: string; phone: string; key: string }[];
  };
}
interface ActionResult { ok: boolean; message: string; hint?: string }

const KEY_STORAGE = "obrasflow-wa-panel-key";
const VAR_HELP: Record<string, string> = {
  WHATSAPP_VERIFY_TOKEN: "Token inventado (generalo abajo); el mismo que en Meta > Webhook.",
  WHATSAPP_APP_SECRET: "App settings > Basic > App Secret.",
  WHATSAPP_ACCESS_TOKEN: "Token permanente del System User.",
  WHATSAPP_PHONE_NUMBER_ID: "WhatsApp > API Setup > Phone number ID.",
  WHATSAPP_ALLOWED_NUMBERS: "Ej.: 595981111111:Ignacio Samaniego,595982222222:Hugo Rotela",
  ANTHROPIC_API_KEY: "platform.claude.com > Settings > API keys.",
};
const STATUS_ICON: Record<CheckStatus, string> = { ok: "✅", warn: "⚠️", error: "❌", skip: "⏭️" };
const PROPOSAL_STATUS: Record<string, { label: string; color: string }> = {
  pendiente: { label: "Esperando confirmación", color: "warning" },
  ejecutando: { label: "Registrando", color: "info" },
  confirmada: { label: "Registrada", color: "success" },
  cancelada: { label: "Cancelada", color: "secondary" },
  fallida: { label: "Falló", color: "danger" },
};
const KIND_LABEL: Record<string, string> = {
  movimiento_obra: "Movimiento de obra",
  movimiento_general: "Ingreso/egreso general",
  registro_rapido: "Registro rápido",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
function randomPin() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

type StepState = "done" | "todo" | "warn" | "waiting" | "manual" | "info";
const STEP_BADGE: Record<StepState, { label: string; color: string }> = {
  done: { label: "Listo", color: "success" },
  todo: { label: "Pendiente", color: "secondary" },
  warn: { label: "Revisar", color: "warning" },
  waiting: { label: "Falta probar", color: "info" },
  manual: { label: "Lo hacés en Meta", color: "light" },
  info: { label: "Referencia", color: "light" },
};

export default function AgenteWhatsAppPage() {
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [secrets, setSecrets] = useState<{ token: string; pin: string } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [result, setResult] = useState<(ActionResult & { action: string }) | null>(null);
  const [pin, setPin] = useState("");
  const [confirmRegister, setConfirmRegister] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [showCloud, setShowCloud] = useState(false);
  const { toast, showToast } = useToast();

  const load = useCallback(async (panelKey: string | null) => {
    const res = await fetch("/api/whatsapp/panel", { headers: panelKey ? { "x-panel-key": panelKey } : {}, cache: "no-store" });
    if (res.status === 401) return "denied" as const;
    if (!res.ok) throw new Error(String(res.status));
    setData(await res.json());
    return "ok" as const;
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(KEY_STORAGE);
    } catch {
      /* sin sessionStorage se pide la clave cada vez */
    }
    (async () => {
      try {
        if (saved && (await load(saved)) === "ok") setKey(saved);
        else {
          if (saved) try { sessionStorage.removeItem(KEY_STORAGE); } catch { /* nada */ }
          await load(null);
        }
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  /** Prueba una clave del panel; devuelve un mensaje de error o null si entró. */
  async function unlockWith(k: string): Promise<string | null> {
    try {
      if ((await load(k)) === "denied") return "Clave incorrecta.";
      setKey(k);
      try { sessionStorage.setItem(KEY_STORAGE, k); } catch { /* nada */ }
      return null;
    } catch {
      return "No se pudo conectar con el servidor.";
    }
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    const k = keyInput.trim();
    if (!k) return;
    setChecking(true);
    setKeyError(null);
    const err = await unlockWith(k);
    if (err) setKeyError(err);
    else setKeyInput("");
    setChecking(false);
  }

  function lock() {
    setKey(null);
    try { sessionStorage.removeItem(KEY_STORAGE); } catch { /* nada */ }
    load(null).catch(() => setLoadError(true));
  }

  async function refresh() {
    setChecking(true);
    try {
      if ((await load(key)) === "denied") lock();
    } catch {
      showToast("No se pudo actualizar.");
    } finally {
      setChecking(false);
    }
  }

  async function runAction(action: string, extra: Record<string, string> = {}) {
    if (!key) return;
    setBusyAction(action);
    setResult(null);
    try {
      const res = await fetch("/api/whatsapp/panel", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-panel-key": key },
        body: JSON.stringify({ action, ...extra }),
      });
      if (res.status === 401) {
        lock();
        return;
      }
      const r = (await res.json()) as ActionResult;
      setResult({ ...r, action });
      if (r.ok && (action === "subscribe" || action === "register")) await load(key);
    } catch {
      setResult({ ok: false, message: "No se pudo conectar con el servidor.", action });
    } finally {
      setBusyAction(null);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what} copiado ✓`);
    } catch {
      showToast("No se pudo copiar: seleccioná el texto y copialo a mano.");
    }
  }

  const checks = data?.diagnostics?.checks ?? [];
  const check = (id: string) => checks.find((c) => c.id === id);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://obrasflow-app.vercel.app";

  const steps = useMemo(() => {
    if (!data) return [];
    const v = data.vars;
    const unlocked = data.unlocked;
    const bad = (...ids: string[]) => ids.some((id) => check(id)?.status === "error");
    const good = (...ids: string[]) => ids.every((id) => check(id)?.status === "ok");
    const st = (base: boolean, okIds: string[] = []): StepState => {
      if (!base) return "todo";
      if (!unlocked || okIds.length === 0) return "done";
      if (bad(...okIds)) return "warn";
      return good(...okIds) ? "done" : "warn";
    };
    const isTest = data.diagnostics?.isTestNumber;
    return [
      { n: 1, title: "Cuenta de Claude (la IA)", state: st(v.ANTHROPIC_API_KEY, ["claude"]) },
      { n: 2, title: "App de Meta, número de prueba y token permanente", state: st(v.WHATSAPP_APP_SECRET && v.WHATSAPP_ACCESS_TOKEN && v.WHATSAPP_PHONE_NUMBER_ID, ["token", "scopes", "secret"]) },
      { n: 3, title: "Pasar la app de Meta a Live", state: "manual" as StepState },
      { n: 4, title: "Variables en Vercel", state: (Object.values(v).every(Boolean) ? "done" : "todo") as StepState },
      {
        n: 5,
        title: "Webhook y prueba con el número de prueba",
        // Listo recién cuando llega un mensaje de verdad; antes, "falta probar" (o "revisar" si el diagnóstico ve un problema).
        state: (data.lastInboundAt ? "done" : !data.webhookReady ? "todo" : unlocked && bad("webhook", "subscribed", "callback") ? "warn" : "waiting") as StepState,
      },
      { n: 6, title: "Número real", state: (unlocked && check("number")?.status === "ok" && isTest === false ? "done" : "manual") as StepState },
      { n: 7, title: "Operación diaria", state: "info" as StepState },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const overall = !data
    ? null
    : !data.webhookReady
      ? { label: "Sin configurar", color: "secondary" }
      : !data.agentReady
        ? { label: "Configuración incompleta", color: "warning" }
        : checks.some((c) => c.status === "error")
          ? { label: "Revisar configuración", color: "danger" }
        : data.diagnostics?.isTestNumber
          ? { label: "En prueba (número de Meta)", color: "info" }
          : { label: "Listo", color: "success" };

  const resultBox = (action: string) =>
    result && result.action === action ? (
      <CAlert color={result.ok ? "success" : "danger"} className="py-2 mt-2 mb-0 small">
        {result.message}
        {result.hint && <div className="mt-1">→ {result.hint}</div>}
      </CAlert>
    ) : null;

  const copyField = (label: string, value: string) => (
    <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
      <span className="small text-body-secondary" style={{ minWidth: 150 }}>{label}</span>
      <code className="small text-break flex-grow-1">{value}</code>
      <CButton size="sm" color="secondary" variant="outline" onClick={() => copy(value, label)}>Copiar</CButton>
    </div>
  );

  function stepBody(n: number) {
    if (!data) return null;
    switch (n) {
      case 1:
        return (
          <>
            <p className="mb-2">
              En <a href="https://platform.claude.com" target="_blank" rel="noreferrer">platform.claude.com</a> creá la
              organización y un workspace para el agente, y generá una <strong>API key</strong>. Para probar alcanza el
              crédito gratis inicial: no cargues plata todavía. Cuando se agote, el agente avisa que está en pausa.
            </p>
            <p className="small text-body-secondary mb-0">
              Modelo configurado: <code>{data.model}</code> · esfuerzo <code>{data.effort}</code>. Para la etapa de prueba se
              recomienda <code>ANTHROPIC_EFFORT=low</code>.
            </p>
          </>
        );
      case 2:
        return (
          <ol className="mb-0 ps-3">
            <li>
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a> &gt;
              Create app &gt; caso de uso <em>&quot;Connect with customers through WhatsApp&quot;</em>.
            </li>
            <li>WhatsApp &gt; API Setup: anotá el <em>Phone number ID</em> del número de prueba y agregá tu celular y el de Hugo en &quot;To&quot; (a cada uno le llega un código).</li>
            <li>
              <a href="https://business.facebook.com/latest/settings" target="_blank" rel="noreferrer">Business settings</a> &gt;
              System users: rol Admin, asignale la app y la cuenta de WhatsApp, y generá un token con vencimiento
              <strong> Nunca</strong> y los permisos <code>business_management</code>, <code>whatsapp_business_management</code> y{" "}
              <code>whatsapp_business_messaging</code>.
            </li>
          </ol>
        );
      case 3:
        return (
          <>
            <p className="mb-2">En la app de Meta, App settings &gt; Basic, cargá estas URLs y después poné <strong>App Mode: Live</strong>:</p>
            {copyField("Política de privacidad", `${origin}/privacidad`)}
            {copyField("Términos de uso", `${origin}/terminos`)}
            {copyField("Borrado de datos", `${origin}/privacidad#borrado-de-datos`)}
          </>
        );
      case 4:
        return (
          <>
            <p className="mb-2">
              Vercel &gt; Project &gt; Settings &gt; Environment Variables (Production). Después, <strong>Redeploy</strong> del
              último deployment. Acá solo se ve si cada una está cargada, nunca su valor.
            </p>
            <ul className="list-unstyled mb-3">
              {Object.entries(data.vars).map(([name, present]) => (
                <li key={name} className="d-flex gap-2 align-items-start mb-1">
                  <span>{present ? "✅" : "⬜"}</span>
                  <span>
                    <code>{name}</code>
                    {name === "WHATSAPP_ALLOWED_NUMBERS" && present && <span className="small"> ({data.allowedCount} autorizados)</span>}
                    <span className="d-block small text-body-secondary">{VAR_HELP[name]}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="border rounded p-3">
              <div className="fw-semibold mb-1">Generar verify token y PIN</div>
              <p className="small text-body-secondary mb-2">
                Se generan en tu navegador y no se guardan en ningún lado: copialos a tu gestor de contraseñas. El verify
                token va en Vercel y en Meta (y sirve de clave de este panel); el PIN se usa al registrar el número real.
              </p>
              {secrets ? (
                <>
                  {copyField("Verify token", secrets.token)}
                  {copyField("PIN (6 dígitos)", secrets.pin)}
                </>
              ) : (
                <CButton size="sm" color="primary" variant="outline" onClick={() => setSecrets({ token: randomHex(32), pin: randomPin() })}>
                  Generar
                </CButton>
              )}
            </div>
          </>
        );
      case 5:
        return (
          <>
            <p className="mb-2">
              En la app de Meta, WhatsApp &gt; Configuration &gt; Webhook: pegá esta URL y el verify token, tocá{" "}
              <strong>Verify and save</strong> y suscribí los campos <code>messages</code> y <code>account_update</code>.
            </p>
            {copyField("Callback URL", data.webhookUrl)}
            <p className="small mb-0">
              {data.lastInboundAt
                ? `✅ Último mensaje recibido: ${fmtDateTime(data.lastInboundAt)}.`
                : "Todavía no llegó ningún mensaje. Cuando esté todo, escribile al número de prueba desde tu WhatsApp: una consulta, una carga (tocando Confirmar) y una foto de comprobante."}
            </p>
          </>
        );
      case 6:
        return (
          <ol className="mb-0 ps-3">
            <li>Tu SIM tiene WhatsApp Business: antes de este paso hay que borrar esa cuenta (irreversible) o usar una SIM nueva.</li>
            <li>WhatsApp Manager &gt; Phone numbers &gt; Add phone number: nombre visible y código por SMS o llamada.</li>
            <li>Cargar una tarjeta en Meta antes del primer mensaje real (desde el 1/10/2026 las respuestas se cobran pasado el cupo gratis).</li>
            <li>Cambiar <code>WHATSAPP_PHONE_NUMBER_ID</code> en Vercel, Redeploy, y acá: <strong>Registrar número</strong> con el PIN.</li>
          </ol>
        );
      case 7:
        return (
          <p className="mb-0">
            Si algo no anda, tocá <strong>Volver a revisar</strong> en el diagnóstico. Los detalles quedan en Vercel &gt; Project &gt;
            Logs (buscá &quot;WhatsApp&quot;; en el plan Hobby se guardan 1 hora). Caídas de Meta:{" "}
            <a href="https://metastatus.com/whatsapp-business-api" target="_blank" rel="noreferrer">metastatus.com</a>.
          </p>
        );
      default:
        return null;
    }
  }

  return (
    <AppShell crumbs={[{ label: "Agente WhatsApp" }]}>
      <h1 className="of-page-title">💬 Agente WhatsApp</h1>
      <p className="module-desc mb-4">
        Configuración y control del asistente que responde consultas y prepara registros por WhatsApp. Seguí los pasos en
        orden: cada uno se marca solo cuando el sistema detecta que quedó bien. Guía completa en docs/WHATSAPP_AGENT.md.
      </p>

      {loading && <p className="state-message">Cargando…</p>}
      {loadError && !loading && <CAlert color="danger">No se pudo cargar el estado del agente.</CAlert>}

      {data && data.provider === "baileys" && !showCloud && (
        <BaileysView
          data={data}
          panelKey={key}
          onUnlock={unlockWith}
          onLock={lock}
          onShowCloud={() => setShowCloud(true)}
          copy={copy}
          activity={data.activity ? <ActivityCard activity={data.activity} /> : null}
        />
      )}

      {data && (data.provider === "cloud" || showCloud) && (
        <>
          {data.provider === "baileys" && (
            <CAlert color="info" className="d-flex align-items-center gap-2">
              <span>Esta es la guía de la <strong>API oficial de Meta</strong> (alternativa). El agente está configurado para la conexión por QR.</span>
              <CButton size="sm" color="primary" variant="outline" className="ms-auto" onClick={() => setShowCloud(false)}>Volver a la conexión por QR</CButton>
            </CAlert>
          )}
          <div className="kpi-row">
            <div className="kpi">
              <div className="label">Estado</div>
              <div className="mt-1"><CBadge color={overall!.color} className="fs-6">{overall!.label}</CBadge></div>
              <div className="sub">{data.diagnostics?.phoneDisplay ? `Número ${data.diagnostics.phoneDisplay}` : "Número: —"}</div>
            </div>
            <div className="kpi">
              <div className="label">Último mensaje recibido</div>
              <div className="value" style={{ fontSize: "1.3rem" }}>{data.lastInboundAt ? fmtDateTime(data.lastInboundAt) : "—"}</div>
            </div>
            <div className="kpi">
              <div className="label">Modelo de IA</div>
              <div className="value" style={{ fontSize: "1.3rem" }}>{data.model}</div>
              <div className="sub">esfuerzo {data.effort}</div>
            </div>
            <div className="kpi">
              <div className="label">Números autorizados</div>
              <div className="value">{data.allowedCount}</div>
            </div>
          </div>

          <div className="row g-4">
            <div className="col-lg-7">
              <h2 className="h5 fw-semibold mb-3">Pasos de configuración</h2>
              <div className="d-flex flex-column gap-3">
                {steps.map((s) => (
                  <CCard key={s.n}>
                    <CCardHeader className="d-flex align-items-center gap-2">
                      <span className="fw-semibold">{s.n}. {s.title}</span>
                      <CBadge color={STEP_BADGE[s.state].color} textColor={s.state === "manual" || s.state === "info" ? "dark" : undefined} className="ms-auto">
                        {STEP_BADGE[s.state].label}
                      </CBadge>
                    </CCardHeader>
                    <CCardBody>{stepBody(s.n)}</CCardBody>
                  </CCard>
                ))}
              </div>
            </div>

            <div className="col-lg-5">
              <h2 className="h5 fw-semibold mb-3">Diagnóstico y acciones</h2>
              {!data.unlocked ? (
                <CCard>
                  <CCardBody>
                    <p className="mb-2">
                      Para ver el diagnóstico en vivo contra Meta y Claude, la actividad y las acciones, ingresá la clave del
                      panel: es tu <strong>verify token</strong> (o <code>WHATSAPP_PANEL_KEY</code>, si la cargaste en Vercel).
                    </p>
                    {!data.panelKeyConfigured ? (
                      <p className="small text-body-secondary mb-0">
                        Disponible cuando cargues <code>WHATSAPP_VERIFY_TOKEN</code> en Vercel (paso 4).
                      </p>
                    ) : (
                      <CForm onSubmit={unlock}>
                        {keyError && <CAlert color="danger" className="py-2">{keyError}</CAlert>}
                        <CFormInput
                          type="password"
                          autoComplete="off"
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          placeholder="Clave del panel"
                          className="mb-2"
                        />
                        <CButton type="submit" color="primary" disabled={checking || !keyInput.trim()}>
                          {checking ? <CSpinner size="sm" /> : "Entrar"}
                        </CButton>
                      </CForm>
                    )}
                  </CCardBody>
                </CCard>
              ) : (
                <div className="d-flex flex-column gap-3">
                  <CCard>
                    <CCardHeader className="d-flex align-items-center gap-2">
                      <span className="fw-semibold">Diagnóstico</span>
                      <CButton size="sm" color="primary" variant="outline" className="ms-auto" onClick={refresh} disabled={checking}>
                        {checking ? <CSpinner size="sm" /> : "Volver a revisar"}
                      </CButton>
                      <CButton size="sm" color="secondary" variant="ghost" onClick={lock}>Salir</CButton>
                    </CCardHeader>
                    <CCardBody>
                      {(["Meta", "Claude"] as const).map((g) => (
                        <div key={g} className="mb-3">
                          <div className="small text-uppercase text-body-secondary mb-1">{g}</div>
                          {checks.filter((c) => c.group === g).map((c) => (
                            <div key={c.id} className="mb-2">
                              <div>{STATUS_ICON[c.status]} <strong>{c.label}</strong></div>
                              {c.detail && <div className="small ms-4">{c.detail}</div>}
                              {c.hint && <div className="small ms-4 text-body-secondary">→ {c.hint}</div>}
                            </div>
                          ))}
                        </div>
                      ))}
                    </CCardBody>
                  </CCard>

                  <CCard>
                    <CCardHeader className="fw-semibold">Acciones</CCardHeader>
                    <CCardBody className="d-flex flex-column gap-3">
                      <div>
                        <CButton size="sm" color="primary" variant="outline" onClick={() => runAction("test-ai")} disabled={busyAction !== null}>
                          {busyAction === "test-ai" ? <CSpinner size="sm" /> : "Probar la IA"}
                        </CButton>
                        <div className="small text-body-secondary mt-1">Una respuesta mínima (costo despreciable): confirma clave, modelo y saldo.</div>
                        {resultBox("test-ai")}
                      </div>
                      <div>
                        <CButton size="sm" color="primary" variant="outline" onClick={() => runAction("subscribe")} disabled={busyAction !== null}>
                          {busyAction === "subscribe" ? <CSpinner size="sm" /> : "Suscribir app a la WABA"}
                        </CButton>
                        <div className="small text-body-secondary mt-1">Hace falta si el diagnóstico dice que la app no está suscripta.</div>
                        {resultBox("subscribe")}
                      </div>
                      <div>
                        <div className="d-flex gap-2">
                          <CFormSelect size="sm" value={testTo} onChange={(e) => setTestTo(e.target.value)} style={{ maxWidth: 320 }}>
                            <option value="">Enviar prueba a…</option>
                            {(data.activity?.allowed ?? []).map((a) => (
                              <option key={a.key} value={a.key}>{a.name} ({a.phone})</option>
                            ))}
                          </CFormSelect>
                          <CButton size="sm" color="primary" variant="outline" disabled={!testTo || busyAction !== null} onClick={() => runAction("send-test", { to: testTo })}>
                            {busyAction === "send-test" ? <CSpinner size="sm" /> : "Enviar"}
                          </CButton>
                        </div>
                        <div className="small text-body-secondary mt-1">Solo funciona si esa persona le escribió al número en las últimas 24 h.</div>
                        {resultBox("send-test")}
                      </div>
                      <div>
                        <div className="d-flex gap-2">
                          <CFormInput
                            size="sm"
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={6}
                            placeholder="PIN (6 dígitos)"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                            style={{ maxWidth: 160 }}
                          />
                          <CButton size="sm" color="primary" variant="outline" disabled={pin.length !== 6 || busyAction !== null} onClick={() => setConfirmRegister(true)}>
                            {busyAction === "register" ? <CSpinner size="sm" /> : "Registrar número"}
                          </CButton>
                        </div>
                        <div className="small text-body-secondary mt-1">
                          Solo para el número real (paso 6), una vez. Meta permite 10 intentos cada 72 h.
                        </div>
                        {resultBox("register")}
                      </div>
                    </CCardBody>
                  </CCard>

                  {data.activity && <ActivityCard activity={data.activity} />}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmRegister}
        title="Registrar el número"
        message="Esto registra el número configurado en WHATSAPP_PHONE_NUMBER_ID con ese PIN. Meta permite 10 intentos cada 72 horas y el PIN queda como verificación en dos pasos: guardalo. ¿Seguimos?"
        confirmLabel="Registrar"
        confirmColor="primary"
        busy={busyAction === "register"}
        onCancel={() => setConfirmRegister(false)}
        onConfirm={async () => {
          setConfirmRegister(false);
          await runAction("register", { pin });
          setPin("");
        }}
      />
      <Toast message={toast} />
    </AppShell>
  );
}

function ActivityCard({ activity }: { activity: NonNullable<PanelData["activity"]> }) {
  return (
    <CCard>
      <CCardHeader className="fw-semibold">Actividad (últimos 7 días)</CCardHeader>
      <CCardBody>
        <div className="d-flex flex-wrap gap-3 mb-3 small">
          <span>📥 {activity.inbound7} mensajes recibidos</span>
          <span>📤 {activity.outbound7} respuestas</span>
          <span>✅ {activity.proposals7.confirmada ?? 0} registradas</span>
          <span>⏳ {activity.proposals7.pendiente ?? 0} esperando</span>
          <span>❌ {activity.proposals7.cancelada ?? 0} canceladas</span>
        </div>
        {activity.recent.length === 0 ? (
          <p className="empty-col mb-0">Todavía no hay propuestas.</p>
        ) : (
          <div className="d-flex flex-column gap-2">
            {activity.recent.map((r) => (
              <div key={r.id} className="border rounded p-2 small">
                <div className="d-flex gap-2 align-items-center">
                  <strong>{KIND_LABEL[r.kind] ?? r.kind}</strong>
                  <CBadge color={PROPOSAL_STATUS[r.status]?.color ?? "secondary"} className="ms-auto">
                    {PROPOSAL_STATUS[r.status]?.label ?? r.status}
                  </CBadge>
                </div>
                <div>{r.detail}</div>
                <div className="text-body-secondary">{r.by} · {fmtDateTime(r.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </CCardBody>
    </CCard>
  );
}
