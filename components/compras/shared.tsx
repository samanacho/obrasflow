"use client";

import { useEffect, useMemo, useState } from "react";
import { CButton, CFormInput, CFormSelect } from "@coreui/react";
import { ChatCircleDots, Desktop, Plus, Trash } from "@phosphor-icons/react";
import Icon from "@/components/ui/Icon";
import Select2, { type Select2Option } from "@/components/ui/Select2";
import { ESTADO_LABEL, ESTADO_TONO, fmtCant, fmtCantUnidad, parseNumero } from "@/lib/compras/labels";
import type { BudgetRowDTO } from "@/lib/compras/core";
import type { ProjectDTO, SupplierDTO } from "@/lib/types";
import "@/app/styles/compras.css";

// Piezas compartidas por las pantallas de Compras: chip de estado, origen,
// listas de obras/proveedores/presupuesto y el editor de materiales.

export function EstadoChip({ status }: { status: string }) {
  return <span className={`status-chip of-chip-${ESTADO_TONO[status] ?? "muted"}`}>{ESTADO_LABEL[status] ?? status}</span>;
}

/** Ícono de dónde vino el pedido, con el texto para lectores de pantalla. */
export function OrigenIcono({ origen, size = 16 }: { origen: string; size?: number }) {
  return origen === "whatsapp" ? (
    <span title="Llegó por WhatsApp" className="text-body-secondary"><Icon icon={ChatCircleDots} size={size} label="Llegó por WhatsApp" /></span>
  ) : (
    <span title="Cargado en la app" className="text-body-secondary"><Icon icon={Desktop} size={size} label="Cargado en la app" /></span>
  );
}

const GRUPO_OBRA: Record<string, string> = { en_curso: "En curso", planificado: "Planificadas", pausado: "Pausadas", finalizado: "Finalizadas" };
const ORDEN_GRUPO = ["en_curso", "planificado", "pausado", "finalizado"];

/** Obras para un Select2, agrupadas por estado (las en curso primero). */
export function useObras() {
  const [obras, setObras] = useState<ProjectDTO[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setObras)
      .catch(() => setError(true));
  }, []);
  const options = useMemo<Select2Option[]>(
    () =>
      (obras ?? [])
        .slice()
        .sort((a, b) => ORDEN_GRUPO.indexOf(a.status) - ORDEN_GRUPO.indexOf(b.status) || a.name.localeCompare(b.name))
        .map((p) => ({ value: p.id, label: `${p.name}${p.reference ? ` (REF ${p.reference})` : ""}`, group: GRUPO_OBRA[p.status] })),
    [obras]
  );
  return { obras, options, error };
}

/** Proveedores activos para un Select2 (se cargan cuando `activo` es true). */
export function useProveedores(activo: boolean) {
  const [lista, setLista] = useState<SupplierDTO[] | null>(null);
  useEffect(() => {
    if (!activo || lista) return;
    fetch("/api/suppliers")
      .then((r) => (r.ok ? r.json() : []))
      .then((s: SupplierDTO[]) => setLista(s))
      .catch(() => setLista([]));
  }, [activo, lista]);
  const options = useMemo<Select2Option[]>(
    () => (lista ?? []).filter((s) => s.status === "activo").map((s) => ({ value: s.id, label: s.ruc ? `${s.name} · RUC ${s.ruc}` : s.name })),
    [lista]
  );
  return { proveedores: lista, options };
}

/** Presupuesto por ítem de una obra (vacío si no hay obra elegida). */
export function usePresupuesto(projectId: string | null) {
  const [items, setItems] = useState<BudgetRowDTO[]>([]);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    if (!projectId) { setItems([]); return; }
    let vivo = true;
    setCargando(true);
    fetch(`/api/projects/${projectId}/presupuesto`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (vivo) setItems(d.items ?? []); })
      .catch(() => { if (vivo) setItems([]); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [projectId]);
  return { items, cargando };
}

// ------------------------- editor de materiales -------------------------

