"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CCard, CCardBody, CCardHeader, CFormInput, CFormSelect, CFormSwitch, CButton, CRow, CCol,
  CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell,
  CBadge, CNav, CNavItem, CNavLink,
} from "@coreui/react";
import { ArrowsLeftRight, DownloadSimple, HourglassMedium, FilePdf, FileText, Lightning, LockSimple, LockSimpleOpen, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import Icon from "@/components/ui/Icon";
import DataTable, { celdas } from "@/components/ui/DataTable";
import ImageViewer from "@/components/ui/ImageViewer";
import AppShell from "@/components/AppShell";
import { confirmarAccion, notificar } from "@/lib/ui/alerts";
import ItemFormModal from "@/components/ItemFormModal";
import GeneralMovementFormModal from "@/components/GeneralMovementFormModal";
import { MOVIMIENTO_TIPOS, esPendiente } from "@/lib/movimientos";
import type { MovimientoDTO, ProjectItemDTO, ProjectType, GeneralMovementDTO, GeneralMovementTipo } from "@/lib/types";
import { todayLocal } from "@/lib/dates";

/**
 * Ejecución cruzada a TODAS las obras — a diferencia de /ejecucion (que
 * pide elegir una obra primero), esto es el libro diario completo de la
 * empresa: todos los movimientos de todas las obras y rubros juntos, para
 * poder auditar/buscar sin tener que entrar obra por obra. Se llega acá
 * haciendo clic en la card "Costos vs. beneficios" de Inicio. Los
 * movimientos de obra son de solo lectura acá por defecto (se cargan/
 * editan desde la Ejecución de la obra correspondiente) — hay un toggle
 * "Editar movimientos de obra" para habilitarlo temporalmente también
 * desde acá (pedido puntual, para arreglar algo sin tener que ir a la
 * ficha de la obra; queda guardado en localStorage hasta que se
 * desactive). Los movimientos generales (sin obra — ver GeneralMovement en
 * prisma/schema.prisma) siempre se cargan, editan y eliminan desde esta
 * misma pantalla.
 */

const OBRA_EDIT_STORAGE_KEY = "obrasflow-movimientos-obra-edit";

const TYPE_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };
const TYPE_COLOR: Record<ProjectType, string> = { civil: "info", electrico: "warning", vial: "secondary", otro: "dark" };
const TYPE_ORDER: ProjectType[] = ["civil", "electrico", "vial", "otro"];

function fmtMoney(n: number) {
  // Guaraníes no tienen decimales — sin el redondeo, un precio por unidad
  // calculado (monto / cantidad) salía como "Gs. 2.166.666,667".
  return "Gs. " + Math.round(Number(n || 0)).toLocaleString("es-PY");
}
/** "YYYY-MM-DD" (o el createdAt como respaldo) -> "DD/MM/YYYY". */
function itemDate(m: MovimientoDTO): string {
  const raw = (m.data?.fecha || m.createdAt).slice(0, 10);
  const [y, mo, d] = raw.split("-");
  return y && mo && d ? `${d}/${mo}/${y}` : raw;
}
/** "YYYY-MM-DD" -> "DD/MM/YYYY", mismo criterio que itemDate() pero para GeneralMovementDTO (sin createdAt de respaldo, fecha siempre viene cargada). */
function generalDate(fecha: string): string {
  const raw = fecha.slice(0, 10);
  const [y, mo, d] = raw.split("-");
  return y && mo && d ? `${d}/${mo}/${y}` : raw;
}

/**
 * Fila normalizada de la tabla "Movimientos" — mezcla movimientos de obra
 * (MovimientoDTO, kind="change_order") y movimientos generales sin obra
 * (GeneralMovementDTO) en una sola forma para que un único bloque de
 * filtros/orden/CSV/tabla funcione igual sobre ambas fuentes.
 */
