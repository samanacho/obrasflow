// Exportar la lista de obras (ya filtrada en pantalla) a Excel (.xlsx) o a
// PDF. El PDF se arma como una hoja de impresión limpia en un iframe oculto y
// se abre el diálogo de imprimir del navegador: ahí se elige "Guardar como PDF".

import type { ProjectDTO } from "@/lib/types";
import { dayjs, TZ } from "@/lib/dayjs";
import { budgetState, daysLeft, STATUS_LABEL, TYPE_LABEL } from "@/components/home/HomeWidgets";

const LIGHT_TEXT = { ok: "Bien", warn: "Atención", crit: "Pasado", none: "Sin presupuesto" } as const;

function typeText(p: ProjectDTO) {
  return p.type === "otro" && p.customType ? p.customType : TYPE_LABEL[p.type];
}

function stamp() {
  return dayjs().tz(TZ).format("YYYY-MM-DD");
}

export async function exportObrasXlsx(projects: ProjectDTO[], title = "Obras") {
  const writeXlsxFile = (await import("write-excel-file/browser")).default;
  const head = (value: string) => ({ value, fontWeight: "bold" as const, backgroundColor: "#E4EAF0" });
  const header = [
    "Obra", "Referencia", "Rubro", "Estado", "Ciudad", "Responsable", "Inicio", "Fin", "Días para el fin",
    "Presupuesto (Gs.)", "Ejecutado (Gs.)", "% ejecutado", "Saldo (Gs.)", "Semáforo", "Avance %",
  ].map(head);
  const rows = projects.map((p) => {
    const b = budgetState(p);
    return [
      { value: p.name },
      { value: p.reference ?? "" },
      { value: typeText(p) },
      { value: STATUS_LABEL[p.status] },
      { value: p.city ?? "" },
      { value: p.manager },
      { value: dayjs(p.start).toDate(), type: Date, format: "dd/mm/yyyy" },
      { value: dayjs(p.end).toDate(), type: Date, format: "dd/mm/yyyy" },
      { value: p.status === "finalizado" ? null : daysLeft(p.end), type: Number },
      { value: p.budget, type: Number, format: "#,##0" },
      { value: p.spent, type: Number, format: "#,##0" },
      { value: b.pct === null ? null : b.pct / 100, type: Number, format: "0%" },
      { value: p.budget - p.spent, type: Number, format: "#,##0" },
      { value: LIGHT_TEXT[b.light] },
      { value: Math.round(p.progress) / 100, type: Number, format: "0%" },
    ];
  });
  const totBudget = projects.reduce((a, p) => a + p.budget, 0);
  const totSpent = projects.reduce((a, p) => a + p.spent, 0);
  const total = [
    { value: `Total (${projects.length} obras)`, fontWeight: "bold" as const },
    ...Array(8).fill(null),
    { value: totBudget, type: Number, format: "#,##0", fontWeight: "bold" as const },
    { value: totSpent, type: Number, format: "#,##0", fontWeight: "bold" as const },
    { value: totBudget > 0 ? totSpent / totBudget : null, type: Number, format: "0%", fontWeight: "bold" as const },
    { value: totBudget - totSpent, type: Number, format: "#,##0", fontWeight: "bold" as const },
    null,
    null,
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await writeXlsxFile([header, ...rows, total] as any, {
    sheet: title.slice(0, 31),
    stickyRowsCount: 1,
    columns: [{ width: 34 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 18 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 11 }, { width: 16 }, { width: 14 }, { width: 10 }],
  }).toFile(`obrasflow-obras-${stamp()}.xlsx`);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const gs = (n: number) => "Gs. " + Math.round(n).toLocaleString("es-PY");

/** Hoja de impresión (A4 apaisado) con la lista y los totales; el usuario elige "Guardar como PDF". */
export function printObras(projects: ProjectDTO[], subtitle: string) {
  const totBudget = projects.reduce((a, p) => a + p.budget, 0);
  const totSpent = projects.reduce((a, p) => a + p.spent, 0);
  const dot = { ok: "#5f8362", warn: "#b0843a", crit: "#a0564d", none: "#b8b2a6" } as const;
  const rows = projects
    .map((p) => {
      const b = budgetState(p);
      const d = daysLeft(p.end);
      return `<tr>
        <td><span class="dot" style="background:${dot[b.light]}"></span>${esc(p.name)}${p.reference ? `<small> · ${esc(p.reference)}</small>` : ""}</td>
        <td>${esc(typeText(p))}</td>
        <td>${esc(STATUS_LABEL[p.status])}</td>
        <td>${dayjs(p.end).format("DD/MM/YYYY")}${p.status !== "finalizado" ? `<small class="${d < 0 ? "late" : ""}"> (${d < 0 ? `venció hace ${-d} d` : `${d} d`})</small>` : ""}</td>
        <td class="n">${gs(p.budget)}</td>
        <td class="n">${gs(p.spent)}</td>
        <td class="n">${b.pct === null ? "—" : `${b.pct}&nbsp;%`}</td>
        <td class="n">${Math.round(p.progress)}&nbsp;%</td>
      </tr>`;
    })
    .join("");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Obras — ObrasFlow</title>
  <style>
    @page{size:A4 landscape;margin:14mm;}
    body{font-family:"IBM Plex Sans",system-ui,"Segoe UI",sans-serif;color:#33312c;font-size:11px;margin:0;}
    h1{font-family:"Barlow Condensed",system-ui,sans-serif;font-size:22px;margin:0;}
    .sub{color:#75726a;margin:2px 0 12px;}
    .kpis{display:flex;gap:18px;margin-bottom:12px;}
    .kpis div{border:1px solid #e3ded3;border-radius:6px;padding:6px 10px;}
    .kpis b{display:block;font-size:14px;}
    table{width:100%;border-collapse:collapse;}
    th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:#75726a;border-bottom:1.5px solid #33312c;padding:5px 6px;}
    td{border-bottom:1px solid #e3ded3;padding:5px 6px;vertical-align:top;}
    td.n,th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
    tfoot td{font-weight:700;border-top:1.5px solid #33312c;border-bottom:0;}
    small{color:#75726a;} .late{color:#a0564d;font-weight:600;}
    .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .foot{margin-top:10px;color:#75726a;font-size:9px;}
  </style></head><body>
  <h1>Obras</h1>
  <p class="sub">${esc(subtitle)} · ${dayjs().tz(TZ).format("dddd D [de] MMMM YYYY, HH:mm")}</p>
  <div class="kpis">
    <div>Obras<b>${projects.length}</b></div>
    <div>Presupuesto<b>${gs(totBudget)}</b></div>
    <div>Ejecutado<b>${gs(totSpent)}${totBudget > 0 ? ` (${Math.round((totSpent / totBudget) * 100)}&nbsp;%)` : ""}</b></div>
    <div>Saldo<b>${gs(totBudget - totSpent)}</b></div>
  </div>
  <table>
    <thead><tr><th>Obra</th><th>Rubro</th><th>Estado</th><th>Fin</th><th class="n">Presupuesto</th><th class="n">Ejecutado</th><th class="n">% ejec.</th><th class="n">Avance</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="4">Total</td><td class="n">${gs(totBudget)}</td><td class="n">${gs(totSpent)}</td><td class="n">${totBudget > 0 ? `${Math.round((totSpent / totBudget) * 100)}&nbsp;%` : "—"}</td><td></td></tr></tfoot>
  </table>
  <p class="foot">Semáforo: verde hasta 80 % del presupuesto, amarillo hasta 100 %, rojo pasado. Generado por ObrasFlow.</p>
  </body></html>`;

  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  }, 250);
}
