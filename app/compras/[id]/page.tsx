"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CAlert, CButton, CCard, CCardBody, CCardHeader, CCol, CDropdown, CDropdownItem, CDropdownMenu, CDropdownToggle, CFormInput, CFormLabel, CFormTextarea, CRow,
} from "@coreui/react";
import { ArrowSquareOut, Check, DotsThree, FilePdf, PencilSimple, Prohibit, Receipt, Warning, X } from "@phosphor-icons/react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/ui/Icon";
import ImageViewer from "@/components/ui/ImageViewer";
import Select2 from "@/components/ui/Select2";
import PagarModal from "@/components/compras/PagarModal";
import FacturaModal from "@/components/compras/FacturaModal";
import {
  EstadoChip, OrigenIcono, RenglonesEditor, SIN_PRESUPUESTO, renglonVacio, renglonesParaApi, useObras, usePresupuesto, validarRenglones, type RenglonForm,
} from "@/components/compras/shared";
import { fmtCant, fmtCantUnidad, fmtGs } from "@/lib/compras/labels";
import { fmtDia, fmtFechaHora, haceCuanto } from "@/lib/dayjs";
import { confirmar, confirmarAccion, confirmarConTexto, notificar } from "@/lib/ui/alerts";
import { useMediaQuery } from "@/lib/ui/useMediaQuery";
import type { PurchaseLineDTO, PurchaseOrderDTO } from "@/lib/compras/core";
import type { ProjectItemDTO } from "@/lib/types";

const EDITABLE = ["pendiente", "aprobado"];

/** " por Ignacio" / " desde la app" (la app firma "Desde la app"). */
const quien = (por: string | null) => (!por ? "" : /^desde /i.test(por) ? ` ${por.toLowerCase()}` : ` por ${por}`);