interface LedgerRow {
  id: string;
  source: "obra" | "general";
  fecha: string; // "YYYY-MM-DD", para ordenar/filtrar por fecha
  fechaLabel: string; // "DD/MM/YYYY", para mostrar
  obraId: string | null;
  obraNombre: string | null;
  obraTipo: ProjectType | null;
  sitioId: string | null; // solo obra — Sitio de esa obra, si pertenece a uno (ver lib/profitShare.ts)
  sitioNombre: string | null;
  concepto: string;
  categoria: string | null;
  contratistaProveedorLabel: string | null; // solo obra; null para general
  contratistaId: string | null; // para el link, solo obra
  monto: number;
  movTipoObra: string | null; // m.data?.tipo, solo obra — para el filtro "Todos los tipos" existente
  ingresoEgreso: GeneralMovementTipo | null; // solo general
  medioPago: string | null;
  estado: string | null;
  procesadoPor: string | null;
  responsable: string | null; // solo general — quién consiguió el ingreso, ver GeneralMovement.responsable
  attachment: MovimientoDTO["attachment"] | null; // solo obra, general no tiene adjunto en esta primera versión
  comprobanteTexto: string | null; // m.data?.comprobante, solo obra
  notas: string | null;
  raw: MovimientoDTO | GeneralMovementDTO; // para prellenar el modal de edición / linkear la obra
}

function obraToRow(m: MovimientoDTO): LedgerRow {
  const contratistaProveedorLabel =
    m.data?.contratistaNombre || m.data?.proveedorNombre
      ? m.data?.contratistaNombre || m.data?.proveedorNombre
      : m.data?.rubroEjecutado
      ? `Mano de obra: ${m.data.rubroEjecutado}`
      : null;
  return {
    id: m.id,
    source: "obra",
    fecha: (m.data?.fecha || m.createdAt).slice(0, 10),
    fechaLabel: itemDate(m),
    obraId: m.projectId,
    obraNombre: m.projectName,
    obraTipo: m.projectType,
    sitioId: m.sitioId,
    sitioNombre: m.sitioNombre,
    concepto: m.title,
    categoria: m.data?.categoria ?? null,
    contratistaProveedorLabel,
    contratistaId: m.data?.contratistaId ?? null,
    monto: Number(m.data?.monto ?? 0),
    movTipoObra: m.data?.tipo ?? null,
    ingresoEgreso: null,
    medioPago: m.data?.medioPago ?? null,
    estado: m.status ?? null,
    procesadoPor: m.data?.procesadoPor ?? null,
    responsable: null,
    attachment: m.attachment ?? null,
    comprobanteTexto: m.data?.comprobante ?? null,
    notas: m.data?.notas ?? null,
    raw: m,
  };
}

function generalToRow(g: GeneralMovementDTO): LedgerRow {
  return {
    id: g.id,
    source: "general",
    fecha: g.fecha,
    fechaLabel: generalDate(g.fecha),
    obraId: null,
    obraNombre: null,
    obraTipo: null,
    sitioId: null,
    sitioNombre: null,
    concepto: g.concepto,
    categoria: g.categoria,
    contratistaProveedorLabel: null,
    contratistaId: null,
    monto: g.monto,
    movTipoObra: null,
    ingresoEgreso: g.tipo,
    medioPago: g.medioPago,
    estado: g.estado,
    procesadoPor: g.procesadoPor,
    responsable: g.responsable,
    attachment: null,
    comprobanteTexto: null,
    notas: g.notas,
    raw: g,
  };
}