/** "" = que el sistema lo busque por el nombre · "__no__" = no está en el presupuesto · si no, el id del ítem. */
export interface RenglonForm {
  key: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  vinculo: string;
}

export const SIN_PRESUPUESTO = "__no__";
const restoTexto = (q: number) => (q < 0 ? `ya se pasó por ${fmtCant(-q)}` : `quedan ${fmtCant(q)}`);
let seq = 0;
export const renglonVacio = (): RenglonForm => ({ key: `r${++seq}`, descripcion: "", unidad: "", cantidad: "", vinculo: "" });

/** Renglones listos para la API. `budgetItemId` undefined = emparejar solo; null = fuera del presupuesto. */
export function renglonesParaApi(rs: RenglonForm[]) {
  return rs
    .filter((r) => r.descripcion.trim())
    .map((r) => ({
      descripcion: r.descripcion.trim(),
      unidad: r.unidad.trim() || null,
      cantidad: parseNumero(r.cantidad) ?? 0,
      budgetItemId: r.vinculo === SIN_PRESUPUESTO ? null : r.vinculo || undefined,
    }));
}

/** Mensaje de error del formulario de materiales, o null si está bien. */
export function validarRenglones(rs: RenglonForm[]): string | null {
  const llenos = rs.filter((r) => r.descripcion.trim() || r.cantidad.trim());
  if (!llenos.length) return "Cargá al menos un material con su cantidad.";
  for (const r of llenos) {
    if (!r.descripcion.trim()) return "Hay una cantidad sin material: escribí qué se pide.";
    const n = parseNumero(r.cantidad);
    if (n === null || n <= 0) return `Falta la cantidad de "${r.descripcion.trim()}".`;
  }
  return null;
}

/**
 * Materiales de un pedido: qué, cuánto, unidad y a qué ítem del presupuesto
 * corresponde. Si se elige un ítem y el material está vacío, se completa con
 * el nombre y la unidad del ítem (menos para escribir).
 */
