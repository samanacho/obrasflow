"use client";

import { useCallback, useEffect, useState } from "react";
import { CCard, CCardBody, CCardHeader, CButton, CAlert, CSpinner } from "@coreui/react";
import { confirmar, notificar } from "@/lib/ui/alerts";
import { haceCuanto } from "@/lib/dayjs";
import AgentChat from "./AgentChat";
import MembyAvatar from "./MembyAvatar";

// Pantalla de Memby cuando la app corre en la misma PC que el conector (modo
// local): encabezado con el estado, chat en vivo, QR para vincular y datos
// de uso. Habla con el conector por /api/whatsapp/local/* (solo esta PC).

export interface LocalState {
  available: boolean;
  status: string;
  qr: string | null;
  phone: string | null;
  name: string | null;
  lastError: string | null;
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
  stats,
}: {
  state: LocalState;
  refresh: () => Promise<void>;
  lastInboundAt: string | null;
  stats: { inbound7: number; confirmadas: number; esperando: number } | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function command(c: "restart" | "logout") {
    if (c === "logout") {
      const ok = await confirmar({
        titulo: "¿Desvincular WhatsApp?",
        texto: "Memby deja de responder hasta que vuelvas a escanear un QR. La cuenta de WhatsApp del teléfono no se toca.",
        confirmar: "Desvincular",
        peligro: true,
      });
      if (!ok) return;
    }
    setBusy(c);
    try {
      await fetch("/api/whatsapp/local/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: c }) });
      notificar(c === "logout" ? "Desvinculando… en unos segundos aparece un QR nuevo" : "Reconectando con WhatsApp…", "info");
      setTimeout(refresh, 1500);
    } finally {
      setBusy(null);
    }
  }

  const s = state;
  const connected = s.status === "conectado";
  const pill = connected
    ? { cls: "is-on", label: "Conectado" }
    : s.status === "esperando_qr"
      ? { cls: "is-wait", label: "Esperando vinculación" }
      : s.status === "desconectado"
        ? { cls: "is-off", label: "Desconectado" }
        : { cls: "is-wait", label: "Conectando…" };

  return (
    <>
      <section className="memby-hero animate__animated animate__fadeIn">
        <MembyAvatar size={64} online={connected} />
        <div>
          <h1 className="memby-hero-name">Memby</h1>
          <p className="memby-hero-sub">Tu asistente de obras por WhatsApp · consulta, anota y te pide confirmación antes de registrar</p>
        </div>
        <div className="memby-hero-status">
          <span className={`memby-pill ${pill.cls}`}>
            <span className="dot" />
            {pill.label}
            {connected && (s.name || s.phone) ? ` · ${s.name || `+${s.phone}`}` : ""}
          </span>
          {connected && (
            <>
              <CButton size="sm" color="secondary" variant="outline" disabled={busy !== null} onClick={() => command("restart")}>
                {busy === "restart" ? <CSpinner size="sm" /> : "Reiniciar"}
              </CButton>
              <CButton size="sm" color="danger" variant="outline" disabled={busy !== null} onClick={() => command("logout")}>
                Desvincular
              </CButton>
            </>
          )}
        </div>
      </section>

      <div className="row g-4">
        <div className="col-lg-8">
          {connected ? (
            <AgentChat connected={connected} />
          ) : (
            <CCard className="animate__animated animate__fadeIn">
              <CCardHeader className="fw-semibold">Vincular WhatsApp</CCardHeader>
              <CCardBody>
                {s.status === "esperando_qr" && s.qr ? (
                  <div className="d-flex flex-wrap gap-4 align-items-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.qr} alt="Código QR para vincular WhatsApp" width={260} height={260} style={{ background: "#fff", padding: 8, borderRadius: 12 }} />
                    <div style={{ flex: "1 1 240px" }}>
                      <p className="fw-semibold mb-2">Escanealo con el teléfono de la cuenta que va a usar Memby:</p>
                      <ol className="ps-3 mb-2">
                        <li>Abrí <strong>WhatsApp</strong> (o WhatsApp Business) en ese teléfono.</li>
                        <li>Tocá <strong>⋮</strong> (Android) o <strong>Configuración</strong> (iPhone) &gt; <strong>Dispositivos vinculados</strong>.</li>
                        <li>Tocá <strong>Vincular un dispositivo</strong> y apuntá la cámara a este código.</li>
                      </ol>
                      <p className="small text-body-secondary mb-0">
                        El código se renueva solo. Al escanearlo, la sesión queda guardada en esta PC y se reconecta sola.
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

        <div className="col-lg-4 d-flex flex-column gap-4">
          <CCard className="animate__animated animate__fadeIn">
            <CCardHeader className="fw-semibold">Últimos 7 días</CCardHeader>
            <CCardBody>
              <div className="memby-stats">
                <div className="memby-stat"><div className="n">{stats?.inbound7 ?? 0}</div><div className="l">Mensajes</div></div>
                <div className="memby-stat"><div className="n">{stats?.confirmadas ?? 0}</div><div className="l">Registrados</div></div>
                <div className="memby-stat"><div className="n">{stats?.esperando ?? 0}</div><div className="l">Esperando</div></div>
              </div>
              <p className="small text-body-secondary mt-3 mb-0">
                Último mensaje recibido: {lastInboundAt ? haceCuanto(lastInboundAt) : "todavía ninguno"}.
              </p>
            </CCardBody>
          </CCard>

          <CCard className="animate__animated animate__fadeIn">
            <CCardHeader className="fw-semibold">Cómo hablarle a Memby</CCardHeader>
            <CCardBody className="small">
              <ul className="ps-3 mb-2">
                <li>Preguntale: <em>¿cuánto llevamos gastado en Puente Río Claro?</em></li>
                <li>Pedile que anote: <em>500 mil de cemento para Puente Río Claro, en efectivo</em></li>
                <li>Mandale la foto o PDF de un comprobante: desde el teléfono o con 📎 acá (también podés arrastrarlo o pegarlo).</li>
                <li>Mandale una <strong>nota de voz</strong>: la pasa a texto en esta PC y te responde igual que a un mensaje escrito.</li>
              </ul>
              <p className="mb-2">
                🔔 Te avisa solo cuando una obra llega al 90 % o se pasa del presupuesto, si una propuesta lleva más de 2 horas sin confirmar, y a las 19:00 te manda el resumen del día.
              </p>
              <p className="mb-2">
                Antes de registrar, Memby te muestra una <strong>propuesta</strong>: tocá <strong>Confirmar</strong> acá o respondé{" "}
                <strong>OK</strong> y el código en WhatsApp.
              </p>
              <p className="mb-0 text-body-secondary">
                Solo atiende a la cuenta vinculada, en su chat &quot;Tú&quot;. No lee ni responde otros chats.
              </p>
            </CCardBody>
          </CCard>
        </div>
      </div>
    </>
  );
}
