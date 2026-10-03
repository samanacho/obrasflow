"use client";

import DataTableBase from "datatables.net-react";
import DT, { type Config } from "datatables.net-bs5";
import "datatables.net-bs5/css";

// Tablas con orden, búsqueda y páginas (DataTables + Bootstrap 5), con los
// textos en español y el estilo de la app. Para listados largos de datos
// (movimientos, compras, inventario). Una lista corta no la necesita.
//
//   <DataTable data={rows} columns={[{ data: "fecha", title: "Fecha" }, ...]}
//              slots={{ acciones: (_, row) => <button ...>Editar</button> }} />
//
// `slots` dibuja celdas con componentes de React (botones, badges, links):
// la clave es el `name` de la columna o su número.

DataTableBase.use(DT);

export const DT_ES: Config["language"] = {
  search: "Buscar:",
  searchPlaceholder: "Escribí para filtrar…",
  lengthMenu: "Mostrar _MENU_",
  info: "_START_ a _END_ de _TOTAL_",
  infoEmpty: "Sin registros",
  infoFiltered: "(filtrado de _MAX_)",
  zeroRecords: "No hay coincidencias con la búsqueda",
  emptyTable: "Todavía no hay registros",
  loadingRecords: "Cargando…",
  processing: "Procesando…",
  paginate: { first: "Primera", last: "Última", next: "Siguiente", previous: "Anterior" },
  aria: { orderable: "Ordenar por esta columna", orderableReverse: "Invertir el orden" },
};

type Props = React.ComponentProps<typeof DataTableBase>;

type Celda<Row> = (data: any, row: Row) => React.ReactElement;

/**
 * Celdas dibujadas con React que igual ordenan y buscan por el dato crudo de
 * la columna (fecha ISO, monto numérico…). Sin esto DataTables ordena por el
 * HTML dibujado y el orden queda mal.
 *
 *   slots={celdas<Fila>({ 0: (_, row) => <>{row.fechaLabel}</> })}
 */
export function celdas<Row>(slots: Record<string | number, Celda<Row>>) {
  const out: Record<string | number, (data: any, type: string, row: Row) => any> = {};
  for (const [k, dibujar] of Object.entries(slots)) {
    // Nunca null: datatables.net-react mira el resultado y se rompe con null.
    out[k] = (data: any, type: string, row: Row) => (type === "display" ? dibujar(data, row) : data ?? "");
  }
  return out;
}

export default function DataTable({ options, className, ...rest }: Props) {
  return (
    <DataTableBase
      className={"table table-hover align-middle of-dtable" + (className ? " " + className : "")}
      options={{ language: DT_ES, pageLength: 25, lengthMenu: [10, 25, 50, 100], autoWidth: false, ...options }}
      {...rest}
    />
  );
}