export function RenglonesEditor({
  renglones,
  onChange,
  presupuesto,
  permitirFuera = false,
  pedidoPropio,
  sinObra = false,
}: {
  renglones: RenglonForm[];
  onChange: (rs: RenglonForm[]) => void;
  presupuesto: BudgetRowDTO[];
  /** Ofrece "No está en el presupuesto" (al editar un pedido). */
  permitirFuera?: boolean;
  /** Cantidad de ESTE pedido que ya está sumada en "pedido" de cada ítem (pedido aprobado), para no contarla dos veces. */
  pedidoPropio?: Record<string, number>;
  sinObra?: boolean;
}) {
  const porId = useMemo(() => new Map(presupuesto.map((b) => [b.id, b])), [presupuesto]);
  const opciones = useMemo<Select2Option[]>(
    () => [
      { value: "", label: "Que lo busque por el nombre" },
      ...(permitirFuera ? [{ value: SIN_PRESUPUESTO, label: "No está en el presupuesto" }] : []),
      ...presupuesto.map((b) => ({
        value: b.id,
        label: `${b.codigo ? `${b.codigo} · ` : ""}${b.descripcion}${b.unidad ? ` (${b.unidad})` : ""} — ${restoTexto(b.cantidad - b.pedido + (pedidoPropio?.[b.id] ?? 0))}`,
        group: b.categoria ?? undefined,
      })),
    ],
    [presupuesto, permitirFuera, pedidoPropio]
  );
  const largo = presupuesto.length > 15;

  function set(i: number, patch: Partial<RenglonForm>) {
    const next = renglones.slice();
    const r = { ...next[i], ...patch };
    if (patch.vinculo && patch.vinculo !== SIN_PRESUPUESTO) {
      const b = porId.get(patch.vinculo);
      if (b && !r.descripcion.trim()) r.descripcion = b.descripcion;
      if (b && !r.unidad.trim() && b.unidad) r.unidad = b.unidad;
    }
    next[i] = r;
    onChange(next);
  }

  return (
    <div>
      <div className="cmp-renglon cmp-renglon-head" aria-hidden="true">
        <span>Material</span><span>Cantidad</span><span>Unidad</span><span>Ítem del presupuesto</span><span />
      </div>
      {renglones.map((r, i) => {
        const b = r.vinculo && r.vinculo !== SIN_PRESUPUESTO ? porId.get(r.vinculo) : undefined;
        const cant = parseNumero(r.cantidad) ?? 0;
        const quedan = b ? b.cantidad - b.pedido + (pedidoPropio?.[b.id] ?? 0) : 0;
        const pasa = b ? cant - quedan : 0;
        const n = i + 1;
        return (
          <div key={r.key}>
            <div className="cmp-renglon">
              <div className="r-desc">
                <label className="r-label" htmlFor={`${r.key}-d`}>Material {n}</label>
                <CFormInput id={`${r.key}-d`} aria-label={`Material ${n}`} placeholder="Ej.: cemento, varilla 10 mm" value={r.descripcion} onChange={(e) => set(i, { descripcion: e.target.value })} />
              </div>
              <div>
                <label className="r-label" htmlFor={`${r.key}-c`}>Cantidad</label>
                <CFormInput id={`${r.key}-c`} aria-label={`Cantidad del material ${n}`} inputMode="decimal" placeholder="0" value={r.cantidad} onChange={(e) => set(i, { cantidad: e.target.value })} />
              </div>
              <div>
                <label className="r-label" htmlFor={`${r.key}-u`}>Unidad</label>
                <CFormInput id={`${r.key}-u`} aria-label={`Unidad del material ${n}`} placeholder="bolsa, m³…" value={r.unidad} onChange={(e) => set(i, { unidad: e.target.value })} />
              </div>
              <div className="r-item">
                <label className="r-label" htmlFor={`${r.key}-p`}>Ítem del presupuesto</label>
                {sinObra || !presupuesto.length ? (
                  <p className="cmp-fuera mb-0 pt-2">{sinObra ? "Elegí la obra para ver su presupuesto" : "Esta obra no tiene presupuesto por ítem"}</p>
                ) : largo ? (
                  // La opción vacía de Select2 es el "que lo busque por el nombre" (se vuelve con la ×).
                  <Select2 id={`${r.key}-p`} options={opciones.filter((o) => o.value)} value={r.vinculo} onChange={(v) => set(i, { vinculo: v })} placeholder="Que lo busque por el nombre" allowClear />
                ) : (
                  <CFormSelect id={`${r.key}-p`} aria-label={`Ítem del presupuesto del material ${n}`} value={r.vinculo} onChange={(e) => set(i, { vinculo: e.target.value })}>
                    {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </CFormSelect>
                )}
              </div>
              <div>
                <CButton
                  color="secondary" variant="ghost" title={`Quitar el material ${n}`}
                  disabled={renglones.length === 1}
                  onClick={() => onChange(renglones.filter((_, j) => j !== i))}
                >
                  <Icon icon={Trash} size={18} label={`Quitar el material ${n}`} />
                </CButton>
              </div>
            </div>
            {b && (
              <p className={"small mb-2 " + (pasa > 0 ? "cmp-pasa" : "text-body-secondary")}>
                Presupuestado {fmtCantUnidad(b.cantidad, b.unidad)} · ya pedido {fmtCant(b.pedido - (pedidoPropio?.[b.id] ?? 0))} ·{" "}
                {pasa > 0 ? `con este pedido se pasa por ${fmtCant(pasa)}` : `quedan ${fmtCant(quedan - cant)} después de este pedido`}
              </p>
            )}
          </div>
        );
      })}
      <CButton color="secondary" variant="outline" size="sm" className="d-inline-flex align-items-center gap-1" onClick={() => onChange([...renglones, renglonVacio()])}>
        <Icon icon={Plus} size={16} weight="bold" /> Agregar otro material
      </CButton>
    </div>
  );
}
