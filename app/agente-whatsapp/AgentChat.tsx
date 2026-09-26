"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CCard, CCardBody, CCardHeader, CBadge, CButton, CFormTextarea, CSpinner } from "@coreui/react";

// Chat con el agente dentro de /agente-whatsapp (modo local). Muestra la
// misma conversación que el chat "Tú" de WhatsApp y permite escribirle al
// agente desde acá: el mensaje se envía POR WhatsApp (aparece en el teléfono)
// y el agente lo procesa por su flujo normal. Confirmar / Descartar una
// propuesta manda "OK código" / "NO código", igual que responderlo a mano.

interface ChatMessage {
  id: string;
  from: "user" | "agent";
  text: string;
  mediaId: string | null;
  createdAt: string;
  proposal: { id: string; kind: string; status: string; code: string | null } | null;
}

const STATUS: Record<string, { label: string; color: string }> = {
  pendiente: { label: "Esperando confirmación", color: "warning" },
  ejecutando: { label: "Registrando…", color: "info" },
  confirmada: { label: "Registrada", color: "success" },
  cancelada: { label: "Descartada", color: "secondary" },
  fallida: { label: "Falló", color: "danger" },
  vencida: { label: "Venció", color: "secondary" },
};

function time(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("es-PY", today ? { timeStyle: "short" } : { dateStyle: "short", timeStyle: "short" });
}

/** *negrita* de WhatsApp -> <strong>, respetando saltos de línea. Sin HTML del mensaje. */
function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {parts.map((p, i) => (/^\*[^*\n]+\*$/.test(p) ? <strong key={i}>{p.slice(1, -1)}</strong> : <span key={i}>{p}</span>))}
    </span>
  );
}

/** Quita del texto de la tarjeta las instrucciones del código: en la pantalla están los botones. */
function cardText(text: string) {
  return text.replace(/\n*👉 Para registrar respondé[\s\S]*$/, "").trim();
}

export default function AgentChat({ connected }: { connected: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitingReply, setWaitingReply] = useState(false);
  const bottom = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/conversation", { cache: "no-store" });
      const j = await r.json();
      if (Array.isArray(j.messages)) {
        setMessages(j.messages);
        const last = j.messages[j.messages.length - 1];
        if (last && last.from === "agent") setWaitingReply(false);
      }
    } catch {
      /* se reintenta */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages.length]);

  async function send(text: string) {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setError(null);
    try {
      const r = await fetch("/api/whatsapp/local/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "No se pudo enviar.");
      setDraft("");
      setWaitingReply(true);
      setTimeout(load, 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <CCard>
      <CCardHeader className="d-flex align-items-center gap-2">
        <span className="fw-semibold">💬 Chat con el agente</span>
        <span className="ms-auto small text-body-secondary">Es tu chat &quot;Tú&quot; de WhatsApp, en vivo</span>
      </CCardHeader>
      <CCardBody className="p-0">
        <div
          className="px-3 py-3 d-flex flex-column gap-2"
          style={{ height: 460, overflowY: "auto", background: "var(--cui-tertiary-bg, rgba(0,0,0,.03))" }}
        >
          {!loaded && <p className="state-message py-3 mb-0">Cargando…</p>}
          {loaded && messages.length === 0 && (
            <p className="empty-col text-center my-auto">
              Todavía no hay mensajes. Escribí abajo o en tu chat &quot;Tú&quot; de WhatsApp, por ejemplo: <em>¿cuánto llevamos
              gastado en Puente Río Claro?</em>
            </p>
          )}
          {messages.map((m) => {
            const mine = m.from === "user";
            const p = m.proposal;
            const st = p ? STATUS[p.status] ?? { label: p.status, color: "secondary" } : null;
            return (
              <div key={m.id} className={`d-flex ${mine ? "justify-content-end" : "justify-content-start"}`}>
                <div
                  className="px-3 py-2 shadow-sm"
                  style={{
                    maxWidth: "82%",
                    borderRadius: 12,
                    background: mine ? "var(--ok-soft, #dcf8c6)" : "var(--surface, #fff)",
                    border: "1px solid var(--line, rgba(0,0,0,.08))",
                  }}
                >
                  {!mine && <div className="small fw-semibold mb-1">🤖 Agente</div>}
                  {m.mediaId ? (
                    <div className="mb-1">
                      <a href={`/api/inbound-media/${m.mediaId}`} target="_blank" rel="noreferrer">📎 Ver comprobante</a>
                    </div>
                  ) : null}
                  <WaText text={p ? cardText(m.text) : m.text.replace(/^\[Mandó (una foto|un PDF) — comprobanteId \w+\]\s*/, "")} />
                  {p && st && (
                    <div className="mt-2 pt-2 border-top d-flex align-items-center gap-2 flex-wrap">
                      <CBadge color={st.color}>{st.label}</CBadge>
                      {p.status === "pendiente" && p.code && (
                        <>
                          <CButton size="sm" color="success" disabled={sending || !connected} onClick={() => send(`OK ${p.code}`)}>
                            ✅ Confirmar
                          </CButton>
                          <CButton size="sm" color="secondary" variant="outline" disabled={sending || !connected} onClick={() => send(`NO ${p.code}`)}>
                            Descartar
                          </CButton>
                          <span className="small text-body-secondary">código {p.code}</span>
                        </>
                      )}
                    </div>
                  )}
                  <div className="text-end small text-body-secondary mt-1" style={{ fontSize: ".72rem" }}>{time(m.createdAt)}</div>
                </div>
              </div>
            );
          })}
          {waitingReply && (
            <div className="d-flex justify-content-start">
              <div className="px-3 py-2 small text-body-secondary" style={{ borderRadius: 12, border: "1px dashed var(--line, #ccc)" }}>
                <CSpinner size="sm" className="me-2" />El agente está escribiendo…
              </div>
            </div>
          )}
          <div ref={bottom} />
        </div>
        <form
          className="d-flex gap-2 p-3 border-top align-items-end"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <CFormTextarea
            rows={1}
            value={draft}
            placeholder={connected ? "Escribile al agente… (Enter envía, Shift+Enter nueva línea)" : "WhatsApp no está conectado"}
            disabled={!connected || sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            style={{ resize: "none" }}
          />
          <CButton type="submit" color="primary" disabled={!connected || sending || !draft.trim()}>
            {sending ? <CSpinner size="sm" /> : "Enviar"}
          </CButton>
        </form>
        {error && <div className="px-3 pb-3 small text-danger">{error}</div>}
      </CCardBody>
    </CCard>
  );
}
