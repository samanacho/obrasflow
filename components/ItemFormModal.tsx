"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  CButton, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea, CAlert,
} from "@coreui/react";
import FileDropZone from "@/components/FileDropZone";
import type { ProjectItemDTO, ContractorDTO, SupplierDTO } from "@/lib/types";
import { ITEM_KINDS, ItemField } from "@/lib/itemKinds";

const LocationPicker = dynamic(() => import("@/components/LocationPicker"), {
  ssr: false,
  loading: () => <p className="empty-col">Cargando mapa…</p>,
});

/** "lat,lng" (como se guarda en data.coordenadas) -> {lat,lng}, o null si todavía no hay nada cargado. */
function parseCoords(raw: any): { lat: number; lng: number } | null {
  const [latStr, lngStr] = String(raw ?? "").split(",");
  const lat = Number(latStr);
  const lng = Number(lngStr);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * Formulario genérico de alta/edición de un ProjectItem, dirigido por
 * lib/itemKinds.ts (ITEM_KINDS[kind].fields) — un solo renderer para todos
 * los módulos de una obra (Relevamiento, Cotización, Contratistas, Parte
 * Diario, Ejecución, Maquinarias, Documentos, Fotos). Se usa desde la ficha
 * de la obra (app/project/[id]/page.tsx) y, para editar/eliminar
 * movimientos de obra puntualmente, también desde /movimientos (ver el
 * toggle "Editar movimientos de obra" ahí).
 */
export default function ItemFormModal({
  projectId, kind, existing, initialTitle, existingRubros, showToast, onClose, onSaved,
}: {
  projectId: string;
  kind: string;
  existing: ProjectItemDTO | null;
  /** Con qué título prellenar el campo al crear un ítem nuevo (ver "Agregar insumo a este rubro" en RubroFicha). */
  initialTitle?: string | null;
  /** Nombres de rubro ya cargados en esta obra (solo Ejecución) — sugerencias del campo "Nombre del rubro" para que agrupar insumos del mismo rubro sea elegir de una lista, no repetir el nombre a mano. */
  existingRubros?: string[];
  showToast: (m: string) => void;
  onClose: () => void;
  onSaved: (item: ProjectItemDTO) => void;
}) {
  const cfg = ITEM_KINDS[kind];
  const [title, setTitle] = useState(existing?.title ?? initialTitle ?? "");
  const [status, setStatus] = useState(existing?.status ?? cfg.defaultStatus ?? "");
  // Parte Diario: un registro nuevo arranca con la fecha de hoy ya
  // cargada — es lo primero que se pide y no tiene sentido hacer que el
  // usuario la escriba a mano cada vez que solo quiere dejar algo del día.
  const [data, setData] = useState<Record<string, any>>(
    existing?.data ?? (kind === "daily_log" ? { fecha: new Date().toISOString().slice(0, 10) } : {})
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [contractors, setContractors] = useState<ContractorDTO[]>([]);
  const [quotes, setQuotes] = useState<ProjectItemDTO[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  // Archivo adjunto: se sube recién después de guardar el item (necesita
  // su id) — ver handleSubmit. `pendingFile` es lo elegido en esta sesión
  // de edición todavía sin subir; `removeAttachment` marca que se pidió
  // sacar el que ya estaba guardado.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removeAttachment, setRemoveAttachment] = useState(false);

  useEffect(() => {
    if (!cfg.fields.some((f) => f.type === "contractor")) return;
    fetch("/api/contractors?status=activo")
      .then((r) => (r.ok ? r.json() : []))
      .then(setContractors)
      .catch(() => setContractors([]));
  }, []);

  useEffect(() => {
    if (!cfg.fields.some((f) => f.type === "quote")) return;
    fetch(`/api/projects/${projectId}/items?kind=cotizacion`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setQuotes)
      .catch(() => setQuotes([]));
  }, [projectId]);

  useEffect(() => {
    if (!cfg.fields.some((f) => f.type === "supplier")) return;
    fetch("/api/suppliers?status=activo")
      .then((r) => (r.ok ? r.json() : []))
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, []);

  // Campos con showIf (ej. "Proveedor" o "Rubro ejecutado" en Ejecución,
  // que dependen de "Tipo de insumo"): si el campo actualmente cargado en
  // `data` ya no aplica (cambió la condición que lo mostraba), se limpia
  // solo — evita guardar datos de un campo que quedó oculto. Por ahora el
  // único disparador es tipoInsumo; si en el futuro hay más, hay que sumar
  // esa clave al array de dependencias.
  useEffect(() => {
    const hidden = cfg.fields.filter(
      (f) => f.showIf && !f.showIf(data) && data[f.key] !== undefined && data[f.key] !== "" && data[f.key] !== null
    );
    if (hidden.length === 0) return;
    setData((d) => {
      const next = { ...d };
      for (const f of hidden) {
        delete next[f.key];
        if (f.key.endsWith("Id")) delete next[f.key.replace(/Id$/, "") + "Nombre"];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.tipoInsumo]);

  function setField(key: string, value: string) {
    setData((d) => ({ ...d, [key]: value }));
  }

  // "contratistaId" -> "contratistaNombre", "cotizacionId" -> "cotizacionNombre":
  // se guarda el nombre/label junto al id para no tener que resolverlo de
  // nuevo cada vez que se lista el item (evita otro fetch por fila).
  function setContractorField(key: string, contractorId: string) {
    const chosen = contractors.find((c) => c.id === contractorId);
    const nameKey = key.replace(/Id$/, "") + "Nombre";
    setData((d) => ({ ...d, [key]: contractorId, [nameKey]: chosen?.name ?? "" }));
  }

  function setQuoteField(key: string, quoteId: string) {
    const chosen = quotes.find((q) => q.id === quoteId);
    const label = chosen
      ? `${chosen.title}${chosen.data?.contratistaNombre ? ` · ${chosen.data.contratistaNombre}` : ""} — Gs. ${Number(chosen.data?.monto ?? 0).toLocaleString("es-PY")}`
      : "";
    const nameKey = key.replace(/Id$/, "") + "Nombre";
    setData((d) => ({ ...d, [key]: quoteId, [nameKey]: label }));
  }

  function setSupplierField(key: string, supplierId: string) {
    const chosen = suppliers.find((s) => s.id === supplierId);
    const nameKey = key.replace(/Id$/, "") + "Nombre";
    setData((d) => ({ ...d, [key]: supplierId, [nameKey]: chosen?.name ?? "" }));
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
      const saved = await res.json();

      // El adjunto se sube/borra recién ahora que el item ya tiene id —
      // si algo de esto falla, el item ya se guardó igual: se avisa pero
      // no se bloquea el cierre del modal por un problema solo del archivo.
      if (pendingFile) {
        const fd = new FormData();
        fd.append("file", pendingFile);
        const upRes = await fetch(`/api/items/${saved.id}/attachment`, { method: "POST", body: fd });
        if (upRes.ok) saved.attachment = await upRes.json();
        else {
          const upBody = await upRes.json().catch(() => ({}));
          showToast(upBody.error || "El movimiento se guardó, pero no se pudo subir el archivo adjunto.");
        }
      } else if (removeAttachment && existing?.attachment) {
        await fetch(`/api/attachments/${existing.attachment.id}`, { method: "DELETE" }).catch(() => {});
        saved.attachment = null;
      }

      onSaved(saved);
    } catch (err: any) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CModal visible onClose={onClose} alignment="center" size="lg">
      <CModalHeader>
        <CModalTitle>{existing ? "Editar" : "Nuevo"} {cfg.singular}</CModalTitle>
      </CModalHeader>
      <CForm onSubmit={handleSubmit}>
        <CModalBody>
          {error && <CAlert color="danger">{error}</CAlert>}
          <div className="mb-3">
            <CFormLabel>{cfg.titleLabel}</CFormLabel>
            <CFormInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              list={existingRubros && existingRubros.length > 0 ? "rubro-title-suggestions" : undefined}
            />
            {existingRubros && existingRubros.length > 0 && (
              <datalist id="rubro-title-suggestions">
                {existingRubros.map((r) => <option key={r} value={r} />)}
              </datalist>
            )}
            {kind === "change_order" && (
              <p className="form-hint mb-0 mt-1">Los insumos con el mismo nombre de rubro se agrupan juntos en Ejecución.</p>
            )}
            {kind === "contratista" && (
              <p className="form-hint mb-0 mt-1">Podés elegir un rubro ya usado en Contratistas o en Ejecución de esta obra, o cargar uno nuevo.</p>
            )}
          </div>
          {cfg.statusOptions && (
            <div className="mb-3">
              <CFormLabel>Estado</CFormLabel>
              <CFormSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {cfg.statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </CFormSelect>
            </div>
          )}
          {cfg.fields.filter((f) => !f.showIf || f.showIf(data)).map((f: ItemField) => (
            <div className="mb-3" key={f.key}>
              <CFormLabel>{f.label}</CFormLabel>
              {f.type === "textarea" ? (
                <CFormTextarea rows={3} value={data[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} required={f.required} />
              ) : f.type === "contractor" ? (
                <CFormSelect value={data[f.key] ?? ""} onChange={(e) => setContractorField(f.key, e.target.value)} required={f.required}>
                  <option value="">Seleccioná un contratista…</option>
                  {contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.city ? ` — ${c.city}` : ""}{c.contactName ? ` — Encargado: ${c.contactName}` : ""}
                    </option>
                  ))}
                </CFormSelect>
              ) : f.type === "supplier" ? (
                <CFormSelect value={data[f.key] ?? ""} onChange={(e) => setSupplierField(f.key, e.target.value)} required={f.required}>
                  <option value="">Seleccioná un proveedor…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ""}</option>
                  ))}
                </CFormSelect>
              ) : f.type === "quote" ? (
                <CFormSelect value={data[f.key] ?? ""} onChange={(e) => setQuoteField(f.key, e.target.value)} required={f.required}>
                  <option value="">Seleccioná una cotización…</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title}{q.data?.contratistaNombre ? ` · ${q.data.contratistaNombre}` : ""} — Gs. {Number(q.data?.monto ?? 0).toLocaleString("es-PY")}
                    </option>
                  ))}
                </CFormSelect>
              ) : f.type === "select" ? (
                <CFormSelect value={data[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} required={f.required}>
                  <option value="">Seleccioná…</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </CFormSelect>
              ) : f.type === "select-search" ? (
                <>
                  <CFormInput
                    list={`${f.key}-suggestions`}
                    value={data[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    required={f.required}
                    placeholder="Escribí para buscar o elegí una sugerencia…"
                  />
                  <datalist id={`${f.key}-suggestions`}>
                    {f.options?.map((o) => <option key={o} value={o} />)}
                  </datalist>
                </>
              ) : f.type === "location" ? (
                <LocationPicker
                  value={parseCoords(data[f.key])}
                  onChange={(coords) => setField(f.key, `${coords.lat},${coords.lng}`)}
                />
              ) : f.type === "file" ? (
                <FileDropZone
                  file={pendingFile}
                  existingAttachment={existing?.attachment ?? null}
                  markedForRemoval={removeAttachment}
                  onFileSelected={(picked) => { setPendingFile(picked); if (picked) setRemoveAttachment(false); }}
                  onToggleRemove={() => setRemoveAttachment(true)}
                />
              ) : (
                <CFormInput type={f.type} value={data[f.key] ?? ""} onChange={(e) => setField(f.key, e.target.value)} required={f.required} placeholder={f.placeholder} />
              )}
            </div>
          ))}
          {cfg.fields.some((f) => f.type === "contractor") && contractors.length === 0 && (
            <p className="form-hint">No hay contratistas activos todavía. <Link href="/contratistas">Cargá uno en el directorio</Link> primero.</p>
          )}
          {cfg.fields.some((f) => f.type === "quote") && quotes.length === 0 && (
            <p className="form-hint">No hay cotizaciones cargadas todavía en esta obra.</p>
          )}
          {cfg.fields.some((f) => f.type === "supplier") && suppliers.length === 0 && (
            <p className="form-hint">No hay proveedores activos todavía. <Link href="/proveedores">Cargá uno en el directorio</Link> primero.</p>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" variant="ghost" onClick={onClose}>Cancelar</CButton>
          <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  );
}
