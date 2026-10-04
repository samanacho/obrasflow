"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CAlert, CButton, CCard, CCardBody, CCardHeader, CCol, CForm, CFormInput, CFormLabel, CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle, CRow,
} from "@coreui/react";
import { Calculator, FileArrowUp, PencilSimple, Plus, ShoppingCart, Trash } from "@phosphor-icons/react";
import Icon from "@/components/ui/Icon";
import DataTable, { celdas } from "@/components/ui/DataTable";
import BudgetImportModal from "./BudgetImportModal";
import { fmtCant, fmtGs, fmtMiles, parseGs, parseNumero } from "@/lib/compras/labels";
import { confirmarAccion, notificar } from "@/lib/ui/alerts";
import type { BudgetRowDTO } from "@/lib/compras/core";
import "@/app/styles/compras.css";

/**
 * Presupuesto por ítem de la obra (cemento, varillas, horas de máquina…) con
 * lo que ya se pidió y compró de cada uno. Es contra lo que se comparan los
 * pedidos de compra.
 */

interface Datos {
  items: BudgetRowDTO[];
  totales: { presupuestado: number; pedido: number; gastado: number };
}

interface ItemForm {
  codigo: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  precioUnitario: string;
  categoria: string;
}
const FORM_VACIO: ItemForm = { codigo: "", descripcion: "", unidad: "", cantidad: "", precioUnitario: "", categoria: "" };

/** Valida y convierte el formulario; devuelve el mensaje de error o los datos. */
function leerForm(f: ItemForm): { error: string } | { datos: Record<string, unknown> } {
  if (!f.descripcion.trim()) return { error: "Escribí la descripción del ítem." };
  const cantidad = parseNumero(f.cantidad);
  if (cantidad === null || cantidad < 0) return { error: "Escribí la cantidad presupuestada (un número)." };
  const precioUnitario = parseGs(f.precioUnitario);
  if (precioUnitario === null || precioUnitario < 0) return { error: "Escribí el precio unitario (un número)." };
  return {
    datos: {
      codigo: f.codigo.trim() || null,
      descripcion: f.descripcion.trim(),
      unidad: f.unidad.trim() || null,
      cantidad,
      precioUnitario,
      categoria: f.categoria.trim() || null,
    },
  };
}

const ALERTA: Record<BudgetRowDTO["alerta"], { texto: string; tono: string } | null> = {
  ok: null,
  pasado: { texto: "Se pasó", tono: "crit" },
  cerca: { texto: "Cerca del tope", tono: "warn" },
  precio: { texto: "Precio arriba", tono: "warn" },
};

function explicarAlerta(r: BudgetRowDTO): string {
  if (r.alerta === "pasado") return `Pedido ${fmtCant(r.pedido)} de ${fmtCant(r.cantidad)} presupuestados`;
  if (r.alerta === "cerca") return `Ya se pidió ${fmtCant(r.pedido)} de ${fmtCant(r.cantidad)} (90 % o más)`;
  if (r.alerta === "precio") return `Se pagó en promedio ${fmtGs(r.precioReal ?? 0)} contra ${fmtGs(r.precioUnitario)} presupuestado`;
  return "";
}

