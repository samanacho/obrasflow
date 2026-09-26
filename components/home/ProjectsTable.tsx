"use client";

// Pestaña "Tabla" de Proyectos con TanStack Table v8: ordenar tocando el
// encabezado, buscar, filtrar por estado y rubro, totales al pie y exportar
// lo que se ve a Excel o PDF.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type FilterFn,
  type SortingState,
} from "@tanstack/react-table";
import type { ProjectDTO, ProjectStatus, ProjectType } from "@/lib/types";
import { exportObrasXlsx, printObras } from "@/lib/ui/exportObras";
import { budgetState, daysLeft, fmtGs, fmtGsShort, STATUS_LABEL, TYPE_LABEL } from "./HomeWidgets";
import QuickActions from "./QuickActions";

const col = createColumnHelper<ProjectDTO>();
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const LIGHT_RANK = { crit: 0, warn: 1, ok: 2, none: 3 } as const;

const textFilter: FilterFn<ProjectDTO> = (row, _id, value: string) => {
  const p = row.original;
  const hay = norm([p.name, p.reference ?? "", p.manager, p.city ?? "", p.sitioNombre ?? ""].join(" "));
  return norm(value)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
};

export default function ProjectsTable({
  projects,
  onEdit,
  onDelete,
  onUpdated,
  onSpentChanged,
}: {
  projects: ProjectDTO[];
  onEdit: (p: ProjectDTO) => void;
  onDelete: (p: ProjectDTO) => void;
  onUpdated: (p: ProjectDTO) => void;
  onSpentChanged: () => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "semaforo", desc: false }]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "">("");
  const [type, setType] = useState<ProjectType | "">("");
  const [actionsFor, setActionsFor] = useState<string | null>(null);

  const data = useMemo(() => projects.filter((p) => (!status || p.status === status) && (!type || p.type === type)), [projects, status, type]);

  const columns = useMemo(
    () => [
      col.accessor((p) => {
        const b = budgetState(p);
        const late = daysLeft(p.end) < 0 && p.status !== "finalizado";
        return Math.min(LIGHT_RANK[b.light], late ? 0 : 3);
      }, {
        id: "semaforo",
        header: "",
        cell: (c) => {
          const p = c.row.original;
          const b = budgetState(p);
          const late = daysLeft(p.end) < 0 && p.status !== "finalizado";
          return <span className={`home-obra-light is-${late && b.light !== "crit" ? "crit" : b.light}`} title="Semáforo" />;
        },
        size: 28,
      }),
      col.accessor("name", {
        header: "Obra",
        cell: (c) => (
          <Link href={`/project/${c.row.original.id}`} className="fw-semibold">
            {c.getValue()}
            {c.row.original.reference && <span className="text-body-secondary fw-normal"> · {c.row.original.reference}</span>}
          </Link>
        ),
        sortingFn: (a, b) => a.original.name.localeCompare(b.original.name, "es"),
      }),
      col.accessor((p) => (p.type === "otro" && p.customType ? p.customType : TYPE_LABEL[p.type]), {
        id: "rubro",
        header: "Rubro",
        cell: (c) => <span className={`home-type t-${c.row.original.type}`}>{c.getValue()}</span>,
      }),
      col.accessor((p) => STATUS_LABEL[p.status], { id: "estado", header: "Estado" }),
      col.accessor("manager", { header: "Responsable" }),
      col.accessor((p) => (p.status === "finalizado" ? 99999 : daysLeft(p.end)), {
        id: "fin",
        header: "Fin",
        cell: (c) => {
          const p = c.row.original;
          const d = daysLeft(p.end);
          const [y, m, day] = p.end.split("-");
          return (
            <span className="text-nowrap">
              {day}/{m}/{y}
              {p.status !== "finalizado" && (
                <span className={`ms-1 small ${d < 0 ? "tone-crit fw-semibold" : d <= 7 ? "tone-warn fw-semibold" : "text-body-secondary"}`}>
                  {d < 0 ? `(−${-d} d)` : `(${d} d)`}
                </span>
              )}
            </span>
          );
        },
      }),
      col.accessor("budget", {
        header: "Presupuesto",
        cell: (c) => <span title={fmtGs(c.getValue())}>{fmtGsShort(c.getValue())}</span>,
        meta: { num: true },
      }),
      col.accessor("spent", {
        header: "Ejecutado",
        cell: (c) => <span title={fmtGs(c.getValue())}>{fmtGsShort(c.getValue())}</span>,
        meta: { num: true },
      }),
      col.accessor((p) => budgetState(p).pct ?? -1, {
        id: "pct",
        header: "% ejec.",
        cell: (c) => {
          const b = budgetState(c.row.original);
          return <strong className={`tone-${b.light}`}>{b.pct === null ? "—" : `${b.pct} %`}</strong>;
        },
        meta: { num: true },
      }),
      col.accessor("progress", {
        header: "Avance",
        cell: (c) => (
          <span className="d-inline-flex align-items-center gap-2" style={{ minWidth: 90 }}>
            <span className="home-bar sm flex-grow-1" aria-hidden="true">
              <span className="fill is-accent" style={{ width: `${Math.min(100, Math.round(c.getValue()))}%` }} />
            </span>
            <span className="text-nowrap">{Math.round(c.getValue())}&nbsp;%</span>
          </span>
        ),
        meta: { num: true },
      }),
      col.display({
        id: "acciones",
        header: "",
        cell: (c) => (
          <span className="d-inline-flex gap-1">
            <button type="button" className="home-tool sm" title="Acciones rápidas" onClick={() => setActionsFor(c.row.original.id)}>
              ⋯
            </button>
            <button type="button" className="home-tool sm" title="Editar datos de la obra" onClick={() => onEdit(c.row.original)}>
              ✎
            </button>
            <button type="button" className="home-tool sm is-danger" title="Eliminar" onClick={() => onDelete(c.row.original)}>
              🗑
            </button>
          </span>
        ),
      }),
    ],
    [onEdit, onDelete]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    globalFilterFn: textFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const visible = table.getRowModel().rows.map((r) => r.original);
  const totBudget = visible.reduce((a, p) => a + p.budget, 0);
  const totSpent = visible.reduce((a, p) => a + p.spent, 0);
  const totPct = totBudget > 0 ? Math.round((totSpent / totBudget) * 100) : null;
  const avgProgress = visible.length ? Math.round(visible.reduce((a, p) => a + p.progress, 0) / visible.length) : 0;
  const types = (["civil", "electrico", "vial", "otro"] as ProjectType[]).filter((t) => projects.some((p) => p.type === t));
  const label = [status ? STATUS_LABEL[status] : "Todos los estados", type ? TYPE_LABEL[type] : null, search.trim() ? `"${search.trim()}"` : null].filter(Boolean).join(" · ");
  const selected = actionsFor ? projects.find((p) => p.id === actionsFor) ?? null : null;

  return (
    <section className="home-obras mb-0">
      <div className="home-obras-head">
        <h2 className="home-h2">Todas las obras</h2>
        <div className="home-obras-tools">
          <button type="button" className="home-tool" disabled={!visible.length} onClick={() => exportObrasXlsx(visible)}>
            ⬇ Excel
          </button>
          <button type="button" className="home-tool" disabled={!visible.length} onClick={() => printObras(visible, label)}>
            🖨 PDF
          </button>
        </div>
      </div>
      <div className="home-filters">
        <input className="form-control form-control-sm" style={{ maxWidth: 320 }} type="search" placeholder="Buscar por obra, referencia, responsable, ciudad…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar" />
        <div className="home-filters-right">
          <select className="form-select form-select-sm" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | "")} aria-label="Estado">
            <option value="">Todos los estados</option>
            {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {types.length > 1 && (
            <select className="form-select form-select-sm" value={type} onChange={(e) => setType(e.target.value as ProjectType | "")} aria-label="Rubro">
              <option value="">Todos los rubros</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="table-responsive">
        <table className="table align-middle of-ptable mb-0">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const canSort = h.column.getCanSort() && h.column.id !== "acciones";
                  const num = (h.column.columnDef.meta as { num?: boolean } | undefined)?.num;
                  return (
                    <th key={h.id} className={num ? "text-end" : undefined} style={h.column.id === "semaforo" ? { width: 28 } : undefined}>
                      {canSort ? (
                        <button type="button" className={`of-th-sort${sorted ? " on" : ""}`} onClick={h.column.getToggleSortingHandler()} title="Ordenar">
                          {flexRender(h.column.columnDef.header, h.getContext()) || (h.column.id === "semaforo" ? "●" : "")}
                          <span className="arr" aria-hidden="true">
                            {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
                          </span>
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="empty-col">
                  {projects.length === 0 ? "Sin proyectos todavía." : "Ninguna obra coincide con el filtro."}
                </td>
              </tr>
            )}
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id}>
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className={(c.column.columnDef.meta as { num?: boolean } | undefined)?.num ? "text-end" : undefined}>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {visible.length > 0 && (
            <tfoot>
              <tr>
                <td />
                <td colSpan={5}>
                  Total · {visible.length} obra{visible.length === 1 ? "" : "s"}
                </td>
                <td className="text-end" title={fmtGs(totBudget)}>
                  {fmtGsShort(totBudget)}
                </td>
                <td className="text-end" title={fmtGs(totSpent)}>
                  {fmtGsShort(totSpent)}
                </td>
                <td className="text-end">{totPct === null ? "—" : `${totPct} %`}</td>
                <td className="text-end">prom. {avgProgress}&nbsp;%</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <QuickActions project={selected} onClose={() => setActionsFor(null)} onUpdated={onUpdated} onSpentChanged={onSpentChanged} />
    </section>
  );
}
