"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProjectDTO, ProjectItemDTO } from "@/lib/types";
import { ITEM_KINDS, ITEM_KIND_ORDER, ItemField } from "@/lib/itemKinds";

function fmtMoney(n: number) {
  return "$" + Number(n || 0).toLocaleString("es-AR");
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ProjectDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("rfi");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setProject(await res.json());
      } catch {
        setError("No se pudo cargar el proyecto.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div id="app"><p className="state-message">Cargando proyecto…</p></div>;
  if (error || !project) return <div id="app"><p className="state-message form-error">{error || "Proyecto no encontrado."}</p></div>;

  const overBudget = project.spent > project.budget;
  const daysLeft = Math.ceil((new Date(project.end).getTime() - Date.now()) / 86400000);

  return (
    <div id="app">
      <header className="top">
        <div className="brand">
          <Link href="/" className="back-link">← ObrasFlow</Link>
        </div>
      </header>

      <div className="project-hero">
        <div>
          <h1 className="project-title">{project.name}</h1>
          <div className="project-hero-meta">
            <span className={`type-pill type-${project.type}`}>{project.type === "civil" ? "Civil" : project.type === "electrico" ? "Eléctrico" : "Vial"}</span>
            <span className={`status-chip status-${project.status}`}>{project.status.replace("_", " ")}</span>
            <span>{project.manager}</span>
          </div>
        </div>
        <div className="project-hero-kpis">
          <div className="kpi"><div className="label">Presupuesto</div><div className="value mono">{fmtMoney(project.budget)}</div><div className={"sub" + (overBudget ? " alert-text" : "")}>{fmtMoney(project.spent)} ejecutado{overBudget ? " · sobre presupuesto" : ""}</div></div>
          <div className="kpi"><div className="label">Avance</div><div className="value mono">{project.progress}%</div><div className="sub">Estado: {project.status.replace("_", " ")}</div></div>
          <div className="kpi"><div className="label">Fecha fin</div><div className="value mono">{project.end.split("-").reverse().join("/")}</div><div className={"sub" + (daysLeft < 7 && daysLeft >= 0 ? " alert-text" : daysLeft < 0 ? " alert-text" : "")}>{daysLeft < 0 ? `Vencido hace ${Math.abs(daysLeft)}d` : `${daysLeft} días restantes`}</div></div>
        </div>
      </div>

      <nav className="tabs module-tabs">
        {ITEM_KIND_ORDER.map((k) => {
          const cfg = ITEM_KINDS[k];
          return (
            <button key={k} type="button" className={"tab-btn" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>
              {cfg.icon} {cfg.label}
            </button>
          );
        })}
      </nav>

      <ModuleView key={tab} projectId={id} kind={tab} />

      <footer className="credit">Módulo de proyecto — ObrasFlow</footer>
    </div>
  );
}

function ModuleView({ projectId, kind }: { projectId: string; kind: string }) {
  const cfg = ITEM_KINDS[kind];
  const [items, setItems] = useState<ProjectItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProjectItemDTO | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/items?kind=${kind}`);
      setItems(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [projectId, kind]);

  async function handleDelete(item: ProjectItemDTO) {
    if (!confirm(`¿Eliminar "${item.title}"?`)) return;
    const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) setItems((cur) => cur.filter((i) => i.id !== item.id));
  }

  return (
    <div className="panel">
      <div className="module-panel-head">
        <div>
          <h3>{cfg.icon} {cfg.label}</h3>
          <p className="module-desc">{cfg.description}</p>
        </div>
        {!cfg.readOnly && (
          <button className="btn primary" type="button" onClick={() => { setEditing(null); setShowForm(true); }}>
            + Agregar {cfg.singular}
          </button>
        )}
      </div>

      {loading && <p className="empty-col">Cargando…</p>}
      {!loading && items.length === 0 && <p className="empty-col">Sin registros todavía.</p>}

      <ul className="item-list">
        {items.map((item) => (
          <li className="item-row" key={item.id}>
            <div className="item-row-main">
              <span className="item-title">{item.title}</span>
              {item.status && <span className={"status-chip status-generic status-" + item.status.toLowerCase().replace(/\s+/g, "_")}>{item.status}</span>}
            </div>
            <div className="item-row-sub">
              {cfg.summary(item.data)}{cfg.summary(item.data) ? " · " : ""}{fmtDateTime(item.createdAt)}
            </div>
            {item.data?.notas && <div className="item-row-notes">{item.data.notas}</div>}
            {item.data?.respuesta && <div className="item-row-notes">↳ {item.data.respuesta}</div>}
            {item.data?.motivo && <div className="item-row-notes">{item.data.motivo}</div>}
            {!cfg.readOnly && (
              <div className="item-row-actions">
                <button className="btn small" type="button" onClick={() => { setEditing(item); setShowForm(true); }}>Editar</button>
                <button className="btn small danger" type="button" onClick={() => handleDelete(item)}>Eliminar</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {showForm && (
        <ItemFormModal
          projectId={projectId}
          kind={kind}
          existing={editing}
          onClose={() => setShowForm(false)}
          onSaved={(saved) => {
            setShowForm(false);
            setItems((cur) => {
              const idx = cur.findIndex((i) => i.id === saved.id);
              if (idx > -1) { const next = [...cur]; next[idx] = saved; return next; }
              return [saved, ...cur];
            });
          }}
        />
      )}
    </div>
  );
}

function ItemFormModal({
  projectId, kind, existing, onClose, onSaved,
}: {
  projectId: string;
  kind: string;
  existing: ProjectItemDTO | null;
  onClose: () => void;
  onSaved: (item: ProjectItemDTO) => void;
}) {
  const cfg = ITEM_KINDS[kind];
  const [title, setTitle] = useState(existing?.title ?? "");
  const [status, setStatus] = useState(existing?.status ?? cfg.defaultStatus ?? "");
  const [data, setData] = useState<Record<string, any>>(existing?.data ?? {});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setField(key: string, value: string) {
    setData((d) => ({ ...d, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Completá el título."); return; }
    setSaving(true);
    setError(null);
    try {
      const url = existing ? `/api/items/${existing.id}` : `/api/projects/${projectId}/items`;
      const method = existing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title, status: status || null, data }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onSaved(await res.json());
    } catch (err: any) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{existing ? "Editar" : "Nuevo"} {cfg.singular}</h3>
        {error && <p className="form-error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>{cfg.titleLabel}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          {cfg.statusOptions && (
            <div className="field">
              <label>Estado</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {cfg.statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {cfg.fields.map((f: ItemField) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              {f.type === "textarea" ? (
                <textarea rows={3} value={data[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} required={f.required} />
              ) : (
                <input type={f.type} value={data[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} required={f.required} />
              )}
            </div>
          ))}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
