"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ContractorDTO, ContractorHistoryDTO, ContractorHistoryInput, ProjectDTO, ProjectType } from "@/lib/types";

const RUBRO_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial" };

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

function Stars({ value, size }: { value: number | null; size?: "lg" }) {
  if (value === null) return <span className="stars-empty">Sin calificar todavía</span>;
  const rounded = Math.round(value);
  return (
    <span className={"stars" + (size === "lg" ? " stars-lg" : "")}>
      {"★".repeat(rounded)}{"☆".repeat(5 - rounded)} <span className="mono stars-value">{value.toFixed(1)} / 5</span>
    </span>
  );
}

const EMPTY_HISTORY: ContractorHistoryInput = { obraNombre: "", projectId: "", rating: null, comentario: "", fecha: "" };

export default function ContractorDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const [contractor, setContractor] = useState<ContractorDTO | null>(null);
  const [history, setHistory] = useState<ContractorHistoryDTO[]>([]);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ContractorHistoryInput>(EMPTY_HISTORY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [cRes, hRes, pRes] = await Promise.all([
        fetch(`/api/contractors/${id}`),
        fetch(`/api/contractors/${id}/history`),
        fetch(`/api/projects`),
      ]);
      if (!cRes.ok) throw new Error(`HTTP ${cRes.status}`);
      setContractor(await cRes.json());
      setHistory(hRes.ok ? await hRes.json() : []);
      setProjects(pRes.ok ? await pRes.json() : []);
    } catch {
      setError("No se pudo cargar el contratista.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.obraNombre.trim()) { setFormError("El nombre de la obra es obligatorio."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/contractors/${id}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, projectId: form.projectId || null, fecha: form.fecha || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setShowForm(false);
      setForm(EMPTY_HISTORY);
      load();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div id="app"><p className="state-message">Cargando…</p></div>;
  if (error || !contractor) return <div id="app"><p className="state-message form-error">{error || "Contratista no encontrado."}</p></div>;

  return (
    <div id="app">
      <header className="top">
        <div className="brand">
          <Link href="/contratistas" className="back-link">← Contratistas</Link>
        </div>
      </header>

      <div className="project-hero">
        <div>
          <h1 className="project-title">{contractor.name}</h1>
          <div className="project-hero-meta">
            {contractor.rubros.map((r) => <span key={r} className={`type-pill type-${r}`}>{RUBRO_LABEL[r]}</span>)}
            <span className={"status-chip " + (contractor.status === "activo" ? "status-cumplido" : "status-no_aplica")}>{contractor.status}</span>
            {contractor.city && <span>📍 {contractor.city}{contractor.province ? `, ${contractor.province}` : ""}</span>}
          </div>
        </div>
        <div className="project-hero-kpis">
          <div className="kpi"><div className="label">Calificación promedio</div><div className="value"><Stars value={contractor.avgRating} size="lg" /></div><div className="sub">{contractor.historyCount} obra(s) registradas</div></div>
        </div>
      </div>

      <div className="panel">
        <h3>Datos de contacto</h3>
        <div className="contact-grid">
          <div><span className="module-desc">Contacto</span><div>{contractor.contactName || "—"}</div></div>
          <div><span className="module-desc">Celular</span><div>{contractor.phone || "—"}</div></div>
          <div><span className="module-desc">Email</span><div>{contractor.email || "—"}</div></div>
          <div><span className="module-desc">RUC</span><div>{contractor.ruc || "—"}</div></div>
        </div>
        {contractor.notes && <p className="item-row-notes" style={{ marginTop: 12 }}>{contractor.notes}</p>}
      </div>

      <div className="panel">
        <div className="module-panel-head">
          <div>
            <h3>Historial de obras</h3>
            <p className="module-desc">Cada obra trabajada junto a este contratista, con su propia calificación.</p>
          </div>
          <button className="btn primary" type="button" onClick={() => setShowForm(true)}>+ Agregar obra al historial</button>
        </div>

        {history.length === 0 && <p className="empty-col">Sin obras registradas todavía.</p>}
        <ul className="item-list">
          {history.map((h) => (
            <li className="item-row" key={h.id}>
              <div className="item-row-main">
                <span className="item-title">{h.obraNombre}</span>
                {h.rating !== null && <span className="stars">{"★".repeat(h.rating)}{"☆".repeat(5 - h.rating)}</span>}
              </div>
              <div className="item-row-sub">{fmtDate(h.fecha)}</div>
              {h.comentario && <div className="item-row-notes">{h.comentario}</div>}
            </li>
          ))}
        </ul>

        {showForm && (
          <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
            <div className="modal">
              <h3>Agregar obra al historial</h3>
              {formError && <p className="form-error">{formError}</p>}
              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label>Nombre de la obra</label>
                  <input value={form.obraNombre} onChange={(e) => setForm({ ...form, obraNombre: e.target.value })} required />
                </div>
                <div className="field">
                  <label>Vincular a un proyecto existente (opcional)</label>
                  <select value={form.projectId ?? ""} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
                    <option value="">— Ninguno —</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Fecha</label>
                    <input type="date" value={form.fecha ?? ""} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Calificación (1-5)</label>
                    <select value={form.rating ?? ""} onChange={(e) => setForm({ ...form, rating: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Sin calificar</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Comentario</label>
                  <textarea rows={3} value={form.comentario ?? ""} onChange={(e) => setForm({ ...form, comentario: e.target.value })} />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                  <button type="submit" className="btn primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <footer className="credit">Ficha de contratista — ObrasFlow</footer>
    </div>
  );
}
