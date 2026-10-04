"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CButton } from "@coreui/react";
import { Plus, ShoppingCart, Warning } from "@phosphor-icons/react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/ui/Icon";
import DataTable, { celdas } from "@/components/ui/DataTable";
import Select2 from "@/components/ui/Select2";
import NuevoPedidoModal from "@/components/compras/NuevoPedidoModal";
import { EstadoChip, OrigenIcono, useObras } from "@/components/compras/shared";
import { fmtCantUnidad, fmtGs } from "@/lib/compras/labels";
import { fmtDia } from "@/lib/dayjs";
import { useMediaQuery } from "@/lib/ui/useMediaQuery";
import { notificar } from "@/lib/ui/alerts";
import type { PurchaseOrderDTO } from "@/lib/compras/core";

/**
 * Pedidos de compra de todas las obras. Llegan por WhatsApp (Memby los lee
 * del grupo) o se cargan acá. El filtro arranca en "Por aprobar" si hay
 * alguno esperando: es lo primero que el dueño tiene que resolver.
 */

type Counts = { pendiente: number; aprobado: number; rechazado: number; pagado: number; anulado: number; faltaFactura: number };
type FiltroKey = "pendiente" | "aprobado" | "faltaFactura" | "pagado" | "cerrados" | "todos";

const FILTROS: { key: FiltroKey; label: string; vacio: string; cumple: (o: PurchaseOrderDTO) => boolean; cuenta: (c: Counts) => number; urgente?: boolean }[] = [
  { key: "pendiente", label: "Por aprobar", vacio: "No hay pedidos esperando aprobación.", cumple: (o) => o.status === "pendiente", cuenta: (c) => c.pendiente, urgente: true },
  { key: "aprobado", label: "Por pagar", vacio: "No hay pedidos aprobados esperando el pago.", cumple: (o) => o.status === "aprobado", cuenta: (c) => c.aprobado, urgente: true },
  { key: "faltaFactura", label: "Falta factura", vacio: "Todos los pedidos pagados tienen su factura.", cumple: (o) => o.faltaFactura, cuenta: (c) => c.faltaFactura, urgente: true },
  { key: "pagado", label: "Pagados", vacio: "Todavía no hay pedidos pagados.", cumple: (o) => o.status === "pagado", cuenta: (c) => c.pagado },
  { key: "cerrados", label: "Rechazados y anulados", vacio: "No hay pedidos rechazados ni anulados.", cumple: (o) => o.status === "rechazado" || o.status === "anulado", cuenta: (c) => c.rechazado + c.anulado },
  { key: "todos", label: "Todos", vacio: "", cumple: () => true, cuenta: (c) => c.pendiente + c.aprobado + c.rechazado + c.pagado + c.anulado },
];

interface Fila {
  id: string;
  numero: number;
  fecha: string;
  obra: string;
  solicitante: string;
  materiales: string;
  monto: number;
  status: string;
  o: PurchaseOrderDTO;
}

/** "50 bolsa cemento, 20 varilla 10 mm +3". */
function resumenMateriales(o: PurchaseOrderDTO): string {
  const primeros = o.lines.slice(0, 2).map((l) => `${fmtCantUnidad(l.cantidad, l.unidad)} ${l.descripcion}`);
  return primeros.join(", ") + (o.lines.length > 2 ? ` +${o.lines.length - 2}` : "");
}

function Monto({ o }: { o: PurchaseOrderDTO }) {
  if (o.montoPagado !== null) return <span className="cmp-monto">{fmtGs(o.montoPagado)}</span>;
  if (o.montoEstimado !== null) return <span className="cmp-monto text-body-secondary" title="Estimado con los precios del presupuesto">≈ {fmtGs(o.montoEstimado)}</span>;
  return <span className="text-body-secondary">—</span>;
}

function Obra({ o }: { o: PurchaseOrderDTO }) {
  if (o.projectName) return <>{o.projectName}</>;
  return (
    <span className="d-inline-flex flex-wrap align-items-center gap-1">
      {o.obraTexto && <span className="text-body-secondary">“{o.obraTexto}”</span>}
      <span className="status-chip of-chip-warn"><Icon icon={Warning} size={14} weight="bold" /> Obra sin identificar</span>
    </span>
  );
}

