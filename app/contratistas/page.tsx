"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ContractorDTO, ContractorInput, ProjectType, ContractorStatus } from "@/lib/types";

const RUBRO_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial" };
const RUBROS: ProjectType[] = ["civil", "electrico", "vial"];

const EMPTY_FORM: ContractorInput = {
  name: "",
  ruc: "",
  contactName: "",
  phone: "",
  email: "",
  city: "",
  province: "",
  rubros: [],
  status: "activo",
  notes: "",
};

function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="stars-empty">Sin calificar</span>;
  const rounded = Math.round(value);
  return (
    <span className="stars" title={`${value.toFixed(1)} / 5`}>
      {"★".repeat(rounded)}{"☆".repeat(5 - rounded)} <span className="mono stars-value">{value.toFixed(1)}</span>
    </span>
  );
}

export default function ContratistasPage() {
  const [contractors, setContractors] = useState<ContractorDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rubroFilter, setRubroFilter] = useState<ProjectType | "">("");
  const [statusFilter, setStatusFilter] = useState<ContractorStatus | "">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ContractorDTO | null>(null);
  const [form, setForm] = useState<ContractorInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (rubroFilter) params.set("rubro", rubroFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("q", search);
      const res = await fetch(`/api/contractors?${params.toString()}`);
      setContractors(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search, rubroFilter, statusFilter]);

  function openModal(c: ContractorDTO | null) {
    setFormError(null);
    setEditing(c);
    setForm(
      c
        ? { name: c.name, ruc: c.ruc ?? "", contactName: c.contactName ?? "", phone: c.phone ?? "", email: c.email ?? "", city: c.city ?? "", province: c.province ?? "", rubros: c.rubros, status: c.status, notes: c.notes ?? "" }
        : EMPTY_FORM
    );
    setModalOpen(true);
  }

  function toggleRubro(r: ProjectType) {
    setForm((f) => ({ ...f, rubros: f.rubros.includes(r) ? f.rubros.filter((x) => x !== r) : [...f.rubros, r] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("El nombre es obligatorio."); return; }
    if (form.rubros.length === 0) { setFormError("Elegí al menos un rubro."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const url = editing ? `/api/contractors/${editing.id}` : "/api/contractors";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="app">
      <header className="top">
        <div className="brand">
          <Link href="/" className="back-link">← ObrasFlow</Link>
        </div>
        <div className="actions">
          <button className="btn primary" type="button" onClick={() => openModal(null)}>+ Nuevo contratista</button>
        </div>
      </header>

      <h1 className="project-title" style={{ fontSize: "1.9rem", margin: "10px 0 4px" }}>🧰 Directorio de contratistas</h1>
      <p className="module-desc" style={{ marginBottom: 18 }}>Todas las obras, todos los rubros — comparalos antes de contratar.</p>

      <div className="table-filters">
        <input className="table-search" type="text" placeholder="Buscar por nombre o contacto…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={rubroFilter} onChange={(e) => setRubroFilter(e.target.value as ProjectType | "")}>
          <option value="">Todos los rubros</option>
          {RUBROS.map((r) => <option key={r} value={r}>{RUBRO_LABEL[r]}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ContractorStatus | "")}>
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
      </div>

      {loading && <p className="state-message">Cargando contratistas…</p>}
      {!loading && contractors.length === 0 && <p className="empty-col">Sin contratistas todavía. Agregá el primero con &quot;+ Nuevo contratista&quot;.</p>}

      <div className="contractor-grid">
        {contractors.map((c) => (
          <div className="contractor-card" key={c.id}>
            <div className="contractor-card-head">
              <Link href={`/contratistas/${c.id}`} className="contractor-name">{c.name}</Link>
              <span className={"status-chip " + (c.status === "activo" ? "status-cumplido" : "status-no_aplica")}>{c.status}</span>
            </div>
            <div className="contractor-rubros">
              {c.rubros.map((r) => <span key={r} className={`type-pill type-${r}`}>{RUBRO_LABEL[r]}</span>)}
            </div>
            <div className="contractor-meta">
              {c.city && <span>📍 {c.city}{c.province ? `, ${c.province}` : ""}</span>}
              {c.phone && <span>📞 {c.phone}</span>}
            </div>
            <Stars value={c.avgRating} />
            <div className="contractor-card-actions">
              <Link href={`/contratistas/${c.id}`} className="btn small">Ver ficha</Link>
              <button className="btn small" type="button" onClick={() => openModal(c)}>Editar</button>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <h3>{editing ? "Editar" : "Nuevo"} contratista</h3>
            {formError && <p className="form-error">{formError}</p>}
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>Nombre / razón social</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="field">
                <label>Rubros</label>
                <div className="checkbox-row">
                  {RUBROS.map((r) => (
                    <label key={r} className="checkbox-pill">
                      <input type="checkbox" checked={form.rubros.includes(r)} onChange={() => toggleRubro(r)} /> {RUBRO_LABEL[r]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Ciudad</label>
                  <input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
                <div className="field">
                  <label>Provincia</label>
                  <input value={form.province ?? ""} onChange={(e) => setForm({ ...form, province: e.target.value })} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Celular</label>
                  <input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Nombre de contacto</label>
                  <input value={form.contactName ?? ""} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                </div>
                <div className="field">
                  <label>RUC</label>
                  <input value={form.ruc ?? ""} onChange={(e) => setForm({ ...form, ruc: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Estado</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ContractorStatus })}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
              <div className="field">
                <label>Notas</label>
                <textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="credit">Directorio global — visible desde cualquier proyecto.</footer>
    </div>
  );
}
