"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  CButton, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CAlert,
} from "@coreui/react";
import { Receipt, CaretDown, CaretUp } from "@phosphor-icons/react";
import Icon from "@/components/ui/Icon";
import Select2, { type Select2Option } from "@/components/ui/Select2";
import FileDropZone from "@/components/FileDropZone";
import { notificar } from "@/lib/ui/alerts";
import { MEDIO_PAGO_OPTIONS } from "@/components/GeneralMovementFormModal";
import { ITEM_KINDS } from "@/lib/itemKinds";
import { todayLocal } from "@/lib/dates";
import type { ProjectDTO, ProjectItemDTO } from "@/lib/types";

/**
 * "Gasto de obra": cargar un gasto directo en una obra desde cualquier
 * pantalla, sin pasar por Inicio → obra → Ejecución → Agregar. Lo esencial a
 * la vista (obra, monto, concepto, proveedor y comprobante); fecha y medio de
 * pago ya vienen con lo más común (hoy, efectivo) y se cambian si hace falta.
 * Guarda exactamente el mismo movimiento que la pestaña Ejecución (kind
 * "change_order", tipo "Gasto"), así que ahí aparece igual que siempre.
 *
 * Se abre también soltando un comprobante en cualquier parte de la app
 * (ver DropComprobante en AppShell): llega con el archivo ya adjunto.
 */

/** Evento para abrir el formulario desde otro lado (con un archivo opcional). */
export const GASTO_OBRA_OPEN = "obrasflow:gasto-obra-open";
/** Evento que avisa que se cargó un movimiento (la ficha de la obra se refresca). */
export const ITEMS_CHANGED = "obrasflow:items-changed";

const KIND = "change_order";

