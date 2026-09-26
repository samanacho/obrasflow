"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { CButton, CFormTextarea, CSpinner } from "@coreui/react";
import { dayjs, TZ } from "@/lib/dayjs";
import MembyAvatar from "./MembyAvatar";

// Chat con Memby dentro de /agente-whatsapp (modo local). Es la misma
// conversación que el chat "Tú" de WhatsApp: lo que se escribe acá se envía
// POR WhatsApp y Memby lo procesa por su flujo normal. Confirmar / Descartar
// una propuesta manda "OK código" / "NO código", igual que responderlo a mano.
// Fotos y PDF (botón 📎, arrastrar o pegar) también se mandan por WhatsApp.

interface ChatMessage {
  id: string;
  from: "user" | "agent";
  text: string;
  mediaId: string | null;
  media: { mimeType: string; filename: string | null } | null;
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

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE = 4 * 1024 * 1024;

/** Formato de WhatsApp (*negrita*, _cursiva_, ~tachado~, `código`) y enlaces, sin HTML del mensaje. */
const WA_TOKEN = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s]+)/g;
function WaText({ text }: { text: string }) {
  const parts = text.split(WA_TOKEN);
  return (
    <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {parts.map((p, i) => {
        if (/^\*[^*\n]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
        if (/^_[^_\n]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
        if (/^~[^~\n]+~$/.test(p)) return <s key={i}>{p.slice(1, -1)}</s>;
        if (/^`[^`\n]+`$/.test(p)) return <code key={i}>{p.slice(1, -1)}</code>;
        if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a>;
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

/** Avisos que Memby manda solo (presupuesto, propuestas sin confirmar, resumen del día). */
function isNotice(text: string) {
  return /^(🤖\s*)?(⚠️ Aviso de presupuesto|⏰ \*Tenés|📊 \*Resumen de hoy)/u.test(text);
}

/** Nota de voz transcripta ("🎤 …") o que no se pudo transcribir ("[🎤 Nota de voz]"). */
function isVoice(text: string) {
  return /^\[?🎤/u.test(text);
}

function readBase64(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => fail(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(file);
  });
}

/** En la pantalla la propuesta tiene botones: se quitan las instrucciones del código y el prefijo 🤖. */
function cleanBot(text: string) {
  return text.replace(/^🤖\s*/, "").replace(/\n*👉 Para registrar respondé[\s\S]*$/, "").trim();
}
function cleanUser(text: string) {
  return text
    .replace(/^\[Mandó (una foto|un PDF) — comprobanteId \w+\]\s*/, "")
    .replace(/^\[🎤 Nota de voz\]$/u, "")
    .replace(/^🎤\s*/u, "");
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
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
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

  function pickFile(f: File | null | undefined) {
    if (!f) return;
    setError(null);
    if (!ACCEPT.includes(f.type)) return setError("Solo fotos (JPG, PNG, WEBP) o PDF.");
    if (f.size > MAX_FILE) return setError("El archivo pesa más de 4 MB.");
    setFile(f);
    setTimeout(() => input.current?.focus(), 0);
  }

  async function sendFile() {
    if (!file) return;
    setSending(true);
    setError(null);
    try {
      const r = await fetch("/api/whatsapp/local/send-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: await readBase64(file), mimeType: file.type, fileName: file.name, caption: draft.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "No se pudo enviar el archivo.");
      setFile(null);
      setDraft("");
      setWaitingReply(true);
      setTimeout(load, 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const submit = () => (file ? sendFile() : send(draft));

  let lastDay = "";
  return (
    <div
      className={`memby-chat-card${dragging ? " is-drop" : ""}`}
      onDragOver={(e) => {
        if (!connected || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (connected) pickFile(e.dataTransfer.files?.[0]);
      }}
    >
      {dragging && <div className="memby-drop">Soltá la foto o el PDF para mandárselo a Memby</div>}
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
                <div className={`memby-bubble ${mine ? "me" : "bot"}${!mine && isNotice(m.text) ? " notice" : ""}${anim}`}>
                  {!mine && isNotice(m.text) && <span className="memby-notice-tag">🔔 Aviso automático</span>}
                  {m.mediaId &&
                    (m.media?.mimeType.startsWith("image/") ? (
                      <a className="memby-thumb" href={`/api/inbound-media/${m.mediaId}`} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/inbound-media/${m.mediaId}`} alt="Comprobante" loading="lazy" />
                      </a>
                    ) : (
                      <a className="attach" href={`/api/inbound-media/${m.mediaId}`} target="_blank" rel="noreferrer">
                        📄 {m.media?.filename || "Ver comprobante"}
                      </a>
                    ))}
                  {mine && isVoice(m.text) && <span className="memby-voice-tag">🎤 Nota de voz</span>}
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
                    mine && isVoice(m.text) ? (
                      <em className="memby-voice-text">{cleanUser(m.text) ? `“${cleanUser(m.text)}”` : "(no se pudo transcribir)"}</em>
                    ) : (
                      <WaText text={mine ? cleanUser(m.text) : cleanBot(m.text)} />
                    )
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

      {connected && !draft && !file && (
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
      {file && (
        <div className="memby-file animate__animated animate__fadeInUp animate__faster">
          <span className="ico">{file.type === "application/pdf" ? "📄" : "🖼️"}</span>
          <span className="name">{file.name}</span>
          <span className="size">{Math.max(1, Math.round(file.size / 1024))} KB</span>
          <button type="button" aria-label="Quitar archivo" onClick={() => setFile(null)} disabled={sending}>
            ✕
          </button>
        </div>
      )}
      <form
        className="memby-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT.join(",")}
          hidden
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="memby-attach"
          aria-label="Adjuntar foto o PDF"
          title="Adjuntar foto o PDF (también podés arrastrarlo o pegarlo)"
          disabled={!connected || sending}
          onClick={() => fileInput.current?.click()}
        >
          📎
        </button>
        <CFormTextarea
          ref={input}
          rows={1}
          value={draft}
          placeholder={!connected ? "WhatsApp no está conectado" : file ? "Agregá un comentario (opcional)…" : "Escribile a Memby…"}
          disabled={!connected || sending}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const f = Array.from(e.clipboardData.files ?? [])[0];
            if (f) {
              e.preventDefault();
              pickFile(f);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <CButton type="submit" color="primary" className="memby-send" disabled={!connected || sending || (!draft.trim() && !file)} aria-label="Enviar">
          {sending ? <CSpinner size="sm" /> : "➤"}
        </CButton>
      </form>
      {error && <div className="px-3 pb-3 small text-danger">{error}</div>}
    </div>
  );
}
