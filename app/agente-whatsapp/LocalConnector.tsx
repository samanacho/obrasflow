"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CCard, CCardBody, CCardHeader, CBadge, CButton, CFormInput, CFormSelect, CFormCheck, CAlert, CSpinner } from "@coreui/react";
import ConfirmDialog from "@/components/ConfirmDialog";

// Sección de /agente-whatsapp cuando la app corre en la misma PC que el
// conector (modo local): QR para vincular, estado de la conexión y toda la
// configuración del agente. Habla con el conector a través de
// /api/whatsapp/local/*, que solo responde desde esta PC. Cada cambio de la
// configuración se guarda solo (no hay botón Guardar).

export interface LocalState {
  available: boolean;
  status: string;
  qr: string | null;
  phone: string | null;
  name: string | null;
  lastError: string | null;
  info: { ai?: { ok: boolean; detail: string }; selfMode?: boolean; allowedCount?: number } | null;
  aiKeyConfigured: boolean;
  backend: "cli" | "api";
  cliModel: string;
  model: string;
  effort: string;
  selfMode: boolean;
}

const CLI_MODELS = [
  { value: "sonnet", label: "Sonnet — equilibrado (recomendado)" },
  { value: "opus", label: "Opus — más preciso, más lento" },
  { value: "haiku", label: "Haiku — más rápido y liviano" },
];
const API_MODELS = [
  { value: "claude-sonnet-5", label: "Claude Sonnet 5 (recomendado)" },
  { value: "claude-opus-5-5", label: "Claude Opus 5.5 (más preciso)" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (más barato)" },
];
const EFFORTS = [
  { value: "low", label: "Bajo (más rápido y barato)" },
  { value: "medium", label: "Medio" },
  { value: "high", label: "Alto (más cuidadoso)" },
];

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}

export function useLocalConnector() {
  const [state, setState] = useState<LocalState | null>(null);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/local/state", { cache: "no-store" });
      setState(await r.json());
    } catch {
      setState({ available: false } as LocalState);
    }
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);
  return { state, refresh };
}