function exportCSV(rows: LedgerRow[]) {
  const headers = [
    "Fecha", "Obra", "Rubro", "Concepto", "Categoría", "Contratista/Proveedor",
    "Monto (Gs.)", "Medio de pago", "Estado", "Procesado por", "Responsable", "Comprobante", "Notas",
  ];
  const csvRows = rows.map((r) => [
    r.fechaLabel,
    r.obraNombre ?? "General (sin obra)",
    r.obraTipo ? TYPE_LABEL[r.obraTipo] : r.ingresoEgreso === "egreso" ? "Egreso" : r.ingresoEgreso === "ingreso" ? "Ingreso" : "",
    r.concepto,
    r.categoria ?? "",
    r.contratistaProveedorLabel ?? "",
    r.monto,
    r.medioPago ?? "",
    r.estado ?? "",
    r.procesadoPor ?? "",
    r.responsable ?? "",
    r.attachment?.filename ?? r.comprobanteTexto ?? "",
    r.notas ?? "",
  ]);
  const csv = [headers, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `movimientos-obrasflow-${todayLocal()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface RubroAgregado {
  rubro: string;
  unidadMedida: string;
  cantidadTotal: number;
  vecesEjecutado: number;
  precioActual: number | null;
  ultimaFecha: string;
  ultimaObraId: string;
  ultimaObraNombre: string;
}

function RubrosEjecutadosView({ movimientos }: { movimientos: MovimientoDTO[] }) {
  const [search, setSearch] = useState("");

  const rubros = useMemo<RubroAgregado[]>(() => {
    const groups = new Map<string, MovimientoDTO[]>();
    movimientos
      .filter((m) => m.data?.tipoInsumo === "Mano de obra")
      .filter((m) => String(m.data?.rubroEjecutado ?? "").trim() !== "")
      .forEach((m) => {
        const key = String(m.data.rubroEjecutado).trim();
        const arr = groups.get(key) ?? [];
        arr.push(m);
        groups.set(key, arr);
      });

    const result: RubroAgregado[] = [];
    groups.forEach((items, rubro) => {
      const sorted = items
        .slice()
        .sort((a, b) => {
          const da = (a.data?.fecha || a.createdAt).slice(0, 10);
          const db = (b.data?.fecha || b.createdAt).slice(0, 10);
          return db.localeCompare(da);
        });
      const latest = sorted[0];
      const cantidadTotal = items.reduce((sum, m) => sum + Number(m.data?.cantidadEjecutada ?? 0), 0);
      const cantidadEjecutadaLatest = Number(latest.data?.cantidadEjecutada ?? 0);
      const montoLatest = Number(latest.data?.monto ?? 0);
      const precioActual =
        Number.isFinite(cantidadEjecutadaLatest) && cantidadEjecutadaLatest > 0
          ? montoLatest / cantidadEjecutadaLatest
          : null;
      result.push({
        rubro,
        unidadMedida: latest.data?.unidadMedida || "—",
        cantidadTotal,
        vecesEjecutado: items.length,
        precioActual,
        ultimaFecha: itemDate(latest),
        ultimaObraId: latest.projectId,
        ultimaObraNombre: latest.projectName,
      });
    });

    return result.sort((a, b) => b.cantidadTotal - a.cantidadTotal);
  }, [movimientos]);

  const visible = rubros.filter((r) => !search || r.rubro.toLowerCase().includes(search.toLowerCase()));

  return (
    <CCard>
      <CCardHeader className="module-panel-head">
        <div>
          <span className="fw-semibold fs-5">Rubros ejecutados</span>
          <p className="module-desc mb-0">
            Cantidad total ejecutada, veces trabajado y precio actual por unidad de cada rubro de mano de obra,
            en todas las obras — para saber con qué experiencia contamos y a qué precio estamos trabajando hoy.
          </p>
        </div>
      </CCardHeader>
      <CCardBody>
        {rubros.length === 0 ? (
          <p className="empty-col">Todavía no hay movimientos de mano de obra con rubro ejecutado cargado.</p>
        ) : (
          <>
            <CRow className="g-2 mb-3">
              <CCol md={4}>
                <CFormInput placeholder="Buscar rubro…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </CCol>
            </CRow>

            {visible.length === 0 && <p className="empty-col">Ningún rubro coincide con esta búsqueda.</p>}
            {visible.length > 0 && (
              <div className="table-wrap">
                <CTable hover responsive>
                  <CTableHead>
                    <CTableRow>
                      <CTableHeaderCell>Rubro</CTableHeaderCell>
                      <CTableHeaderCell>Unidad de medida</CTableHeaderCell>
                      <CTableHeaderCell>Cantidad total ejecutada</CTableHeaderCell>
                      <CTableHeaderCell>Veces ejecutado</CTableHeaderCell>
                      <CTableHeaderCell>Precio actual por unidad (Gs)</CTableHeaderCell>
                      <CTableHeaderCell>Última vez</CTableHeaderCell>
                      <CTableHeaderCell>Última obra</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {visible.map((r) => (
                      <CTableRow key={r.rubro}>
                        <CTableDataCell>{r.rubro}</CTableDataCell>
                        <CTableDataCell>{r.unidadMedida}</CTableDataCell>
                        <CTableDataCell className="mono">
                          {Number.isInteger(r.cantidadTotal) ? r.cantidadTotal : r.cantidadTotal.toFixed(2)}
                        </CTableDataCell>
                        <CTableDataCell className="mono">{r.vecesEjecutado}</CTableDataCell>
                        <CTableDataCell className="mono">{r.precioActual != null ? fmtMoney(r.precioActual) : "—"}</CTableDataCell>
                        <CTableDataCell className="mono">{r.ultimaFecha}</CTableDataCell>
                        <CTableDataCell><Link href={`/project/${r.ultimaObraId}`}>{r.ultimaObraNombre} ↗</Link></CTableDataCell>
                      </CTableRow>
                    ))}
                  </CTableBody>
                </CTable>
              </div>
            )}
          </>
        )}
      </CCardBody>
    </CCard>
  );
}


export default function MovimientosPage() {
  const [tab, setTab] = useState<"movimientos" | "rubros">("movimientos");
  const [movimientos, setMovimientos] = useState<MovimientoDTO[]>([]);
  const [generalMovements, setGeneralMovements] = useState<GeneralMovementDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterObra, setFilterObra] = useState("");
  const [filterSitio, setFilterSitio] = useState("");
  const [filterRubro, setFilterRubro] = useState<ProjectType | "">("");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [verComprobante, setVerComprobante] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"fecha_desc" | "fecha_asc" | "monto_desc" | "monto_asc">("fecha_desc");

  const [showGeneralForm, setShowGeneralForm] = useState(false);
  const [editingGeneral, setEditingGeneral] = useState<GeneralMovementDTO | null>(null);

  // Toggle temporal para editar/eliminar movimientos de OBRA directo desde
  // acá (por defecto solo se puede desde la Ejecución de la obra) — pedido
  // puntual del usuario, con la aclaración de que lo va a desactivar él
  // mismo cuando termine. Se guarda en localStorage (no en el servidor:
  // es una preferencia de este navegador, no una config de toda la app)
  // para que sobreviva a un refresh mientras lo está usando.
  const [obraEditEnabled, setObraEditEnabled] = useState(false);
  const [showObraForm, setShowObraForm] = useState(false);
  const [editingObraItem, setEditingObraItem] = useState<MovimientoDTO | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      fetch("/api/movimientos").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      fetch("/api/general-movements").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    ])
      .then(([mov, gen]) => { setMovimientos(mov); setGeneralMovements(gen); })
      .catch(() => setLoadError("No se pudieron cargar los movimientos."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      setObraEditEnabled(localStorage.getItem(OBRA_EDIT_STORAGE_KEY) === "1");
    } catch {
      /* si localStorage no está disponible, se queda desactivado — es lo más seguro por defecto */
    }
  }, []);

  function toggleObraEdit() {
    setObraEditEnabled((cur) => {
      const next = !cur;
      try {
        localStorage.setItem(OBRA_EDIT_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* sin persistencia, igual funciona para esta sesión de la página */
      }
      return next;
    });
  }

  // Movimientos de obra + movimientos generales, normalizados a una sola forma — ver LedgerRow.
  const rows: LedgerRow[] = useMemo(
    () => [...movimientos.map(obraToRow), ...generalMovements.map(generalToRow)],
    [movimientos, generalMovements]
  );

  // Obras/estados presentes en los datos — evita un fetch aparte a /api/projects
  // solo para poblar el selector.
  const obraOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => { if (r.obraId && r.obraNombre) map.set(r.obraId, r.obraNombre); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  // Sitios presentes en los movimientos de obra — igual criterio que obraOptions.
  const sitioOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => { if (r.sitioId && r.sitioNombre) map.set(r.sitioId, r.sitioNombre); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const estadoOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.estado).filter(Boolean))) as string[],
    [rows]
  );
  const existingResponsables = useMemo(
    () => Array.from(new Set(generalMovements.map((g) => g.responsable).filter(Boolean))) as string[],
    [generalMovements]
  );

  // Total de volumen (obra + general), sin restar por ingreso/egreso — la
  // ganancia neta de la empresa se calcula en Inicio, no acá.
  const totalMonto = rows.reduce((sum, r) => sum + r.monto, 0);
  // Gastos de obra en "Pendiente": no suman al Ejecutado (decisión 2026-10-04), se resaltan.
  const pendientesObra = rows.filter((r) => r.source === "obra" && esPendiente(r.estado));

  const visible = rows
    .filter((r) => !filterObra || r.obraId === filterObra)
    .filter((r) => !filterSitio || r.sitioId === filterSitio)
    .filter((r) => !filterRubro || r.obraTipo === filterRubro)
    .filter((r) => !filterTipo || r.movTipoObra === filterTipo)
    .filter((r) => !filterEstado || r.estado === filterEstado)
    .filter((r) => {
      if (dateFrom && r.fecha < dateFrom) return false;
      if (dateTo && r.fecha > dateTo) return false;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return [r.concepto, r.obraNombre, r.categoria, r.contratistaProveedorLabel, r.procesadoPor, r.responsable, r.comprobanteTexto, r.notas]
        .some((v) => String(v ?? "").toLowerCase().includes(q));
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === "monto_desc") return b.monto - a.monto;
      if (sortBy === "monto_asc") return a.monto - b.monto;
      return sortBy === "fecha_asc" ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha);
    });

  const filtersActive = Boolean(search || filterObra || filterSitio || filterRubro || filterTipo || filterEstado || dateFrom || dateTo);
  function clearFilters() {
    setSearch(""); setFilterObra(""); setFilterSitio(""); setFilterRubro(""); setFilterTipo(""); setFilterEstado(""); setDateFrom(""); setDateTo("");
  }

  function handleGeneralSaved(saved: GeneralMovementDTO) {
    setGeneralMovements((cur) => (cur.some((g) => g.id === saved.id) ? cur.map((g) => (g.id === saved.id ? saved : g)) : [saved, ...cur]));
    setShowGeneralForm(false);
    setEditingGeneral(null);
  }

  async function deleteGeneral(g: GeneralMovementDTO) {
    await confirmarAccion({
      titulo: "Eliminar movimiento",
      texto: `¿Eliminar "${g.concepto}"? Esta acción no se puede deshacer.`,
      confirmar: "Eliminar",
      peligro: true,
      accion: async () => {
        const prev = generalMovements;
        setGeneralMovements((cur) => cur.filter((x) => x.id !== g.id));
        try {
          const res = await fetch(`/api/general-movements/${g.id}`, { method: "DELETE" });
          if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
        } catch {
          setGeneralMovements(prev);
          throw new Error("No se pudo eliminar el movimiento.");
        }
      },
    });
  }

  // ItemFormModal devuelve un ProjectItemDTO (sin projectName/projectType,
  // que son un agregado propio de /api/movimientos) — se completan acá con
  // los que ya tenía editingObraItem, que no cambian al editar. El PUT
  // genérico de ProjectItem que usa este modal (app/api/items/[itemId]/
  // route.ts) ya recalcula el Ejecutado de la obra solo, no hace falta
  // nada aparte acá.
  function handleObraSaved(saved: ProjectItemDTO) {
    setShowObraForm(false);
    const full: MovimientoDTO = {
      ...saved,
      projectName: editingObraItem?.projectName ?? "",
      projectType: editingObraItem?.projectType ?? "civil",
      sitioId: editingObraItem?.sitioId ?? null,
      sitioNombre: editingObraItem?.sitioNombre ?? null,
    };
    setMovimientos((cur) => cur.map((m) => (m.id === full.id ? full : m)));
    setEditingObraItem(null);
  }

  async function deleteObraItem(item: MovimientoDTO) {
    await confirmarAccion({
      titulo: "Eliminar movimiento de obra",
      texto: `¿Eliminar "${item.title}" de ${item.projectName}? Esta acción no se puede deshacer.`,
      confirmar: "Eliminar",
      peligro: true,
      accion: async () => {
        const prev = movimientos;
        setMovimientos((cur) => cur.filter((x) => x.id !== item.id));
        try {
          const res = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
          if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
        } catch {
          setMovimientos(prev);
          throw new Error("No se pudo eliminar el movimiento de obra.");
        }
      },
    });
  }

  // Sugerencias de "Nombre del rubro" para el modal de edición de un
  // movimiento de obra — solo los ya usados en ESA MISMA obra (mismo
  // criterio que la ficha de la obra), no en todas.
  const existingRubrosForObraEdit = editingObraItem
    ? Array.from(new Set(movimientos.filter((m) => m.projectId === editingObraItem.projectId).map((m) => m.title.trim()))).sort()
    : [];

  return (
    <AppShell crumbs={[{ label: "Movimientos" }]}>
      <h1 className="of-page-title d-flex align-items-center gap-2"><Icon icon={ArrowsLeftRight} size={30} /> Movimientos</h1>
      <p className="module-desc mb-4">
        Todas las obras en un solo lugar. Los gastos de obra se editan desde su obra; los generales (sin obra), acá.
      </p>

      <CNav variant="underline" className="mb-4">
        <CNavItem>
          <CNavLink active={tab === "movimientos"} onClick={() => setTab("movimientos")} style={{ cursor: "pointer" }}>
            Movimientos
          </CNavLink>
        </CNavItem>
        <CNavItem>
          <CNavLink active={tab === "rubros"} onClick={() => setTab("rubros")} style={{ cursor: "pointer" }}>
            Rubros ejecutados
          </CNavLink>
        </CNavItem>
      </CNav>

      {tab === "rubros" && <RubrosEjecutadosView movimientos={movimientos} />}

      {tab === "movimientos" && (
      <CCard>
        <CCardHeader className="module-panel-head">
          <div>
            <span className="fw-semibold fs-5">Movimientos</span>
            <p className="module-desc mb-0">{rows.length} movimiento{rows.length === 1 ? "" : "s"} cargados — total {fmtMoney(totalMonto)}.
              {pendientesObra.length > 0 && (
                <> <span className="of-pendiente-tag ms-1"><Icon icon={HourglassMedium} size={14} weight="bold" />{pendientesObra.length} de obra pendiente{pendientesObra.length === 1 ? "" : "s"} · no suman al Ejecutado</span></>
              )}
            </p>
          </div>
          <div className="d-flex gap-2">
            <Link href="/registro-rapido" className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1"><Icon icon={Lightning} size={16} /> Clasificar registros rápidos</Link>
            <CButton color="primary" size="sm" onClick={() => { setEditingGeneral(null); setShowGeneralForm(true); }}>
              <Icon icon={Plus} size={16} weight="bold" className="me-1" /> Agregar movimiento general
            </CButton>
            <CButton color="secondary" variant="outline" size="sm" onClick={() => exportCSV(visible)} disabled={visible.length === 0}>
              <Icon icon={DownloadSimple} size={16} className="me-1" /> Exportar CSV
            </CButton>
          </div>
        </CCardHeader>
        <CCardBody>
          <div
            className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 p-2 rounded"
            style={{
              border: "1px solid var(--line)",
              background: obraEditEnabled ? "color-mix(in srgb, var(--crit) 10%, transparent)" : "var(--paper)",
            }}
          >
            <CFormSwitch
              label={<span className="d-inline-flex align-items-center gap-1"><Icon icon={obraEditEnabled ? LockSimpleOpen : LockSimple} size={16} />{obraEditEnabled ? "Edición de movimientos de obra habilitada" : "Habilitar edición de movimientos de obra"}</span>}
              checked={obraEditEnabled}
              onChange={toggleObraEdit}
            />
            {obraEditEnabled && (
              <span className="text-body-secondary small">
                Es temporal — acordate de desactivarlo cuando termines. Editar/eliminar acá tiene el mismo efecto que hacerlo desde la Ejecución de la obra.
              </span>
            )}
          </div>
          {loading && <p className="state-message">Cargando movimientos…</p>}
          {!loading && loadError && <p className="state-message form-error">{loadError}</p>}
          {!loading && !loadError && rows.length === 0 && (
            <div className="of-empty">
              <Icon icon={ArrowsLeftRight} size={40} />
              <p className="of-empty-title">Todavía no hay movimientos</p>
              <p className="of-empty-sub">Los gastos de obra se cargan con "Gasto de obra" (arriba). Los generales, acá.</p>
              <CButton color="primary" variant="outline" size="sm" onClick={() => { setEditingGeneral(null); setShowGeneralForm(true); }}>
                <Icon icon={Plus} size={16} weight="bold" className="me-1" /> Agregar movimiento general
              </CButton>
            </div>
          )}

          {!loading && !loadError && rows.length > 0 && (
            <>
              <CRow className="g-2 mb-2">
                <CCol md={4}>
                  <CFormInput placeholder="Buscar por concepto, obra, categoría, contratista, comprobante…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </CCol>
                <CCol md={3}>
                  <CFormSelect value={filterObra} onChange={(e) => setFilterObra(e.target.value)}>
                    <option value="">Todas las obras</option>
                    {obraOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </CFormSelect>
                </CCol>
                {sitioOptions.length > 0 && (
                  <CCol md={2}>
                    <CFormSelect value={filterSitio} onChange={(e) => setFilterSitio(e.target.value)}>
                      <option value="">Todos los sitios</option>
                      {sitioOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </CFormSelect>
                  </CCol>
                )}
                <CCol md={2}>
                  <CFormSelect value={filterRubro} onChange={(e) => setFilterRubro(e.target.value as ProjectType | "")}>
                    <option value="">Todos los rubros</option>
                    {TYPE_ORDER.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </CFormSelect>
                </CCol>
                <CCol md={3}>
                  <CFormSelect value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)}>
                    <option value="">Todos los tipos</option>
                    {MOVIMIENTO_TIPOS.map((t) => <option key={t.value} value={t.value}>{t.value}</option>)}
                  </CFormSelect>
                </CCol>
              </CRow>
              <CRow className="g-2 mb-3">
                <CCol md={3}>
                  <CFormSelect value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}>
                    <option value="">Todos los estados</option>
                    {estadoOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </CFormSelect>
                </CCol>
                <CCol md={2}><CFormInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Desde" /></CCol>
                <CCol md={2}><CFormInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Hasta" /></CCol>
                {filtersActive && (
                  <CCol md={3} className="d-flex align-items-center">
                    <button type="button" className="btn btn-sm btn-link px-0" onClick={clearFilters}>Limpiar filtros</button>
                  </CCol>
                )}
              </CRow>

              {visible.length === 0 && <p className="empty-col">Ningún movimiento coincide con estos filtros.</p>}
              {visible.length > 0 && (
                // key: al cambiar el candado se redibujan las celdas de acciones.
                <div className="table-wrap">
                <DataTable
                  key={obraEditEnabled ? "edit" : "ro"}
                  data={visible}
                  columns={[
                    { data: "fecha", title: "Fecha", className: "mono text-nowrap" },
                    { data: "obraNombre", title: "Obra", defaultContent: "" },
                    { data: "obraTipo", title: "Rubro", defaultContent: "" },
                    { data: "concepto", title: "Concepto" },
                    { data: "categoria", title: "Categoría", defaultContent: "" },
                    { data: "contratistaProveedorLabel", title: "Contratista / Proveedor", defaultContent: "" },
                    { data: "monto", title: "Monto (Gs)", className: "mono text-end text-nowrap" },
                    { data: "medioPago", title: "Medio de pago", defaultContent: "" },
                    { data: "estado", title: "Estado", defaultContent: "" },
                    { data: "procesadoPor", title: "Procesado por", defaultContent: "" },
                    { data: "responsable", title: "Responsable", defaultContent: "" },
                    { data: null, title: "Comprobante", orderable: false },
                    { data: null, title: "Acciones", orderable: false },
                  ]}
                  options={{
                    order: [[0, "desc"]],
                    searching: false,
                    // Fila resaltada para los gastos de obra pendientes (mismo estilo que Ejecución).
                    createdRow: (tr, data) => {
                      const row = data as LedgerRow;
                      if (row.source === "obra" && esPendiente(row.estado)) (tr as HTMLElement).classList.add("of-fila-pendiente");
                    },
                  }}
                  slots={celdas<LedgerRow>({
                    0: (_: unknown, row: LedgerRow) => <>{row.fechaLabel}</>,
                    1: (_: unknown, row: LedgerRow) =>
                      row.source === "obra" ? (
                        <Link href={`/project/${row.obraId}`}>{row.obraNombre} ↗</Link>
                      ) : (
                        <span className="text-body-secondary">General (sin obra)</span>
                      ),
                    2: (_: unknown, row: LedgerRow) =>
                      row.source === "obra" && row.obraTipo ? <CBadge color={TYPE_COLOR[row.obraTipo]}>{TYPE_LABEL[row.obraTipo]}</CBadge> : <>—</>,
                    4: (_: unknown, row: LedgerRow) => <>{row.categoria || "—"}</>,
                    5: (_: unknown, row: LedgerRow) =>
                      row.source === "obra" && row.contratistaId ? (
                        <Link href={`/contratistas/${row.contratistaId}`}>{row.contratistaProveedorLabel || "Ver contratista"} ↗</Link>
                      ) : (
                        <>{(row.source === "obra" && row.contratistaProveedorLabel) || "—"}</>
                      ),
                    6: (_: unknown, row: LedgerRow) =>
                      row.source === "general" ? (
                        <span style={{ color: row.ingresoEgreso === "egreso" ? "var(--crit)" : "var(--ok)" }}>
                          {`${row.ingresoEgreso === "egreso" ? "-" : "+"} ${fmtMoney(row.monto)}`}
                        </span>
                      ) : (
                        <>{fmtMoney(row.monto)}</>
                      ),
                    7: (_: unknown, row: LedgerRow) => <>{row.medioPago || "—"}</>,
                    8: (_: unknown, row: LedgerRow) =>
                      row.source === "obra" && esPendiente(row.estado) ? (
                        <span className="of-pendiente-tag"><Icon icon={HourglassMedium} size={14} weight="bold" />Pendiente · no suma</span>
                      ) : row.estado ? <span className={"status-chip status-generic status-" + row.estado.toLowerCase().replace(/\s+/g, "_")}>{row.estado}</span> : <></>,
                    9: (_: unknown, row: LedgerRow) => <>{row.procesadoPor || "—"}</>,
                    10: (_: unknown, row: LedgerRow) => <>{row.responsable || "—"}</>,
                    11: (_: unknown, row: LedgerRow) =>
                      row.source === "obra" ? (
                        row.attachment ? (
                          row.attachment.mimeType.startsWith("image/") ? (
                            <button type="button" className="of-thumb-btn" onClick={() => setVerComprobante(`/api/attachments/${row.attachment!.id}`)} title="Ver el comprobante en grande">
                              <img src={`/api/attachments/${row.attachment.id}`} alt={row.attachment.filename} className="item-receipt-thumb" />
                            </button>
                          ) : (
                            <a href={`/api/attachments/${row.attachment.id}`} target="_blank" rel="noopener noreferrer" className="d-inline-flex align-items-center gap-1">
                              <Icon icon={FilePdf} size={16} />{row.attachment.filename}
                            </a>
                          )
                        ) : row.comprobanteTexto ? (
                          /^https?:\/\//i.test(row.comprobanteTexto) ? (
                            <button type="button" className="of-thumb-btn" onClick={() => setVerComprobante(row.comprobanteTexto)} title="Ver el comprobante en grande">
                              <img src={row.comprobanteTexto} alt="Comprobante" className="item-receipt-thumb" />
                            </button>
                          ) : (
                            <span>{row.comprobanteTexto}</span>
                          )
                        ) : <>—</>
                      ) : (row.raw as GeneralMovementDTO).comprobanteMediaId ? (
                        // Comprobante recibido por WhatsApp (movimiento general cargado por el agente).
                        <a href={`/api/inbound-media/${(row.raw as GeneralMovementDTO).comprobanteMediaId}`} target="_blank" rel="noopener noreferrer" className="d-inline-flex align-items-center gap-1">
                          <Icon icon={FileText} size={16} />Ver
                        </a>
                      ) : <>—</>,
                    12: (_: unknown, row: LedgerRow) =>
                      row.source === "general" ? (
                        <div className="d-flex gap-1">
                          <CButton size="sm" color="secondary" variant="outline" title="Editar" onClick={() => { setEditingGeneral(row.raw as GeneralMovementDTO); setShowGeneralForm(true); }}>
                            <Icon icon={PencilSimple} size={16} label="Editar" />
                          </CButton>
                          <CButton size="sm" color="danger" variant="outline" title="Eliminar" onClick={() => deleteGeneral(row.raw as GeneralMovementDTO)}>
                            <Icon icon={Trash} size={16} label="Eliminar" />
                          </CButton>
                        </div>
                      ) : obraEditEnabled ? (
                        <div className="d-flex gap-1">
                          <CButton size="sm" color="secondary" variant="outline" title="Editar" onClick={() => { setEditingObraItem(row.raw as MovimientoDTO); setShowObraForm(true); }}>
                            <Icon icon={PencilSimple} size={16} label="Editar" />
                          </CButton>
                          <CButton size="sm" color="danger" variant="outline" title="Eliminar" onClick={() => deleteObraItem(row.raw as MovimientoDTO)}>
                            <Icon icon={Trash} size={16} label="Eliminar" />
                          </CButton>
                        </div>
                      ) : <></>,
                  })}
                />
                </div>
              )}
              <ImageViewer images={verComprobante ? [{ src: verComprobante, title: "Comprobante" }] : []} index={verComprobante ? 0 : null} onClose={() => setVerComprobante(null)} />
            </>
          )}
        </CCardBody>
      </CCard>
      )}

      {showGeneralForm && (
        <GeneralMovementFormModal
          editing={editingGeneral}
          existingResponsables={existingResponsables}
          onClose={() => { setShowGeneralForm(false); setEditingGeneral(null); }}
          onSaved={handleGeneralSaved}
        />
      )}

      {showObraForm && editingObraItem && (
        <ItemFormModal
          projectId={editingObraItem.projectId}
          kind="change_order"
          existing={editingObraItem}
          existingRubros={existingRubrosForObraEdit}
          showToast={(m) => notificar(m, "error")}
          onClose={() => { setShowObraForm(false); setEditingObraItem(null); }}
          onSaved={handleObraSaved}
        />
      )}
    </AppShell>
  );
}