export default function ComprasPage() {
  const router = useRouter();
  const esCelular = useMediaQuery("(max-width: 767px)");
  const { options: obras } = useObras();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroKey | null>(null);
  const [orders, setOrders] = useState<PurchaseOrderDTO[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);

  // Filtros de la dirección (?projectId=&estado=): al volver del detalle se mantienen.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setProjectId(sp.get("projectId") ?? "");
    const e = sp.get("estado") as FiltroKey | null;
    if (e && FILTROS.some((f) => f.key === e)) setFiltro(e);
    if (sp.get("nuevo") === "1") setNuevo(true);
  }, []);

  // Cada pedido lleva su número: si al cambiar de obra rápido llega tarde una
  // respuesta vieja, se descarta en vez de pisar a la nueva.
  const pedido = useRef(0);
  const cargar = useCallback(async () => {
    if (projectId === null) return;
    const n = ++pedido.current;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/compras${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`);
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { orders: PurchaseOrderDTO[]; counts: Counts };
      if (n !== pedido.current) return;
      setOrders(d.orders);
      setCounts(d.counts);
      setFiltro((f) => f ?? (d.counts.pendiente > 0 ? "pendiente" : "todos"));
    } catch {
      if (n !== pedido.current) return;
      setError("No se pudieron cargar los pedidos. Revisá la conexión y probá de nuevo.");
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, [projectId]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (projectId === null || filtro === null) return;
    const sp = new URLSearchParams();
    if (projectId) sp.set("projectId", projectId);
    if (filtro !== "todos") sp.set("estado", filtro);
    const q = sp.toString();
    window.history.replaceState(null, "", `/compras${q ? `?${q}` : ""}`);
  }, [projectId, filtro]);

  const actual = FILTROS.find((f) => f.key === filtro) ?? FILTROS[FILTROS.length - 1];
  const visibles = useMemo(() => orders.filter(actual.cumple), [orders, actual]);
  const filas = useMemo<Fila[]>(
    () =>
      visibles.map((o) => ({
        id: o.id,
        numero: o.numero,
        fecha: o.createdAt,
        obra: o.projectName ?? o.obraTexto ?? "",
        solicitante: o.solicitante,
        materiales: resumenMateriales(o),
        monto: o.montoPagado ?? o.montoEstimado ?? 0,
        status: o.status,
        o,
      })),
    [visibles]
  );
  const obraFiltrada = projectId ? obras.find((x) => x.value === projectId)?.label : null;

  function abrir(e: React.MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.closest("a,button")) return;
    const tr = t.closest("tr[data-id]");
    if (tr) router.push(`/compras/${tr.getAttribute("data-id")}`);
  }

  return (
    <AppShell
      crumbs={[{ label: "Compras" }]}
      headerActions={
        // En el celular la barra de arriba ya no tiene lugar: el botón va en la página.
        esCelular ? undefined : (
          <CButton color="primary" size="sm" className="d-inline-flex align-items-center gap-1" onClick={() => setNuevo(true)}>
            <Icon icon={Plus} size={16} weight="bold" /> Nuevo pedido
          </CButton>
        )
      }
    >
      <h1 className="of-page-title d-flex align-items-center gap-2"><Icon icon={ShoppingCart} size={30} /> Compras</h1>
      <p className="module-desc mb-3">
        Pedidos de materiales de las obras. Llegan por el grupo de WhatsApp o se cargan acá: aprobalos, registrá el pago y cargá la factura.
      </p>
      {esCelular && (
        <CButton color="primary" className="w-100 mb-3 d-inline-flex align-items-center justify-content-center gap-1" style={{ minHeight: 44 }} onClick={() => setNuevo(true)}>
          <Icon icon={Plus} size={18} weight="bold" /> Nuevo pedido
        </CButton>
      )}

      <div className="d-flex flex-wrap align-items-end gap-3 mb-3">
        <div style={{ minWidth: 260, flex: "0 1 420px" }}>
          <label className="form-label small text-body-secondary mb-1" htmlFor="cmp-obra">Obra</label>
          <Select2 id="cmp-obra" options={obras} value={projectId ?? ""} onChange={(v) => { setProjectId(v); setFiltro(null); }} placeholder="Todas las obras" allowClear />
        </div>
        {obraFiltrada && (
          <button type="button" className="btn btn-link btn-sm px-0" onClick={() => { setProjectId(""); setFiltro(null); }}>Ver todas las obras</button>
        )}
      </div>

      {counts && (
        <div className="cmp-filtros" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((f) => {
            const n = f.cuenta(counts);
            return (
              <button key={f.key} type="button" className="cmp-filtro" aria-pressed={filtro === f.key} onClick={() => setFiltro(f.key)}>
                {f.label}
                <span className={"n" + (f.urgente && n > 0 ? " is-warn" : "")}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {cargando && <p className="state-message">Cargando pedidos…</p>}
      {!cargando && error && (
        <div className="of-empty">
          <p className="of-empty-title">{error}</p>
          <CButton color="primary" variant="outline" size="sm" onClick={cargar}>Reintentar</CButton>
        </div>
      )}

      {!cargando && !error && orders.length === 0 && (
        <div className="of-empty">
          <Icon icon={ShoppingCart} size={40} />
          <p className="of-empty-title">{obraFiltrada ? "Esta obra todavía no tiene pedidos de compra" : "Todavía no hay pedidos de compra"}</p>
          <p className="of-empty-sub">Llegan solos cuando el encargado pide materiales en el grupo de WhatsApp. También podés cargar uno a mano.</p>
          <CButton color="primary" size="sm" className="d-inline-flex align-items-center gap-1" onClick={() => setNuevo(true)}>
            <Icon icon={Plus} size={16} weight="bold" /> Nuevo pedido
          </CButton>
        </div>
      )}

      {!cargando && !error && orders.length > 0 && visibles.length === 0 && (
        <p className="state-message">{actual.vacio}</p>
      )}

      {!cargando && !error && visibles.length > 0 && esCelular && (
        <ul className="cmp-cards">
          {visibles.map((o) => (
            <li key={o.id}>
              <Link href={`/compras/${o.id}`} className="cmp-card">
                <div className="cmp-card-top">
                  <strong>#{o.numero}</strong>
                  <span className="d-inline-flex gap-1 flex-wrap justify-content-end">
                    <EstadoChip status={o.status} />
                    {o.faltaFactura && <span className="status-chip of-chip-warn">Falta factura</span>}
                  </span>
                </div>
                <div className="small"><Obra o={o} /></div>
                <div className="cmp-card-mats">{resumenMateriales(o)}</div>
                <div className="cmp-card-meta">
                  <span className="d-inline-flex align-items-center gap-1"><OrigenIcono origen={o.origen} size={14} /> {o.solicitante}</span>
                  <span>{fmtDia(o.createdAt)}</span>
                  <Monto o={o} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!cargando && !error && visibles.length > 0 && !esCelular && (
        <div className="table-wrap" onClick={abrir}>
          <DataTable
            key={`${filtro}-${projectId}`}
            className="cmp-tabla"
            data={filas}
            columns={[
              { data: "numero", title: "N°", className: "text-nowrap" },
              { data: "fecha", title: "Fecha", className: "text-nowrap" },
              { data: "obra", title: "Obra" },
              { data: "solicitante", title: "Pidió" },
              { data: "materiales", title: "Materiales", orderable: false },
              { data: "monto", title: "Monto", className: "text-end text-nowrap" },
              { data: "status", title: "Estado" },
            ]}
            options={{
              order: [[0, "desc"]],
              createdRow: (row: Node, data: any) => { (row as HTMLElement).setAttribute("data-id", (data as Fila).id); },
            }}
            slots={celdas<Fila>({
              0: (_, f) => <Link href={`/compras/${f.id}`} className="cmp-num">#{f.numero}</Link>,
              1: (_, f) => <>{fmtDia(f.fecha)}</>,
              2: (_, f) => <Obra o={f.o} />,
              3: (_, f) => <span className="d-inline-flex align-items-center gap-1"><OrigenIcono origen={f.o.origen} /> {f.solicitante}</span>,
              5: (_, f) => <Monto o={f.o} />,
              6: (_, f) => (
                <span className="d-inline-flex gap-1 flex-wrap">
                  <EstadoChip status={f.status} />
                  {f.o.faltaFactura && <span className="status-chip of-chip-warn">Falta factura</span>}
                </span>
              ),
            })}
          />
        </div>
      )}

      <NuevoPedidoModal
        visible={nuevo}
        obraInicial={projectId || null}
        onClose={() => setNuevo(false)}
        onCreated={(o) => {
          setNuevo(false);
          notificar(`Pedido #${o.numero} cargado`);
          router.push(`/compras/${o.id}`);
        }}
      />
    </AppShell>
  );
}