async function postAccion(id: string, accion: string, body?: unknown): Promise<PurchaseOrderDTO> {
  const res = await fetch(`/api/compras/${id}/${accion}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "No se pudo completar. Probá de nuevo.");
  return d as PurchaseOrderDTO;
}

/** Celdas de comparación con el presupuesto de un renglón. */
function Comparacion({ l }: { l: PurchaseLineDTO }) {
  const p = l.presupuesto;
  if (!p) return <td colSpan={3} className="cmp-fuera">No está en el presupuesto</td>;
  return (
    <>
      <td className="num">
        {fmtCantUnidad(p.cantidad, p.unidad)}
        <div className="small text-body-secondary">× {fmtGs(p.precioUnitario)}</div>
      </td>
      <td className="num">{fmtCant(p.pedidoAntes)}</td>
      <td className="num">
        {p.restante < 0 ? (
          <span className="cmp-pasa d-inline-flex align-items-center gap-1"><Icon icon={Warning} size={16} /> Se pasa por {fmtCant(-p.restante)}</span>
        ) : (
          fmtCant(p.restante)
        )}
      </td>
    </>
  );
}

export default function PedidoDetalle({ params }: { params: { id: string } }) {
  const { id } = params;
  const esCelular = useMediaQuery("(max-width: 767px)");
  const [order, setOrder] = useState<PurchaseOrderDTO | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState(false);
  const [renglones, setRenglones] = useState<RenglonForm[]>([]);
  const [notas, setNotas] = useState("");
  const [fechaNecesaria, setFechaNecesaria] = useState("");
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [pagando, setPagando] = useState(false);
  // Mientras se aprueba, el botón queda deshabilitado: un doble toque mandaba
  // dos aprobaciones y la segunda volvía con un error falso.
  const [aprobando, setAprobando] = useState(false);
  const [facturando, setFacturando] = useState(false);
  const [gasto, setGasto] = useState<ProjectItemDTO | null>(null);
  const [verImagen, setVerImagen] = useState<string | null>(null);

  const editable = Boolean(order && EDITABLE.includes(order.status));
  const { options: obras } = useObras();
  const { items: presupuesto } = usePresupuesto(editando && order?.projectId ? order.projectId : null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/compras/${id}`);
      if (res.status === 404) throw new Error("Este pedido no existe (o se borró).");
      if (!res.ok) throw new Error("No se pudo cargar el pedido. Probá de nuevo.");
      setOrder(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  // El comprobante ya pasó al gasto de la obra: se busca ese solo gasto para mostrarlo.
  useEffect(() => {
    if (!order?.gastoItemId) { setGasto(null); return; }
    fetch(`/api/items/${order.gastoItemId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((item: ProjectItemDTO | null) => setGasto(item))
      .catch(() => setGasto(null));
  }, [order?.gastoItemId, order?.facturaAt]);

  const pasados = useMemo(() => (order?.lines ?? []).filter((l) => l.presupuesto && l.presupuesto.restante < 0), [order]);
  // Pedido aprobado: su cantidad ya está sumada en "pedido" del presupuesto; al editar no se cuenta dos veces.
  const pedidoPropio = useMemo(() => {
    const m: Record<string, number> = {};
    if (order?.status === "aprobado") for (const l of order.lines) if (l.budgetItemId) m[l.budgetItemId] = (m[l.budgetItemId] ?? 0) + l.cantidad;
    return m;
  }, [order]);

  function empezarEdicion() {
    if (!order) return;
    setRenglones(
      order.lines.map((l) => ({
        ...renglonVacio(),
        descripcion: l.descripcion,
        unidad: l.unidad ?? "",
        cantidad: String(l.cantidad).replace(".", ","),
        vinculo: l.budgetItemId ?? SIN_PRESUPUESTO,
      }))
    );
    setNotas(order.notas ?? "");
    setFechaNecesaria(order.fechaNecesaria ? order.fechaNecesaria.slice(0, 10) : "");
    setErrorEdicion(null);
    setEditando(true);
  }

  async function guardarEdicion() {
    if (!order) return;
    const problema = validarRenglones(renglones);
    if (problema) { setErrorEdicion(problema); return; }
    setGuardando(true);
    setErrorEdicion(null);
    try {
      const res = await fetch(`/api/compras/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: renglonesParaApi(renglones), notas: notas.trim() || null, fechaNecesaria: fechaNecesaria || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "No se pudo guardar.");
      setOrder(d);
      setEditando(false);
      notificar("Pedido actualizado");
    } catch (err: any) {
      setErrorEdicion(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarObra(projectId: string) {
    if (!order || projectId === (order.projectId ?? "")) return;
    try {
      const res = await fetch(`/api/compras/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: projectId || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "No se pudo cambiar la obra.");
      setOrder(d);
      notificar(projectId ? "Obra actualizada" : "Se quitó la obra");
    } catch (err: any) {
      notificar(err.message, "error");
      cargar();
    }
  }

  async function aprobar() {
    if (!order || aprobando) return;
    if (pasados.length) {
      const ok = await confirmar({
        titulo: "Se pasa del presupuesto",
        texto: `${pasados.length === 1 ? "Un material se pasa" : `${pasados.length} materiales se pasan`} de lo presupuestado (${pasados.map((l) => l.descripcion).join(", ")}). ¿Aprobar igual?`,
        confirmar: "Aprobar igual",
      });
      if (!ok) return;
    }
    setAprobando(true);
    try {
      setOrder(await postAccion(order.id, "aprobar"));
      notificar(`Pedido #${order.numero} aprobado`);
    } catch (err: any) {
      notificar(err.message, "error");
      cargar();
    } finally {
      setAprobando(false);
    }
  }

  async function rechazar() {
    if (!order) return;
    await confirmarConTexto({
      titulo: `¿Rechazar el pedido #${order.numero}?`,
      texto: order.origen === "whatsapp" ? "Se avisa en el grupo de WhatsApp." : undefined,
      etiqueta: "Motivo (opcional)",
      placeholder: "Ej.: ya hay material en depósito",
      confirmar: "Rechazar pedido",
      peligro: true,
      accion: async (motivo) => {
        const o = await postAccion(order.id, "rechazar", { motivo: motivo || null });
        setOrder(o);
      },
    });
  }

  async function anular() {
    if (!order) return;
    await confirmarAccion({
      titulo: `¿Anular el pedido #${order.numero}?`,
      texto: "Queda en el historial, pero ya no se puede aprobar, pagar ni modificar. No se puede deshacer.",
      confirmar: "Anular pedido",
      peligro: true,
      accion: async () => setOrder(await postAccion(order.id, "anular")),
    });
  }

  const crumbs = [{ label: "Compras", href: "/compras" }, { label: order ? `Pedido #${order.numero}` : "Pedido" }];
  if (cargando) return <AppShell crumbs={crumbs}><p className="state-message">Cargando pedido…</p></AppShell>;
  if (error || !order) {
    return (
      <AppShell crumbs={crumbs}>
        <div className="of-empty">
          <p className="of-empty-title">{error ?? "No se encontró el pedido."}</p>
          <Link href="/compras" className="btn btn-outline-secondary btn-sm">Volver a Compras</Link>
        </div>
      </AppShell>
    );
  }

  const o = order;
  const verGasto = o.projectId ? `/project/${o.projectId}?tab=change_order` : null;
  const totalEstimado = o.montoPagado ?? o.montoEstimado;
  const hayPrecio = o.lines.some((l) => l.precioUnitario !== null);

  // ---------------- "Qué sigue": el estado en palabras + la acción que corresponde ----------------
  let siguiente: { tono: string; titulo: string; detalle: React.ReactNode; acciones: React.ReactNode };
  if (o.status === "pendiente") {
    siguiente = {
      tono: "warn",
      titulo: "Esperando tu aprobación",
      detalle: pasados.length
        ? <><Icon icon={Warning} size={16} /> {pasados.length === 1 ? "Un material se pasa" : `${pasados.length} materiales se pasan`} del presupuesto. Revisalo abajo.</>
        : "Revisá los materiales y cómo quedan contra el presupuesto.",
      acciones: (
        <>
          <CButton color="secondary" variant="outline" onClick={rechazar} disabled={aprobando} className="d-inline-flex align-items-center gap-1"><Icon icon={X} size={18} /> Rechazar</CButton>
          <CButton color="primary" onClick={aprobar} disabled={aprobando} className="d-inline-flex align-items-center gap-1"><Icon icon={Check} size={18} weight="bold" /> {aprobando ? "Aprobando…" : "Aprobar"}</CButton>
        </>
      ),
    };
  } else if (o.status === "aprobado") {
    siguiente = {
      tono: "accent",
      titulo: "Aprobado · falta registrar el pago",
      detalle: o.projectId
        ? `Aprobado${quien(o.aprobadoPor)}${o.aprobadoAt ? ` el ${fmtFechaHora(o.aprobadoAt)}` : ""}. Al pagarlo se carga el gasto en la obra.`
        : "Antes de pagarlo, elegí a qué obra va (más abajo).",
      acciones: (
        <>
          <CButton color="secondary" variant="outline" onClick={() => setFacturando(true)} className="d-inline-flex align-items-center gap-1"><Icon icon={Receipt} size={18} /> {o.facturaNumero || o.facturaMediaId ? "Ver o corregir factura" : "Cargar factura"}</CButton>
          <CButton color="primary" onClick={() => setPagando(true)} disabled={!o.projectId} title={o.projectId ? undefined : "Elegí la obra para poder pagarlo"}>Registrar pago</CButton>
        </>
      ),
    };
  } else if (o.status === "pagado") {
    siguiente = o.faltaFactura
      ? {
          tono: "warn",
          titulo: "Pagado · falta la factura",
          detalle: `Se pagó ${fmtGs(o.montoPagado ?? 0)}${o.pagadoAt ? ` el ${fmtDia(o.pagadoAt)}` : ""}. El gasto ya está en la obra; falta el número de factura.`,
          acciones: (
            <>
              {verGasto && <Link href={verGasto} className="btn btn-outline-secondary d-inline-flex align-items-center gap-1"><Icon icon={ArrowSquareOut} size={18} /> Ver gasto en la obra</Link>}
              <CButton color="primary" onClick={() => setFacturando(true)} className="d-inline-flex align-items-center gap-1"><Icon icon={Receipt} size={18} /> Cargar factura</CButton>
            </>
          ),
        }
      : {
          tono: "ok",
          titulo: "Pagado y con factura",
          detalle: `Se pagó ${fmtGs(o.montoPagado ?? 0)}${o.pagadoAt ? ` el ${fmtDia(o.pagadoAt)}` : ""}. No falta nada.`,
          acciones: (
            <>
              <CButton color="secondary" variant="outline" onClick={() => setFacturando(true)} className="d-inline-flex align-items-center gap-1"><Icon icon={PencilSimple} size={18} /> Corregir factura</CButton>
              {verGasto && <Link href={verGasto} className="btn btn-outline-secondary d-inline-flex align-items-center gap-1"><Icon icon={ArrowSquareOut} size={18} /> Ver gasto en la obra</Link>}
            </>
          ),
        };
  } else if (o.status === "rechazado") {
    siguiente = {
      tono: "crit",
      titulo: "Rechazado",
      detalle: `${o.rechazoMotivo ? `Motivo: ${o.rechazoMotivo}. ` : ""}Rechazado${quien(o.aprobadoPor)}${o.aprobadoAt ? ` el ${fmtFechaHora(o.aprobadoAt)}` : ""}.`,
      acciones: null,
    };
  } else {
    siguiente = { tono: "muted", titulo: "Anulado", detalle: "Este pedido quedó sin efecto: no se puede aprobar, pagar ni modificar.", acciones: null };
  }

  const adjunto = gasto?.attachment ?? null;

  return (
    <AppShell
      crumbs={crumbs}
      headerActions={
        ["pendiente", "aprobado", "rechazado"].includes(o.status) ? (
          <CDropdown alignment="end">
            <CDropdownToggle color="secondary" variant="outline" size="sm" caret={false} title="Más acciones">
              <Icon icon={DotsThree} size={18} weight="bold" label="Más acciones" />
            </CDropdownToggle>
            <CDropdownMenu>
              <CDropdownItem as="button" className="text-danger d-flex align-items-center gap-2" onClick={anular}>
                <Icon icon={Prohibit} size={18} /> Anular pedido
              </CDropdownItem>
            </CDropdownMenu>
          </CDropdown>
        ) : undefined
      }
    >
      <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
        <h1 className="of-page-title m-0">Pedido de compra #{o.numero}</h1>
        <EstadoChip status={o.status} />
        {o.faltaFactura && <span className="status-chip of-chip-warn">Falta factura</span>}
      </div>
      <p className="module-desc d-flex flex-wrap align-items-center gap-1 mb-3">
        <OrigenIcono origen={o.origen} />
        Pidió <strong>{o.solicitante}</strong>
        {o.solicitantePhone && <span>({o.solicitantePhone})</span>}
        <span>· {fmtFechaHora(o.createdAt)} ({haceCuanto(o.createdAt)})</span>
        <span>· {o.origen === "whatsapp" ? "por WhatsApp" : "cargado en la app"}</span>
      </p>

      <section className={`cmp-siguiente tono-${siguiente.tono}`} aria-label="Qué sigue">
        <div className="cmp-siguiente-texto">
          <strong>{siguiente.titulo}</strong>
          <span>{siguiente.detalle}</span>
        </div>
        {siguiente.acciones && <div className="cmp-siguiente-acciones">{siguiente.acciones}</div>}
      </section>

      {o.origen === "whatsapp" && o.textoOriginal && (
        <details className="cmp-mensaje">
          <summary>Ver el mensaje original de WhatsApp</summary>
          <blockquote>{o.textoOriginal}</blockquote>
        </details>
      )}

      <CCard className="mb-3">
        <CCardBody>
          {!o.projectId && editable && (
            <CAlert color="warning" className="d-flex align-items-start gap-2">
              <Icon icon={Warning} size={20} />
              <div>
                <strong>Elegí la obra para poder pagarlo.</strong>
                {o.obraTexto && <div>En el mensaje decía: “{o.obraTexto}”.</div>}
              </div>
            </CAlert>
          )}
          <dl className="cmp-datos">
            <div style={{ gridColumn: editable ? "1 / -1" : undefined }}>
              <dt><label htmlFor="det-obra" className="m-0">Obra</label></dt>
              <dd>
                {editable ? (
                  <div style={{ maxWidth: 520 }}>
                    <Select2 id="det-obra" options={obras} value={o.projectId ?? ""} onChange={cambiarObra} placeholder="Elegí la obra" invalid={!o.projectId} />
                  </div>
                ) : o.projectId ? (
                  <Link href={`/project/${o.projectId}`}>{o.projectName}</Link>
                ) : (
                  <span className="text-body-secondary">{o.obraTexto ? `“${o.obraTexto}” (sin identificar)` : "Sin obra"}</span>
                )}
              </dd>
            </div>
            <div><dt>Para cuándo</dt><dd>{o.fechaNecesaria ? fmtDia(o.fechaNecesaria) : <span className="text-body-secondary">No lo dijeron</span>}</dd></div>
            <div><dt>Proveedor</dt><dd>{o.proveedorNombre ?? <span className="text-body-secondary">Se elige al pagar</span>}</dd></div>
            {o.notas && <div style={{ gridColumn: "1 / -1" }}><dt>Notas</dt><dd style={{ whiteSpace: "pre-wrap" }}>{o.notas}</dd></div>}
          </dl>
        </CCardBody>
      </CCard>

      <CCard className="mb-3">
        <CCardHeader className="module-panel-head mb-0">
          <div>
            <span className="fw-semibold fs-5">Materiales</span>
            <p className="module-desc mb-0">Cuánto se pide y cómo queda contra el presupuesto de la obra.</p>
          </div>
          {editable && !editando && (
            <CButton color="secondary" variant="outline" size="sm" className="d-inline-flex align-items-center gap-1" onClick={empezarEdicion}>
              <Icon icon={PencilSimple} size={16} /> Editar pedido
            </CButton>
          )}
        </CCardHeader>
        <CCardBody>
          {editando ? (
            <>
              {errorEdicion && <CAlert color="danger" role="alert">{errorEdicion}</CAlert>}
              <RenglonesEditor renglones={renglones} onChange={setRenglones} presupuesto={presupuesto} permitirFuera pedidoPropio={pedidoPropio} sinObra={!o.projectId} />
              <CRow className="g-3 mt-1">
                <CCol md={4}>
                  <CFormLabel htmlFor="ed-fecha">Para cuándo lo necesitan</CFormLabel>
                  <CFormInput id="ed-fecha" type="date" value={fechaNecesaria} onChange={(e) => setFechaNecesaria(e.target.value)} />
                </CCol>
                <CCol md={8}>
                  <CFormLabel htmlFor="ed-notas">Notas</CFormLabel>
                  <CFormTextarea id="ed-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
                </CCol>
              </CRow>
              <div className="d-flex justify-content-end gap-2 mt-3">
                <CButton color="secondary" variant="outline" onClick={() => setEditando(false)} disabled={guardando}>Cancelar</CButton>
                <CButton color="primary" onClick={guardarEdicion} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</CButton>
              </div>
            </>
          ) : esCelular ? (
            <div>
              {o.lines.map((l) => (
                <div key={l.id} className="cmp-linea-card">
                  <div className="fw-semibold">{fmtCantUnidad(l.cantidad, l.unidad)} · {l.descripcion}</div>
                  {l.presupuesto ? (
                    <>
                      <div className="fila"><span>Presupuestado</span><span>{fmtCantUnidad(l.presupuesto.cantidad, l.presupuesto.unidad)} × {fmtGs(l.presupuesto.precioUnitario)}</span></div>
                      <div className="fila"><span>Ya pedido antes</span><span>{fmtCant(l.presupuesto.pedidoAntes)}</span></div>
                      <div className="fila">
                        <span>Queda después</span>
                        {l.presupuesto.restante < 0
                          ? <span className="cmp-pasa d-inline-flex align-items-center gap-1"><Icon icon={Warning} size={16} /> Se pasa por {fmtCant(-l.presupuesto.restante)}</span>
                          : <span>{fmtCant(l.presupuesto.restante)}</span>}
                      </div>
                    </>
                  ) : (
                    <div className="cmp-fuera">No está en el presupuesto</div>
                  )}
                  {l.precioUnitario !== null && <div className="fila"><span>Precio pagado</span><span>{fmtGs(l.precioUnitario)} c/u</span></div>}
                </div>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table align-middle mb-0 cmp-lineas">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th className="num">Este pedido</th>
                    <th className="num">Presupuestado</th>
                    <th className="num">Ya pedido antes</th>
                    <th className="num">Queda después</th>
                    {hayPrecio && <th className="num">Precio pagado</th>}
                  </tr>
                </thead>
                <tbody>
                  {o.lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.descripcion}
                        {l.presupuesto && l.presupuesto.descripcion !== l.descripcion && (
                          <div className="small text-body-secondary">Ítem: {l.presupuesto.descripcion}</div>
                        )}
                      </td>
                      <td className="num fw-semibold">{fmtCantUnidad(l.cantidad, l.unidad)}</td>
                      <Comparacion l={l} />
                      {hayPrecio && <td className="num">{l.precioUnitario !== null ? fmtGs(l.precioUnitario) : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!editando && totalEstimado !== null && (
            <p className="text-end mt-3 mb-0">
              {o.montoPagado !== null ? "Total pagado: " : "Estimado con precios del presupuesto: ≈ "}
              <strong className="cmp-monto">{fmtGs(totalEstimado)}</strong>
            </p>
          )}
        </CCardBody>
      </CCard>

      {(o.status === "pagado" || o.facturaNumero || o.facturaMediaId) && (
        <CCard className="mb-3">
          <CCardHeader className="fw-semibold">Pago y factura</CCardHeader>
          <CCardBody>
            <dl className="cmp-datos">
              {o.status === "pagado" && (
                <>
                  <div><dt>Pagado</dt><dd className="cmp-monto">{fmtGs(o.montoPagado ?? 0)}</dd></div>
                  <div><dt>Fecha del pago</dt><dd>{o.pagadoAt ? fmtDia(o.pagadoAt) : "—"}</dd></div>
                  <div><dt>Medio de pago</dt><dd>{o.medioPago ?? "—"}</dd></div>
                </>
              )}
              <div><dt>Comprobante</dt><dd>{o.facturaNumero ? `${o.facturaTipo ?? "Factura"} N° ${o.facturaNumero}` : <span className="text-body-secondary">Falta el número</span>}</dd></div>
              {o.facturaRuc && <div><dt>RUC</dt><dd>{o.facturaRuc}</dd></div>}
              {o.facturaFecha && <div><dt>Fecha de la factura</dt><dd>{fmtDia(o.facturaFecha)}</dd></div>}
              {(o.iva10 || o.iva5) && <div><dt>IVA</dt><dd>{[o.iva10 ? `10 %: ${fmtGs(o.iva10)}` : null, o.iva5 ? `5 %: ${fmtGs(o.iva5)}` : null].filter(Boolean).join(" · ")}</dd></div>}
              <div style={{ gridColumn: "1 / -1" }}>
                <dt>Foto o PDF</dt>
                <dd>
                  {adjunto ? (
                    adjunto.mimeType.startsWith("image/") ? (
                      <button type="button" className="of-thumb-btn" onClick={() => setVerImagen(`/api/attachments/${adjunto.id}`)} title="Ver la factura en grande">
                        <img src={`/api/attachments/${adjunto.id}`} alt={adjunto.filename} className="item-receipt-thumb" />
                      </button>
                    ) : (
                      <a href={`/api/attachments/${adjunto.id}`} target="_blank" rel="noopener noreferrer" className="d-inline-flex align-items-center gap-1">
                        <Icon icon={FilePdf} size={18} /> {adjunto.filename}
                      </a>
                    )
                  ) : o.facturaMediaId && o.status !== "pagado" ? (
                    <span>
                      <a href={`/api/inbound-media/${o.facturaMediaId}`} target="_blank" rel="noopener noreferrer">Ver la factura recibida</a>
                      <span className="text-body-secondary"> · se adjunta al gasto cuando se registre el pago</span>
                    </span>
                  ) : (
                    <span className="text-body-secondary">Sin archivo</span>
                  )}
                </dd>
              </div>
            </dl>
          </CCardBody>
        </CCard>
      )}

      <CCard className="mb-3">
        <CCardHeader className="fw-semibold">Historial del pedido</CCardHeader>
        <CCardBody>
          <ol className="cmp-tiempo">
            <li>
              <div>Pedido {o.origen === "whatsapp" ? "por WhatsApp" : "cargado en la app"} por {o.solicitante}</div>
              <div className="cuando">{fmtFechaHora(o.createdAt)}</div>
            </li>
            {o.aprobadoAt && o.status !== "rechazado" && (
              <li className="is-ok">
                <div>Aprobado{quien(o.aprobadoPor)}</div>
                <div className="cuando">{fmtFechaHora(o.aprobadoAt)}</div>
              </li>
            )}
            {o.status === "rechazado" && (
              <li className="is-crit">
                <div>Rechazado{quien(o.aprobadoPor)}{o.rechazoMotivo ? `: ${o.rechazoMotivo}` : ""}</div>
                {o.aprobadoAt && <div className="cuando">{fmtFechaHora(o.aprobadoAt)}</div>}
              </li>
            )}
            {o.pagadoAt && (
              <li className="is-ok">
                <div>Pagado {fmtGs(o.montoPagado ?? 0)}{o.medioPago ? ` en ${o.medioPago.toLowerCase()}` : ""}{o.proveedorNombre ? ` a ${o.proveedorNombre}` : ""}</div>
                <div className="cuando">{fmtDia(o.pagadoAt)}</div>
              </li>
            )}
            {o.facturaAt && (
              <li>
                <div>{o.facturaNumero ? `Factura N° ${o.facturaNumero} cargada` : "Se recibió la factura (sin número todavía)"}</div>
                <div className="cuando">{fmtFechaHora(o.facturaAt)}</div>
              </li>
            )}
            {o.status === "anulado" && (
              <li className="is-crit"><div>Anulado</div></li>
            )}
          </ol>
        </CCardBody>
      </CCard>

      <PagarModal
        order={o}
        visible={pagando}
        onClose={() => setPagando(false)}
        onPaid={(n) => { setPagando(false); setOrder(n); notificar(`Pago registrado: ${fmtGs(n.montoPagado ?? 0)}`); }}
      />
      <FacturaModal
        order={o}
        visible={facturando}
        onClose={() => setFacturando(false)}
        onSaved={(n) => { setFacturando(false); setOrder(n); notificar("Factura guardada"); }}
      />
      <ImageViewer images={verImagen ? [{ src: verImagen, title: `Factura del pedido #${o.numero}` }] : []} index={verImagen ? 0 : null} onClose={() => setVerImagen(null)} />
    </AppShell>
  );
}
