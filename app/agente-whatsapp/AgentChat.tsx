"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { CButton, CFormTextarea, CSpinner } from "@coreui/react";
import { dayjs, TZ } from "@/lib/dayjs";
import MembyAvatar from "./MembyAvatar";

// Chat con Memby dentro de /agente-whatsapp (modo local). Es la misma
// conversación que el chat "Tú" de WhatsApp: lo que se escribe acá se envía
// POR WhatsApp y Memby lo procesa por su flujo normal. Confirmar / Descartar
// una propuesta manda "OK código" / "NO código", igual que responderlo a mano.

interface ChatMessage {
  id: string;
  from: "user" | "agent";
  text: string;
  mediaId: string | null;
  createdAt: string;
  proposal: { id: string; kind: string; status: string; code: string | null } | null;
}

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Esperando confirmación",
  ejecutando: "Registrando…",
  confirmada: "Registrada",
  cancelada: "Descartada",
  fallida: "Falló",
  vencida: "Venció",
};
const SUGGESTIONS = [
  "¿Cuánto llevamos gastado en ",
  "Anotá un gasto de ",
  "¿Qué tengo pendiente de confirmar?",
  "Dame un resumen general",
];

/** *negrita* de WhatsApp -> <strong>, respetando saltos de línea. Sin HTML del mensaje. */
function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {parts.map((p, i) => (/^\*[^*\n]+\*$/.test(p) ? <strong key={i}>{p.slice(1, -1)}</strong> : <span key={i}>{p}</span>))}
    </span>
  );
}

/** En la pantalla la propuesta tiene botones: se quitan las instrucciones del código y el prefijo 🤖. */
function cleanBot(text: string) {
  return text.replace(/^🤖\s*/, "").replace(/\n*👉 Para registrar respondé[\s\S]*$/, "").trim();
}
function cleanUser(text: string) {
  return text.replace(/^\[Mandó (una foto|un PDF) — comprobanteId \w+\]\s*/, "");
}

function dayLabel(iso: string) {
  const d = dayjs(iso).tz(TZ);
  const today = dayjs().tz(TZ);
  if (d.isSame(today, "day")) return "Hoy";
  if (d.isSame(today.subtract(1, "day"), "day")) return "Ayer";
  return d.format("dddd D [de] MMMM");
}

export default function AgentChat({ connected }: { connected: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitingReply, setWaitingReply] = useState(false);
  const body = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const seen = useRef<Set<string> | null>(null);
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

  // Scroll al final cuando llega algo nuevo.
  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      const el = body.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: seen.current ? "smooth" : "auto" });
    }
  }, [messages.length, waitingReply]);

  // Solo los mensajes que llegan después de abrir la pantalla entran con animación.
  const isNew = (id: string) => {
    if (!seen.current) return false;
    return !seen.current.has(id);
  };
  useEffect(() => {
    if (!loaded) return;
    const s = seen.current ?? new Set<string>();
    const wasInit = seen.current !== null;
    const t = setTimeout(() => {
      messages.forEach((m) => s.add(m.id));
      seen.current = s;
    }, wasInit ? 700 : 0);
    return () => clearTimeout(t);
  }, [messages, loaded]);

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

  let lastDay = "";
  return (
    <div className="memby-chat-card">
      <div className="memby-chat-head">
        <MembyAvatar size={38} online={connected} />
        <div>
          <div className="who">Memby</div>
          <div className="st">{waitingReply ? "escribiendo…" : connected ? "en línea · tu chat \"Tú\" de WhatsApp" : "desconectado"}</div>
        </div>
      </div>

      <div className="memby-chat-body" ref={body}>
        {!loaded && <p className="state-message py-3 mb-0">Cargando…</p>}
        {loaded && messages.length === 0 && (
          <div className="text-center my-auto px-4 animate__animated animate__fadeIn">
            <MembyAvatar size={64} />
            <p className="mt-3 mb-1 fw-semibold">¡Hola! Soy Memby.</p>
            <p className="small text-body-secondary mb-0">
              Preguntame por tus obras o pedime que anote un gasto. Podés escribirme acá o en tu chat &quot;Tú&quot; de WhatsApp.
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const day = dayLabel(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = m.from === "user";
          const prev = messages[i - 1];
          const firstOfGroup = !prev || prev.from !== m.from || showDay;
          const p = m.proposal;
          const anim = isNew(m.id) ? ` animate__animated ${mine ? "animate__fadeInRight" : "animate__fadeInUp"} animate__faster` : "";
          return (
            <Fragment key={m.id}>
              {showDay && <div className="memby-day">{day}</div>}
              <div className={`memby-row${mine ? " me" : ""}`} style={{ marginTop: firstOfGroup ? 8 : 0 }}>
                {!mine && (firstOfGroup ? <MembyAvatar size={30} /> : <span className="spacer" />)}
                <div className={`memby-bubble ${mine ? "me" : "bot"}${anim}`}>
                  {m.mediaId && (
                    <a className="attach" href={`/api/inbound-media/${m.mediaId}`} target="_blank" rel="noreferrer">📎 Ver comprobante</a>
                  )}
                  {p ? (
                    <div className="memby-ticket">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <span className="small fw-semibold">Propuesta</span>
                        <span className={`memby-chip ${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                      </div>
                      <WaText text={cleanBot(m.text)} />
                      {p.status === "pendiente" && p.code && (
                        <div className="memby-ticket-actions">
                          <CButton size="sm" color="success" disabled={sending || !connected} onClick={() => send(`OK ${p.code}`)}>
                            ✅ Confirmar
                          </CButton>
                          <CButton size="sm" color="secondary" variant="outline" disabled={sending || !connected} onClick={() => send(`NO ${p.code}`)}>
                            Descartar
                          </CButton>
                          <span className="small text-body-secondary">código {p.code}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <WaText text={mine ? cleanUser(m.text) : cleanBot(m.text)} />
                  )}
                  <span className="time">{dayjs(m.createdAt).tz(TZ).format("HH:mm")}</span>
                </div>
              </div>
            </Fragment>
          );
        })}
        {waitingReply && (
          <div className="memby-row mt-2 animate__animated animate__fadeIn">
            <MembyAvatar size={30} />
            <div className="memby-bubble bot memby-typing" aria-label="Memby está escribiendo">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      {connected && !draft && (
        <div className="memby-suggest">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                if (s.endsWith(" ")) {
                  setDraft(s);
                  setTimeout(() => input.current?.focus(), 0);
                } else send(s);
              }}
            >
              {s.trim()}
              {s.endsWith(" ") ? "…" : ""}
            </button>
          ))}
        </div>
      )}
      <form
        className="memby-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <CFormTextarea
          ref={input}
          rows={1}
          value={draft}
          placeholder={connected ? "Escribile a Memby…" : "WhatsApp no está conectado"}
          disabled={!connected || sending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        <CButton type="submit" color="primary" className="memby-send" disabled={!connected || sending || !draft.trim()} aria-label="Enviar">
          {sending ? <CSpinner size="sm" /> : "➤"}
        </CButton>
      </form>
      {error && <div className="px-3 pb-3 small text-danger">{error}</div>}
    </div>
  );
}