export default function LocalConnector({
  state,
  refresh,
  lastInboundAt,
  activity,
}: {
  state: LocalState;
  refresh: () => Promise<void>;
  lastInboundAt: string | null;
  activity: React.ReactNode;
}) {
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(patch: Record<string, string>) {
    setSaving("saving");
    setSaveError(null);
    try {
      const r = await fetch("/api/whatsapp/local/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "No se pudo guardar.");
      setSaving("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaving("idle"), 2500);
      await refresh();
      return true;
    } catch (err) {
      setSaving("error");
      setSaveError((err as Error).message);
      return false;
    }
  }

  async function command(c: "restart" | "logout") {
    setBusy(c);
    try {
      await fetch("/api/whatsapp/local/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: c }) });
      setTimeout(refresh, 1500);
    } finally {
      setBusy(null);
    }
  }

  const s = state;
  const connected = s.status === "conectado";
  const badge =
    s.status === "conectado"
      ? { label: "Conectado", color: "success" }
      : s.status === "esperando_qr"
        ? { label: "Esperando QR", color: "warning" }
        : s.status === "desconectado"
          ? { label: "Desconectado", color: "danger" }
          : { label: "Conectando", color: "info" };
  const ai = s.info?.ai;

  return (
    <>
      <div className="kpi-row">
        <div className="kpi">
          <div className="label">Conexión</div>
          <div className="mt-1"><CBadge color={badge.color} className="fs-6">{badge.label}</CBadge></div>
          <div className="sub">Conector en esta PC</div>
        </div>
        <div className="kpi">
          <div className="label">Cuenta vinculada</div>
          <div className="value" style={{ fontSize: "1.3rem" }}>{connected ? s.name || `+${s.phone}` : "—"}</div>
          <div className="sub">{connected && s.phone ? `+${s.phone}` : "sin vincular"}</div>
        </div>
        <div className="kpi">
          <div className="label">Inteligencia artificial</div>
          <div className="value" style={{ fontSize: "1.3rem" }}>{s.backend === "cli" ? `Claude ${s.cliModel}` : s.model}</div>
          <div className="sub">{ai ? (ai.ok ? "✅ responde" : "❌ revisar") : "verificando…"}</div>
        </div>
        <div className="kpi">
          <div className="label">Último mensaje recibido</div>
          <div className="value" style={{ fontSize: "1.3rem" }}>{lastInboundAt ? fmtDateTime(lastInboundAt) : "—"}</div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-7 d-flex flex-column gap-4">
          <CCard>
            <CCardHeader className="d-flex align-items-center gap-2">
              <span className="fw-semibold">Conexión con WhatsApp</span>
              <CBadge color={badge.color} className="ms-auto">{badge.label}</CBadge>
            </CCardHeader>
            <CCardBody>
              {s.status === "esperando_qr" && s.qr ? (
                <div className="d-flex flex-wrap gap-4 align-items-start">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.qr} alt="Código QR para vincular WhatsApp" width={260} height={260} style={{ background: "#fff", padding: 8, borderRadius: 8 }} />
                  <div style={{ flex: "1 1 240px" }}>
                    <p className="fw-semibold mb-2">Escanealo con el teléfono de la cuenta que va a usar el agente:</p>
                    <ol className="ps-3 mb-2">
                      <li>Abrí <strong>WhatsApp</strong> (o WhatsApp Business) en ese teléfono.</li>
                      <li>Tocá <strong>⋮</strong> (Android) o <strong>Configuración</strong> (iPhone) &gt; <strong>Dispositivos vinculados</strong>.</li>
                      <li>Tocá <strong>Vincular un dispositivo</strong> y apuntá la cámara a este código.</li>
                    </ol>
                    <p className="small text-body-secondary mb-0">
                      El código se renueva solo. Al escanearlo, la sesión queda guardada en esta PC: no hace falta volver a
                      hacerlo aunque se reinicie la computadora.
                    </p>
                  </div>
                </div>
              ) : connected ? (
                <>
                  <p className="mb-2">
                    ✅ Conectado como <strong>{s.name || "la cuenta vinculada"}</strong>
                    {s.phone ? ` (+${s.phone})` : ""}. La sesión está guardada en esta PC y se reconecta sola.
                  </p>
                  <div className="d-flex gap-2 flex-wrap">
                    <CButton size="sm" color="secondary" variant="outline" disabled={busy !== null} onClick={() => command("restart")}>
                      {busy === "restart" ? <CSpinner size="sm" /> : "Reiniciar conexión"}
                    </CButton>
                    <CButton size="sm" color="danger" variant="outline" disabled={busy !== null} onClick={() => setConfirmLogout(true)}>
                      Desvincular
                    </CButton>
                  </div>
                </>
              ) : (
                <p className="mb-0">
                  <CSpinner size="sm" className="me-2" />
                  {s.status === "reiniciando" ? "Reiniciando el conector…" : "Conectando con WhatsApp…"}
                </p>
              )}
              {s.lastError && !connected && <CAlert color="warning" className="py-2 mt-3 mb-0 small">{s.lastError}</CAlert>}
            </CCardBody>
          </CCard>

          <CCard>
            <CCardHeader className="d-flex align-items-center gap-2">
              <span className="fw-semibold">Configuración</span>
              <span className="ms-auto small text-body-secondary">
                {saving === "saving" && <><CSpinner size="sm" className="me-1" />Guardando…</>}
                {saving === "saved" && "✅ Guardado"}
                {saving === "idle" && "Los cambios se guardan solos"}
              </span>
            </CCardHeader>
            <CCardBody className="d-flex flex-column gap-3">
              {saveError && <CAlert color="danger" className="py-2 mb-0 small">{saveError}</CAlert>}

              <div>
                <div className="fw-semibold mb-1">Quién usa el agente</div>
                <p className="mb-0 small">
                  👤 Solo la cuenta vinculada. Escribile en tu chat <strong>&quot;Tú&quot;</strong> (mensaje a vos mismo) y te
                  responde ahí; sus mensajes llevan 🤖. No lee ni responde a ningún otro chat.
                </p>
              </div>

              <div>
                <div className="fw-semibold mb-1">Inteligencia artificial</div>
                <CFormCheck
                  type="radio"
                  name="backend"
                  id="backend-cli"
                  label="Claude Code con la sesión de Claude de esta PC (sin clave de API ni costo extra)"
                  checked={s.backend === "cli"}
                  onChange={() => save({ backend: "cli" })}
                />
                <CFormCheck
                  type="radio"
                  name="backend"
                  id="backend-api"
                  label="API de Claude (con clave propia, se cobra por uso)"
                  checked={s.backend === "api"}
                  onChange={() => save({ backend: "api" })}
                  disabled={!s.aiKeyConfigured}
                />
                {!s.aiKeyConfigured && <div className="small text-body-secondary ms-4">Para elegir la API, primero cargá la clave abajo.</div>}

                {s.backend === "cli" ? (
                  <div className="mt-2" style={{ maxWidth: 360 }}>
                    <label className="small text-body-secondary" htmlFor="cliModel">Modelo</label>
                    <CFormSelect id="cliModel" size="sm" value={s.cliModel} onChange={(e) => save({ cliModel: e.target.value })}>
                      {CLI_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </CFormSelect>
                  </div>
                ) : (
                  <div className="mt-2 d-flex gap-2 flex-wrap">
                    <div style={{ minWidth: 220 }}>
                      <label className="small text-body-secondary" htmlFor="apiModel">Modelo</label>
                      <CFormSelect id="apiModel" size="sm" value={s.model} onChange={(e) => save({ model: e.target.value })}>
                        {API_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </CFormSelect>
                    </div>
                    <div style={{ minWidth: 200 }}>
                      <label className="small text-body-secondary" htmlFor="effort">Esfuerzo</label>
                      <CFormSelect id="effort" size="sm" value={s.effort} onChange={(e) => save({ effort: e.target.value })}>
                        {EFFORTS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </CFormSelect>
                    </div>
                  </div>
                )}

                <div className="mt-2" style={{ maxWidth: 420 }}>
                  <label className="small text-body-secondary" htmlFor="apiKey">
                    Clave de la API de Claude (opcional) {s.aiKeyConfigured ? "· ✅ cargada" : ""}
                  </label>
                  <CFormInput
                    id="apiKey"
                    size="sm"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    placeholder={s.aiKeyConfigured ? "Cargada (escribí otra para reemplazarla)" : "sk-ant-…"}
                    onChange={(e) => setApiKey(e.target.value)}
                    onBlur={async () => {
                      if (apiKey.trim() && (await save({ anthropicKey: apiKey.trim() }))) setApiKey("");
                    }}
                  />
                  <div className="small text-body-secondary">Se guarda sola al salir del campo, solo en esta PC.</div>
                </div>

                <div className="mt-2 small d-flex align-items-center gap-2">
                  <span>{ai ? `${ai.ok ? "✅" : "❌"} ${ai.detail}` : "Verificando la IA…"}</span>
                  <CButton size="sm" color="secondary" variant="ghost" onClick={() => save({})} disabled={saving === "saving"}>
                    Volver a verificar
                  </CButton>
                </div>
              </div>

              <div>
                <div className="fw-semibold mb-1">Esta PC</div>
                <ul className="small mb-0 ps-3">
                  <li>Base de datos local (carpeta <code>.local-db</code> del proyecto): los datos no salen de esta PC.</li>
                  <li>La base de datos, la app y el conector arrancan solos al iniciar Windows.</li>
                  <li>La sesión de WhatsApp y la configuración se guardan solo acá (nada se publica en Vercel).</li>
                </ul>
              </div>
            </CCardBody>
          </CCard>
        </div>

        <div className="col-lg-5 d-flex flex-column gap-4">
          <CCard>
            <CCardHeader className="fw-semibold">Cómo usarlo</CCardHeader>
            <CCardBody className="small">
              <p className="mb-2">En tu chat <strong>&quot;Tú&quot;</strong> de WhatsApp escribí, por ejemplo:</p>
              <ul className="ps-3 mb-2">
                <li><em>¿Cuánto llevamos gastado en Puente Río Claro?</em></li>
                <li><em>Anotá 500 mil de cemento para Puente Río Claro, pagado en efectivo</em></li>
                <li>Una foto o PDF de un comprobante, con una frase de a qué obra va.</li>
              </ul>
              <p className="mb-0">
                Para registrar, el agente te manda una propuesta con un código: respondé <strong>OK 1234</strong> (con ese código)
                para guardarla o <strong>NO 1234</strong> para descartarla. Nada se registra sin ese OK.
              </p>
            </CCardBody>
          </CCard>
          {activity}
        </div>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        title="Desvincular WhatsApp"
        message="El agente deja de responder hasta que vuelvas a escanear un QR. La cuenta de WhatsApp del teléfono no se toca. ¿Seguimos?"
        confirmLabel="Desvincular"
        busy={busy === "logout"}
        onCancel={() => setConfirmLogout(false)}
        onConfirm={async () => {
          setConfirmLogout(false);
          await command("logout");
        }}
      />
    </>
  );
}