export default function GastoObraButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [rubrosObra, setRubrosObra] = useState<string[]>([]);

  const [obraId, setObraId] = useState("");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [fecha, setFecha] = useState(() => todayLocal());
  const [medioPago, setMedioPago] = useState("Efectivo");
  const [file, setFile] = useState<File | null>(null);
  const [masDatos, setMasDatos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si estás en la ficha de una obra, esa obra viene elegida.
  const obraDeLaPantalla = pathname.startsWith("/project/") ? pathname.split("/")[2] : "";

  function abrir(conArchivo: File | null = null) {
    setObraId(obraDeLaPantalla);
    setMonto("");
    setConcepto("");
    setProveedorId("");
    setFecha(todayLocal());
    setMedioPago("Efectivo");
    setFile(conArchivo);
    setMasDatos(false);
    setError(null);
    setOpen(true);
  }

  useEffect(() => {
    const onOpen = (e: Event) => abrir((e as CustomEvent<{ file?: File }>).detail?.file ?? null);
    window.addEventListener(GASTO_OBRA_OPEN, onOpen);
    return () => window.removeEventListener(GASTO_OBRA_OPEN, onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraDeLaPantalla]);

  // Listas para los buscadores: se piden al abrir (no en cada pantalla).
  useEffect(() => {
    if (!open) return;
    fetch("/api/projects").then((r) => (r.ok ? r.json() : [])).then(setProjects).catch(() => {});
    fetch("/api/suppliers?status=activo").then((r) => (r.ok ? r.json() : [])).then(setSuppliers).catch(() => {});
  }, [open]);

  // Conceptos ya usados en esa obra, para elegir en vez de recordar cómo se escribió.
  useEffect(() => {
    setRubrosObra([]);
    if (!open || !obraId) return;
    fetch(`/api/projects/${obraId}/items?kind=${KIND}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((items: ProjectItemDTO[]) => setRubrosObra(Array.from(new Set(items.map((i) => i.title).filter(Boolean))).sort()))
      .catch(() => {});
  }, [open, obraId]);

  const obraOptions: Select2Option[] = useMemo(() => {
    const activas = projects.filter((p) => p.status !== "finalizado" || p.id === obraId);
    const rubro: Record<string, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
    return activas
      .map((p) => ({ value: p.id, label: p.reference ? `${p.name} · ${p.reference}` : p.name, group: rubro[p.type] ?? "Otro" }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  }, [projects, obraId]);

  const proveedorOptions: Select2Option[] = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [suppliers]
  );

  const obraElegida = projects.find((p) => p.id === obraId);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const montoNum = Number(monto);
    if (!obraId) return setError("Elegí la obra.");
    if (!(montoNum > 0)) return setError("Cargá un monto mayor a cero.");
    if (!concepto.trim()) return setError("Escribí en qué se gastó.");
    setSaving(true);
    setError(null);
    try {
      const proveedor = suppliers.find((s) => s.id === proveedorId);
      const data: Record<string, string> = { tipo: "Gasto", monto: String(montoNum), fecha, medioPago };
      if (proveedor) Object.assign(data, { proveedorId: proveedor.id, proveedorNombre: proveedor.name });
      const res = await fetch(`/api/projects/${obraId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: KIND, title: concepto.trim(), status: ITEM_KINDS[KIND].defaultStatus ?? null, data }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const saved: ProjectItemDTO = await res.json();

      // El comprobante se sube recién con el movimiento ya creado (necesita su id).
      // Try propio: si la subida falla, el gasto ya quedó guardado; cerrar igual
      // evita que un reintento cree un segundo gasto.
      let avisoArchivo = false;
      if (file) {
        try {
          const fd = new FormData();
          fd.append("file", file);
          const up = await fetch(`/api/items/${saved.id}/attachment`, { method: "POST", body: fd });
          avisoArchivo = !up.ok;
        } catch {
          avisoArchivo = true;
        }
      }

      setOpen(false);
      window.dispatchEvent(new CustomEvent(ITEMS_CHANGED, { detail: { projectId: obraId } }));
      const obraNombre = obraElegida?.name ?? "la obra";
      if (avisoArchivo) notificar(`El gasto se guardó en ${obraNombre}, pero no se pudo subir el comprobante.`, "warning");
      else notificar(`Gasto de Gs. ${montoNum.toLocaleString("es-PY")} cargado en ${obraNombre}`, "success");
    } catch (err: any) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <CButton color="primary" size="sm" className="d-inline-flex align-items-center gap-1" onClick={() => abrir()} title="Cargar un gasto directo en una obra">
        <Icon icon={Receipt} size={18} />
        Gasto de obra
      </CButton>

      {open && (
        <CModal visible onClose={() => setOpen(false)} alignment="center" backdrop="static">
          <CModalHeader>
            <CModalTitle className="d-flex align-items-center gap-2"><Icon icon={Receipt} size={22} />Gasto de obra</CModalTitle>
          </CModalHeader>
          <CForm onSubmit={guardar} noValidate>
            <CModalBody>
              {error && <CAlert color="danger" className="py-2">{error}</CAlert>}

              <div className="mb-3">
                <CFormLabel htmlFor="gasto-obra">Obra</CFormLabel>
                <Select2 id="gasto-obra" options={obraOptions} value={obraId} onChange={setObraId} placeholder="Buscá la obra por nombre" invalid={error === "Elegí la obra."} />
              </div>

              <div className="row g-3 mb-3">
                <div className="col-5">
                  <CFormLabel htmlFor="gasto-monto">Monto (Gs.)</CFormLabel>
                  <CFormInput id="gasto-monto" type="number" inputMode="numeric" min={0} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" autoFocus={Boolean(obraDeLaPantalla)} />
                </div>
                <div className="col-7">
                  <CFormLabel htmlFor="gasto-concepto">En qué se gastó</CFormLabel>
                  <CFormInput id="gasto-concepto" list="gasto-conceptos" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej. Hormigón, combustible, jornales" />
                  <datalist id="gasto-conceptos">{rubrosObra.map((r) => <option key={r} value={r} />)}</datalist>
                </div>
              </div>

              <div className="mb-3">
                <CFormLabel htmlFor="gasto-proveedor">Proveedor <span className="text-body-secondary fw-normal">(opcional)</span></CFormLabel>
                <Select2 id="gasto-proveedor" options={proveedorOptions} value={proveedorId} onChange={setProveedorId} placeholder="Buscá el proveedor" allowClear />
              </div>

              <div className="mb-3">
                <CFormLabel>Comprobante <span className="text-body-secondary fw-normal">(opcional)</span></CFormLabel>
                <FileDropZone file={file} existingAttachment={null} markedForRemoval={false} onFileSelected={setFile} onToggleRemove={() => setFile(null)} />
              </div>

              {/* Fecha y medio de pago: ya vienen con lo más común. */}
              <button type="button" className="of-more-toggle" onClick={() => setMasDatos((v) => !v)} aria-expanded={masDatos}>
                <Icon icon={masDatos ? CaretUp : CaretDown} size={14} weight="bold" />
                {fecha === todayLocal() ? "Hoy" : fecha.split("-").reverse().join("/")} · {medioPago}
                <span className="of-more-hint">{masDatos ? "listo" : "cambiar"}</span>
              </button>
              {masDatos && (
                <div className="row g-3 mt-0">
                  <div className="col-6">
                    <CFormLabel htmlFor="gasto-fecha">Fecha</CFormLabel>
                    <CFormInput id="gasto-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                  </div>
                  <div className="col-6">
                    <CFormLabel htmlFor="gasto-medio">Medio de pago</CFormLabel>
                    <CFormSelect id="gasto-medio" value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
                      {MEDIO_PAGO_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </CFormSelect>
                  </div>
                </div>
              )}
            </CModalBody>
            <CModalFooter className="justify-content-between">
              <span className="form-hint m-0">
                Para más detalle (contratista, factura, rubro ejecutado) usá la pestaña{" "}
                {obraId ? <Link href={`/project/${obraId}?tab=change_order`} onClick={() => setOpen(false)}>Ejecución</Link> : "Ejecución"} de la obra.
              </span>
              <div className="d-flex gap-2">
                <CButton color="secondary" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</CButton>
                <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar gasto"}</CButton>
              </div>
            </CModalFooter>
          </CForm>
        </CModal>
      )}
    </>
  );
}