export default function BudgetPanel({ projectId }: { projectId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alta, setAlta] = useState<ItemForm>(FORM_VACIO);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const descRef = useRef<HTMLInputElement>(null);
  const [editando, setEditando] = useState<BudgetRowDTO | null>(null);
  const [form, setForm] = useState<ItemForm>(FORM_VACIO);
  const [errorEdit, setErrorEdit] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [importando, setImportando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/presupuesto`);
      if (!res.ok) throw new Error();
      setDatos(await res.json());
    } catch {
      setError("No se pudo cargar el presupuesto de la obra.");
    }
  }, [projectId]);
  useEffect(() => { cargar(); }, [cargar]);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    const r = leerForm(alta);
    if ("error" in r) { setErrorAlta(r.error); return; }
    setAgregando(true);
    setErrorAlta(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/presupuesto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [r.datos] }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "No se pudo agregar el ítem.");
      // El código se mantiene si sigue una numeración ("1.1" → el próximo lo escribe el usuario).
      setAlta({ ...FORM_VACIO, categoria: alta.categoria });
      await cargar();
      descRef.current?.focus();
    } catch (err: any) {
      setErrorAlta(err.message);
    } finally {
      setAgregando(false);
    }
  }

  function abrirEdicion(r: BudgetRowDTO) {
    setEditando(r);
    setErrorEdit(null);
    setForm({
      codigo: r.codigo ?? "",
      descripcion: r.descripcion,
      unidad: r.unidad ?? "",
      cantidad: fmtCant(r.cantidad),
      precioUnitario: fmtMiles(r.precioUnitario),
      categoria: r.categoria ?? "",
    });
  }

  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const r = leerForm(form);
    if ("error" in r) { setErrorEdit(r.error); return; }
    setGuardando(true);
    setErrorEdit(null);
    try {
      const res = await fetch(`/api/presupuesto/${editando.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(r.datos),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "No se pudo guardar.");
      setEditando(null);
      notificar("Ítem actualizado");
      cargar();
    } catch (err: any) {
      setErrorEdit(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(r: BudgetRowDTO) {
    const ok = await confirmarAccion({
      titulo: "¿Borrar este ítem del presupuesto?",
      texto: r.pedido > 0
        ? `"${r.descripcion}" tiene pedidos de compra: esos materiales van a quedar como "no está en el presupuesto".`
        : `"${r.descripcion}". No se puede deshacer.`,
      confirmar: "Borrar ítem",
      peligro: true,
      accion: async () => {
        const res = await fetch(`/api/presupuesto/${r.id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) throw new Error("No se pudo borrar el ítem.");
      },
    });
    if (ok) { notificar("Ítem borrado"); cargar(); }
  }

  const items = datos?.items ?? [];
  const t = datos?.totales;
  const pct = t && t.presupuestado > 0 ? Math.round((t.gastado / t.presupuestado) * 100) : 0;
  const alertas = items.filter((i) => i.alerta !== "ok").length;
  const campo = (k: keyof ItemForm) => ({
    value: alta[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setAlta({ ...alta, [k]: e.target.value }),
  });

  return (
    <CCard>
      <CCardHeader className="module-panel-head">
        <div>
          <span className="fw-semibold fs-5 d-inline-flex align-items-center gap-2"><Icon icon={Calculator} size={22} /> Presupuesto por ítem</span>
          <p className="module-desc mb-0">Lo presupuestado de cada material o trabajo, y cuánto se pidió y compró. Los pedidos de compra se comparan contra esto.</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Link href={`/compras?projectId=${projectId}`} className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1">
            <Icon icon={ShoppingCart} size={16} /> Ver pedidos de esta obra
          </Link>
          {items.length > 0 && (
            <CButton color="secondary" variant="outline" size="sm" className="d-inline-flex align-items-center gap-1" onClick={() => setImportando(true)}>
              <Icon icon={FileArrowUp} size={16} /> Importar planilla
            </CButton>
          )}
        </div>
      </CCardHeader>
      <CCardBody>
        {!datos && !error && <p className="state-message">Cargando presupuesto…</p>}
        {error && (
          <div className="of-empty">
            <p className="of-empty-title">{error}</p>
            <CButton color="primary" variant="outline" size="sm" onClick={cargar}>Reintentar</CButton>
          </div>
        )}

        {datos && items.length === 0 && (
          <div className="of-empty mb-3">
            <Icon icon={Calculator} size={40} />
            <p className="of-empty-title">Esta obra todavía no tiene presupuesto por ítem</p>
            <p className="of-empty-sub">Si ya lo tenés en Excel, importalo de una vez. Si no, cargá los ítems uno por uno acá abajo.</p>
            <CButton color="primary" size="sm" className="d-inline-flex align-items-center gap-1" onClick={() => setImportando(true)}>
              <Icon icon={FileArrowUp} size={16} /> Importar planilla
            </CButton>
          </div>
        )}

        {datos && items.length > 0 && t && (
          <>
            <div className="quote-budget-panel">
              <div className="quote-budget-item"><span className="qb-label">Presupuestado</span><span className="qb-value mono">{fmtGs(t.presupuestado)}</span></div>
              <div className="quote-budget-item"><span className="qb-label">Pedido (aprobado o pagado)</span><span className="qb-value mono">{fmtGs(t.pedido)}</span></div>
              <div className="quote-budget-item"><span className="qb-label">Comprado (pagado)</span><span className={"qb-value mono" + (t.gastado > t.presupuestado ? " alert-text" : "")}>{fmtGs(t.gastado)}</span></div>
              <div className="quote-budget-item"><span className="qb-label">Ítems con alerta</span><span className={"qb-value mono" + (alertas ? " alert-text" : "")}>{alertas}</span></div>
            </div>
            <div className="mb-3">
              <div className="bar-track" role="img" aria-label={`${pct}% del presupuesto por ítem ya comprado`}>
                <div className="bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: pct > 100 ? "var(--crit)" : "var(--ok)" }} />
              </div>
              <span className={"item-row-sub" + (pct > 100 ? " alert-text" : "")}>{pct}% del presupuesto por ítem ya comprado</span>
            </div>
          </>
        )}

        {datos && (
          <CForm onSubmit={agregar} className="bud-alta" noValidate aria-label="Agregar un ítem al presupuesto">
            <div><CFormLabel htmlFor="ba-cod">Código</CFormLabel><CFormInput id="ba-cod" size="sm" placeholder="1.1" {...campo("codigo")} /></div>
            <div className="b-desc"><CFormLabel htmlFor="ba-desc">Descripción</CFormLabel><CFormInput id="ba-desc" ref={descRef} size="sm" placeholder="Ej.: Cemento Portland" {...campo("descripcion")} /></div>
            <div><CFormLabel htmlFor="ba-uni">Unidad</CFormLabel><CFormInput id="ba-uni" size="sm" placeholder="bolsa" {...campo("unidad")} /></div>
            <div><CFormLabel htmlFor="ba-cant">Cantidad</CFormLabel><CFormInput id="ba-cant" size="sm" inputMode="decimal" placeholder="0" {...campo("cantidad")} /></div>
            <div><CFormLabel htmlFor="ba-precio">Precio unit. (Gs.)</CFormLabel><CFormInput id="ba-precio" size="sm" inputMode="numeric" placeholder="0" {...campo("precioUnitario")} /></div>
            <div className="b-btn">
              <CButton type="submit" color={items.length ? "primary" : "secondary"} variant={items.length ? undefined : "outline"} size="sm" disabled={agregando} className="d-inline-flex align-items-center gap-1 w-100 justify-content-center">
                <Icon icon={Plus} size={16} weight="bold" /> {agregando ? "Agregando…" : "Agregar"}
              </CButton>
            </div>
            {errorAlta && <div className="small cmp-pasa" style={{ gridColumn: "1 / -1" }} role="alert">{errorAlta}</div>}
          </CForm>
        )}

        {items.length > 0 && (
          <div className="table-wrap">
            <DataTable
              data={items}
              columns={[
                { data: "codigo", title: "Código", defaultContent: "", type: "string", className: "text-nowrap" },
                { data: "descripcion", title: "Descripción", className: "bud-desc" },
                { data: "cantidad", title: "Cantidad", className: "text-end text-nowrap" },
                { data: "precioUnitario", title: "Precio unit.", className: "text-end text-nowrap" },
                { data: "total", title: "Total", className: "text-end text-nowrap" },
                { data: "pedido", title: "Pedido", className: "text-end text-nowrap" },
                { data: "comprado", title: "Comprado", className: "text-end text-nowrap" },
                { data: "precioReal", title: "Precio real", className: "text-end text-nowrap", defaultContent: "" },
                { data: "alerta", title: "Alerta", className: "text-nowrap" },
                { data: null, title: "", orderable: false, className: "text-end text-nowrap" },
              ]}
              options={{ order: [], pageLength: 50 }}
              slots={celdas<BudgetRowDTO>({
                1: (_, r) => <>{r.descripcion}{r.categoria && <div className="small text-body-secondary">{r.categoria}</div>}</>,
                2: (_, r) => <>{fmtCant(r.cantidad)}{r.unidad ? ` ${r.unidad}` : ""}</>,
                3: (_, r) => <>{fmtGs(r.precioUnitario)}</>,
                4: (_, r) => <>{fmtGs(r.total)}</>,
                5: (_, r) => <span className={r.alerta === "pasado" ? "cmp-pasa" : undefined}>{r.pedido ? fmtCant(r.pedido) : "—"}</span>,
                6: (_, r) => <>{r.comprado ? fmtCant(r.comprado) : "—"}</>,
                7: (_, r) => <span className={r.alerta === "precio" ? "cmp-pasa" : undefined}>{r.precioReal !== null ? fmtGs(r.precioReal) : "—"}</span>,
                8: (_, r) => {
                  const a = ALERTA[r.alerta];
                  return a ? <span className={`status-chip of-chip-${a.tono}`} title={explicarAlerta(r)}>{a.texto}</span> : <></>;
                },
                9: (_, r) => (
                  <div className="d-inline-flex gap-1">
                    <CButton size="sm" color="secondary" variant="outline" title="Editar" onClick={() => abrirEdicion(r)}>
                      <Icon icon={PencilSimple} size={16} label={`Editar ${r.descripcion}`} />
                    </CButton>
                    <CButton size="sm" color="danger" variant="outline" title="Borrar" onClick={() => borrar(r)}>
                      <Icon icon={Trash} size={16} label={`Borrar ${r.descripcion}`} />
                    </CButton>
                  </div>
                ),
              })}
            />
          </div>
        )}
      </CCardBody>

      <CModal visible={Boolean(editando)} onClose={() => setEditando(null)} alignment="center">
        <CModalHeader><CModalTitle>Editar ítem del presupuesto</CModalTitle></CModalHeader>
        <CForm onSubmit={guardarEdicion} noValidate>
          <CModalBody>
            {errorEdit && <CAlert color="danger" role="alert">{errorEdit}</CAlert>}
            <CRow className="g-3">
              <CCol xs={4}><CFormLabel htmlFor="be-cod">Código</CFormLabel><CFormInput id="be-cod" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></CCol>
              <CCol xs={8}><CFormLabel htmlFor="be-cat">Categoría</CFormLabel><CFormInput id="be-cat" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Ej.: Estructura" /></CCol>
              <CCol xs={12}><CFormLabel htmlFor="be-desc">Descripción</CFormLabel><CFormInput id="be-desc" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></CCol>
              <CCol xs={4}><CFormLabel htmlFor="be-uni">Unidad</CFormLabel><CFormInput id="be-uni" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} /></CCol>
              <CCol xs={4}><CFormLabel htmlFor="be-cant">Cantidad</CFormLabel><CFormInput id="be-cant" inputMode="decimal" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} /></CCol>
              <CCol xs={4}><CFormLabel htmlFor="be-precio">Precio unit. (Gs.)</CFormLabel><CFormInput id="be-precio" inputMode="numeric" value={form.precioUnitario} onChange={(e) => setForm({ ...form, precioUnitario: e.target.value })} /></CCol>
            </CRow>
            {editando && editando.pedido > 0 && (
              <p className="small text-body-secondary mt-3 mb-0">Este ítem ya tiene {fmtCant(editando.pedido)} pedidos: al cambiar la cantidad se recalcula cuánto queda.</p>
            )}
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" variant="outline" onClick={() => setEditando(null)}>Cancelar</CButton>
            <CButton color="primary" type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</CButton>
          </CModalFooter>
        </CForm>
      </CModal>

      <BudgetImportModal
        projectId={projectId}
        visible={importando}
        hayItems={items.length > 0}
        onClose={() => setImportando(false)}
        onImported={(r) => {
          setImportando(false);
          notificar(
            [
              r.agregados ? `${r.agregados} ${r.agregados === 1 ? "ítem cargado" : "ítems cargados"}` : null,
              r.actualizados ? `${r.actualizados} ${r.actualizados === 1 ? "actualizado" : "actualizados"}` : null,
              r.borrados ? `${r.borrados} ${r.borrados === 1 ? "borrado" : "borrados"}` : null,
            ].filter(Boolean).join(" · ") || "Sin cambios"
          );
          cargar();
        }}
      />
    </CCard>
  );
}
