"use client";

import { useCallback, useEffect, useState } from "react";
import { CCard, CCardBody, CCardHeader, CBadge, CButton, CAlert, CSpinner } from "@coreui/react";
import ConfirmDialog from "@/components/ConfirmDialog";
import AgentChat from "./AgentChat";

// Sección de /agente-whatsapp cuando la app corre en la misma PC que el
// conector (modo local): chat en vivo con el agente, QR para vincular y
// estado de la conexión. Habla con el conector a través de
// /api/whatsapp/local/*, que solo responde desde esta PC.

export interface LocalState {
  available: boolean;
  status: string;
  qr: string | null;
  phone: string | null;
  name: string | null;
  lastError: string | null;
}

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
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

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
          <div className="label">Último mensaje recibido</div>
          <div className="value" style={{ fontSize: "1.3rem" }}>{lastInboundAt ? fmtDateTime(lastInboundAt) : "—"}</div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-7">
          {connected ? (
            <AgentChat connected={connected} />
          ) : (
            <CCard>
              <CCardHeader className="d-flex align-items-center gap-2">
                <span className="fw-semibold">Vincular WhatsApp</span>
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
                ) : (
                  <p className="mb-0">
                    <CSpinner size="sm" className="me-2" />
                    {s.status === "reiniciando" ? "Reiniciando el conector…" : "Conectando con WhatsApp…"}
                  </p>
                )}
                {s.lastError && <CAlert color="warning" className="py-2 mt-3 mb-0 small">{s.lastError}</CAlert>}
              </CCardBody>
            </CCard>
          )}
        </div>

        <div className="col-lg-5 d-flex flex-column gap-4">
          <CCard>
            <CCardHeader className="d-flex align-items-center gap-2">
              <span className="fw-semibold">Conexión con WhatsApp</span>
              <CBadge color={badge.color} className="ms-auto">{badge.label}</CBadge>
            </CCardHeader>
            <CCardBody>
              {connected ? (
                <>
                  <p className="mb-2 small">
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
                <p className="mb-0 small">Escaneá el QR de la izquierda para vincular la cuenta.</p>
              )}
            </CCardBody>
          </CCard>

          <CCard>
            <CCardHeader className="fw-semibold">Cómo usarlo</CCardHeader>
            <CCardBody className="small">
              <p className="mb-2">
                Escribile al agente en el chat de acá o en tu chat <strong>&quot;Tú&quot;</strong> de WhatsApp: es la misma
                conversación. Por ejemplo:
              </p>
              <ul className="ps-3 mb-2">
                <li><em>¿Cuánto llevamos gastado en Puente Río Claro?</em></li>
                <li><em>Anotá 500 mil de cemento para Puente Río Claro, pagado en efectivo</em></li>
                <li>Una foto o PDF de un comprobante (desde el teléfono), con una frase de a qué obra va.</li>
              </ul>
              <p className="mb-2">
                Para registrar, el agente te manda una propuesta: tocá <strong>Confirmar</strong> acá o respondé{" "}
                <strong>OK</strong> y el código en WhatsApp. Nada se registra sin esa confirmación.
              </p>
              <p className="mb-0 text-body-secondary">
                👤 Solo atiende a la cuenta vinculada; no lee ni responde otros chats. Sus mensajes llevan 🤖.
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
