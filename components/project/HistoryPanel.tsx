"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CCard, CCardBody, CCardHeader } from "@coreui/react";
import { dayjs, TZ } from "@/lib/dayjs";

// Historial de cambios de una obra (ficha del proyecto). Lee
// /api/projects/[id]/history — ver lib/history.ts para cómo se anota.

interface HistoryEntry {
  id: string;
  action: string;
  field: string | null;
  before: string | null;
  after: string | null;
  detail: string | null;
  source: string;
  createdAt: string;
}

type Filter = "todo" | "obra" | "registros" | "archivos";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "todo", label: "Todo" },
  { key: "obra", label: "Datos de la obra" },
  { key: "registros", label: "Gastos y registros" },
  { key: "archivos", label: "Archivos" },
];

const ACTION_ICON: Record<string, string> = {
  campo: "✏️",
  registro_agregado: "➕",
  registro_editado: "📝",
  registro_borrado: "🗑️",
  archivo: "📎",
};

const ACTION_LABEL: Record<string, string> = {
  campo: "Dato de la obra cambiado",
  registro_agregado: "Registro agregado",
  registro_editado: "Registro editado",
  registro_borrado: "Registro borrado",
  archivo: "Archivo subido",
};

function matchesFilter(e: HistoryEntry, f: Filter): boolean {
  if (f === "todo") return true;
  if (f === "obra") return e.action === "campo";
  if (f === "archivos") return e.action === "archivo";
  return e.action.startsWith("registro_");
}

function dayLabel(key: string): string {
  const today = dayjs().tz(TZ).format("YYYY-MM-DD");
  const yesterday = dayjs().tz(TZ).subtract(1, "day").format("YYYY-MM-DD");
  if (key === today) return "Hoy";
  if (key === yesterday) return "Ayer";
  const s = dayjs.tz(key, TZ).format("dddd D [de] MMMM");
  const withYear = key.slice(0, 4) !== today.slice(0, 4) ? `${s} de ${key.slice(0, 4)}` : s;
  return withYear.charAt(0).toUpperCase() + withYear.slice(1);
}

function entryText(e: HistoryEntry): React.ReactNode {
  if (e.action === "campo" && e.field) {
    return (
      <>
        <span className="hist-field">{e.field}:</span>{" "}
        <span className="hist-before">{e.before ?? "—"}</span>
        <span className="hist-arrow" aria-label="pasó a"> → </span>
        <span className="hist-after">{e.after ?? "—"}</span>
      </>
    );
  }
  return e.detail ?? ACTION_LABEL[e.action] ?? "Cambio";
}

export default function HistoryPanel({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todo");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/history`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "No se pudo cargar el historial.");
      setEntries(Array.isArray(body) ? body : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el historial.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { todo: 0, obra: 0, registros: 0, archivos: 0 };
    for (const e of entries) for (const f of FILTERS) if (matchesFilter(e, f.key)) c[f.key]++;
    return c;
  }, [entries]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: HistoryEntry[] }[] = [];
    for (const e of entries) {
      if (!matchesFilter(e, filter)) continue;
      const key = dayjs(e.createdAt).tz(TZ).format("YYYY-MM-DD");
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: dayLabel(key), items: [] };
        out.push(g);
      }
      g.items.push(e);
    }
    return out;
  }, [entries, filter]);

  return (
    <CCard className="mb-4 hist-card">
      <CCardHeader className="hist-head">
        <div>
          <span className="fw-semibold fs-5">🕘 Historial de cambios</span>
          <div className="hist-sub">Qué cambió en esta obra, cuándo y desde dónde.</div>
        </div>
        <button type="button" className="hist-refresh" onClick={load} disabled={loading}>
          {loading ? "Cargando…" : "Actualizar"}
        </button>
      </CCardHeader>
      <CCardBody>
        <p className="hist-note">
          Todavía no hay usuarios con contraseña: se registra desde dónde se hizo el cambio (app o WhatsApp), no la persona.
        </p>

        <div className="hist-chips" role="group" aria-label="Filtrar historial">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`hist-chip${filter === f.key ? " is-active" : ""}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {!loading && !error && <span className="hist-chip-count">{counts[f.key]}</span>}
            </button>
          ))}
        </div>

        {loading && entries.length === 0 && (
          <div className="hist-skeleton" aria-busy="true" aria-label="Cargando historial">
            <div className="hist-sk hist-sk-day" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="hist-sk-row">
                <div className="hist-sk hist-sk-dot" />
                <div className="hist-sk hist-sk-line" style={{ width: `${80 - i * 12}%` }} />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="hist-error" role="alert">
            <span>{error}</span>
            <button type="button" className="hist-refresh" onClick={load}>
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="hist-empty">
            Todavía no hay cambios registrados. A partir de ahora cada cambio queda anotado acá.
          </div>
        )}

        {!error && entries.length > 0 && groups.length === 0 && (
          <div className="hist-empty">No hay cambios de este tipo todavía.</div>
        )}

        {!error &&
          groups.map((g) => (
            <section key={g.key} className="hist-day">
              <h3 className="hist-day-label">{g.label}</h3>
              <ol className="hist-list">
                {g.items.map((e) => {
                  const isWa = e.source.startsWith("WhatsApp");
                  return (
                    <li key={e.id} className={`hist-item hist-${e.action}`}>
                      <span className="hist-icon" title={ACTION_LABEL[e.action]} aria-hidden="true">
                        {ACTION_ICON[e.action] ?? "•"}
                      </span>
                      <div className="hist-body">
                        <div className="hist-text">{entryText(e)}</div>
                        <div className="hist-meta">
                          <time dateTime={e.createdAt}>{dayjs(e.createdAt).tz(TZ).format("HH:mm")}</time>
                          <span className={`hist-source${isWa ? " is-wa" : ""}`}>{e.source}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
      </CCardBody>
    </CCard>
  );
}
