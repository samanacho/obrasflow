import { prisma } from "../prisma";
import { MOVIMIENTO_TIPOS } from "../movimientos";
import { fmtYmd } from "../dates";
import { normalizeText } from "./format";

// Consultas de SOLO LECTURA que el agente de WhatsApp puede hacer (ver
// lib/agent/tools.ts). Devuelven objetos chicos y planos: el modelo los
// recibe como JSON, y cuanto más compactos, más barato y preciso.
//
// Deliberadamente NO hay consulta del reparto de beneficios de Personal:
// ese módulo está detrás de un PIN en la app, y el agente no debería ser
// una forma de saltearlo.

const EFFECT = new Map<string, string>(MOVIMIENTO_TIPOS.map((t) => [t.value, t.effect]));

const ESTADO_LABEL: Record<string, string> = {
  planificado: "Planificado",
  en_curso: "En curso",
  pausado: "Pausado",
  finalizado: "Finalizado",
};
const TYPE_LABEL: Record<string, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function obraLabel(p: { name: string; reference: string | null; sitio?: { nombre: string } | null }) {
  return `${p.name}${p.reference ? ` (REF: ${p.reference})` : ""}${p.sitio ? ` · Sitio ${p.sitio.nombre}` : ""}`;
}

/** Busca obras (y sitios) por texto libre: nombre, referencia, sitio, ciudad o responsable. */
export async function buscarObras(texto: string, incluirFinalizadas: boolean) {
  const q = normalizeText(texto);
  const projects = await prisma.project.findMany({
    include: { sitio: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: "desc" },
  });
  const matches = projects.filter((p) => {
    if (!incluirFinalizadas && p.status === "finalizado" && q === "") return false;
    if (!q) return true;
    const hay = normalizeText(
      [p.name, p.reference ?? "", p.sitio?.nombre ?? "", p.city ?? "", p.manager, TYPE_LABEL[p.type] ?? p.type].join(" ")
    );
    // Todas las palabras de la búsqueda tienen que aparecer ("congreso electrico").
    return q.split(" ").every((w) => hay.includes(w));
  });

  const sitios = await prisma.sitio.findMany({ select: { id: true, nombre: true } });
  const sitiosMatch = q ? sitios.filter((s) => q.split(" ").every((w) => normalizeText(s.nombre).includes(w))) : [];

  return {
    totalEncontradas: matches.length,
    obras: matches.slice(0, 15).map((p) => ({
      obraId: p.id,
      nombre: p.name,
      referencia: p.reference,
      sitio: p.sitio?.nombre ?? null,
      sitioId: p.sitio?.id ?? null,
      rubro: TYPE_LABEL[p.type] ?? p.type,
      estado: ESTADO_LABEL[p.status] ?? p.status,
      ciudad: p.city,
      responsable: p.manager,
      presupuesto: num(p.budget),
      ejecutado: num(p.spent),
    })),
    sitios: sitiosMatch.map((s) => ({ sitioId: s.id, nombre: s.nombre })),
    nota: matches.length > 15 ? "Hay más resultados: pedile al usuario que sea más específico." : undefined,
  };
}

/** Detalle de una obra: números, rubros ya cargados (para reusar el nombre) y últimos movimientos. */
export async function verObra(obraId: string) {
  const p = await prisma.project.findUnique({
    where: { id: obraId },
    include: { sitio: { select: { id: true, nombre: true } } },
  });
  if (!p) throw new Error(`No existe una obra con id "${obraId}". Buscala primero con buscar_obras.`);

  const items = await prisma.projectItem.findMany({
    where: { projectId: obraId, kind: "change_order" },
    orderBy: { createdAt: "desc" },
  });
  const budget = num(p.budget);
  const spent = num(p.spent);
  const adelantado = items
    .filter((i) => (i.data as any)?.tipo === "Adelanto")
    .reduce((s, i) => s + num((i.data as any)?.monto), 0);
  const rubros = Array.from(new Set(items.map((i) => i.title.trim()).filter(Boolean))).sort();

  const ultimos = items
    .slice()
    .sort((a, b) => String((b.data as any)?.fecha ?? "").localeCompare(String((a.data as any)?.fecha ?? "")))
    .slice(0, 10)
    .map((i) => {
      const d = (i.data as any) ?? {};
      return {
        fecha: d.fecha ? fmtYmd(String(d.fecha)) : null,
        rubro: i.title,
        tipo: d.tipo ?? null,
        tipoInsumo: d.tipoInsumo ?? null,
        monto: num(d.monto),
        proveedor: d.proveedorNombre || d.contratistaNombre || null,
        medioPago: d.medioPago ?? null,
        estado: i.status,
      };
    });

  return {
    obraId: p.id,
    nombre: obraLabel(p),
    rubro: TYPE_LABEL[p.type] ?? p.type,
    estado: ESTADO_LABEL[p.status] ?? p.status,
    ciudad: p.city,
    responsable: p.manager,
    fechaInicio: fmtYmd(p.start.toISOString().slice(0, 10)),
    fechaFin: fmtYmd(p.end.toISOString().slice(0, 10)),
    presupuesto: budget,
    ejecutado: spent,
    saldoDisponible: budget - spent,
    porcentajeEjecutado: budget > 0 ? Math.round((spent / budget) * 100) : null,
    avisoPresupuesto: budget <= 0 && spent > 0 ? "La obra no tiene presupuesto cargado pero ya tiene gastos." : undefined,
    adelantado,
    cantidadMovimientos: items.length,
    rubrosYaCargados: rubros,
    ultimosMovimientos: ultimos,
    sitio: p.sitio ? { sitioId: p.sitio.id, nombre: p.sitio.nombre } : null,
  };
}

/** Totales de un Sitio (varios frentes de un mismo lugar, ej. civil + eléctrico). */
export async function verSitio(sitioId: string) {
  const s = await prisma.sitio.findUnique({ where: { id: sitioId }, include: { projects: true } });
  if (!s) throw new Error(`No existe un sitio con id "${sitioId}".`);
  const frentes = s.projects.map((p) => ({
    obraId: p.id,
    nombre: p.name,
    rubro: TYPE_LABEL[p.type] ?? p.type,
    estado: ESTADO_LABEL[p.status] ?? p.status,
    presupuesto: num(p.budget),
    ejecutado: num(p.spent),
  }));
  const presupuesto = frentes.reduce((a, f) => a + f.presupuesto, 0);
  const ejecutado = frentes.reduce((a, f) => a + f.ejecutado, 0);
  return { sitioId: s.id, nombre: s.nombre, responsable: s.responsable, presupuesto, ejecutado, saldoDisponible: presupuesto - ejecutado, frentes };
}

/** Panorama general de la empresa — mismos números que la pantalla de Inicio. */
export async function resumenGeneral() {
  const [projects, generales, pendientes] = await Promise.all([
    prisma.project.findMany({ select: { name: true, reference: true, status: true, budget: true, spent: true } }),
    prisma.generalMovement.findMany({ select: { tipo: true, monto: true } }),
    prisma.quickExpense.count({ where: { resuelto: false } }),
  ]);
  const presupuestoTotal = projects.reduce((a, p) => a + num(p.budget), 0);
  const ejecutadoTotal = projects.reduce((a, p) => a + num(p.spent), 0);
  const ingresosGenerales = generales.filter((g) => g.tipo === "ingreso").reduce((a, g) => a + num(g.monto), 0);
  const egresosGenerales = generales.filter((g) => g.tipo === "egreso").reduce((a, g) => a + num(g.monto), 0);
  const porEstado: Record<string, number> = {};
  for (const p of projects) porEstado[ESTADO_LABEL[p.status] ?? p.status] = (porEstado[ESTADO_LABEL[p.status] ?? p.status] ?? 0) + 1;

  return {
    cantidadObras: projects.length,
    obrasPorEstado: porEstado,
    presupuestoTotal,
    ejecutadoTotal,
    ingresosGeneralesSinObra: ingresosGenerales,
    egresosGeneralesSinObra: egresosGenerales,
    // Misma fórmula que la KPI "Costos vs. beneficios" de Inicio (app/page.tsx).
    costosVsBeneficios: presupuestoTotal - ejecutadoTotal + ingresosGenerales - egresosGenerales,
    obrasSobrePresupuesto: projects
      .filter((p) => num(p.spent) > num(p.budget))
      .map((p) => ({ obra: `${p.name}${p.reference ? ` (REF: ${p.reference})` : ""}`, presupuesto: num(p.budget), ejecutado: num(p.spent) })),
    registrosRapidosSinClasificar: pendientes,
  };
}

/** Movimientos recientes: de una obra, de un sitio, o de toda la empresa (incluyendo los generales sin obra). */
export async function listarMovimientos(opts: {
  obraId?: string;
  sitioId?: string;
  desde?: string;
  hasta?: string;
  limite: number;
  incluirGenerales: boolean;
}) {
  let projectIds: string[] | undefined;
  if (opts.obraId) projectIds = [opts.obraId];
  else if (opts.sitioId) {
    const ps = await prisma.project.findMany({ where: { sitioId: opts.sitioId }, select: { id: true } });
    projectIds = ps.map((p) => p.id);
  }

  const items = await prisma.projectItem.findMany({
    where: { kind: "change_order", ...(projectIds ? { projectId: { in: projectIds } } : {}) },
    include: { project: { select: { name: true, reference: true } } },
  });

  type Row = { fecha: string; obra: string; concepto: string; tipo: string | null; monto: number; medioPago: string | null; estado: string | null; proveedor: string | null; efecto: string };
  const rows: Row[] = items.map((i) => {
    const d = (i.data as any) ?? {};
    return {
      fecha: String(d.fecha || i.createdAt.toISOString()).slice(0, 10),
      obra: `${i.project.name}${i.project.reference ? ` (REF: ${i.project.reference})` : ""}`,
      concepto: i.title,
      tipo: d.tipo ?? null,
      monto: num(d.monto),
      medioPago: d.medioPago ?? null,
      estado: i.status,
      proveedor: d.proveedorNombre || d.contratistaNombre || null,
      efecto: EFFECT.get(String(d.tipo ?? "")) === "subtract" ? "resta" : EFFECT.get(String(d.tipo ?? "")) === "none" ? "no suma al ejecutado" : "suma al ejecutado",
    };
  });

  if (opts.incluirGenerales && !projectIds) {
    const gens = await prisma.generalMovement.findMany();
    for (const g of gens) {
      rows.push({
        fecha: g.fecha.toISOString().slice(0, 10),
        obra: "General (sin obra)",
        concepto: g.concepto,
        tipo: g.tipo === "ingreso" ? "Ingreso general" : "Egreso general",
        monto: num(g.monto),
        medioPago: g.medioPago,
        estado: g.estado,
        proveedor: null,
        efecto: g.tipo,
      });
    }
  }

  const filtered = rows
    .filter((r) => (!opts.desde || r.fecha >= opts.desde) && (!opts.hasta || r.fecha <= opts.hasta))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Totales separados por efecto — sumar todo junto mezclaría gastos con
  // órdenes de cambio, devoluciones e ingresos. gastoNeto usa el mismo
  // criterio que el Ejecutado de la ficha (lib/spent.ts).
  const sum = (pred: (r: Row) => boolean) => filtered.filter(pred).reduce((a, r) => a + r.monto, 0);
  const eff = (r: Row) => EFFECT.get(String(r.tipo ?? ""));
  const obraRow = (r: Row) => r.efecto !== "ingreso" && r.efecto !== "egreso";
  const porTipo: Record<string, number> = {};
  for (const r of filtered) porTipo[r.tipo ?? "Sin tipo"] = (porTipo[r.tipo ?? "Sin tipo"] ?? 0) + r.monto;

  return {
    cantidad: filtered.length,
    totales: {
      gastoNetoDeObras: sum((r) => obraRow(r) && eff(r) === "add") - sum((r) => obraRow(r) && eff(r) === "subtract"),
      noSumanAlEjecutado: sum((r) => obraRow(r) && eff(r) === "none"),
      ...(opts.incluirGenerales && !projectIds
        ? { ingresosGenerales: sum((r) => r.efecto === "ingreso"), egresosGenerales: sum((r) => r.efecto === "egreso") }
        : {}),
      porTipo,
    },
    movimientos: filtered.slice(0, opts.limite).map((r) => ({ ...r, fecha: fmtYmd(r.fecha) })),
    nota: filtered.length > opts.limite ? `Se muestran los ${opts.limite} más recientes de ${filtered.length}; los totales cubren todos.` : undefined,
  };
}

export async function buscarProveedores(texto: string) {
  const q = normalizeText(texto);
  const all = await prisma.supplier.findMany({ where: { status: "activo" }, orderBy: { name: "asc" } });
  return all
    .filter((s) => !q || normalizeText(`${s.name} ${s.contactName ?? ""} ${s.city ?? ""}`).includes(q))
    .slice(0, 15)
    .map((s) => ({ proveedorId: s.id, nombre: s.name, categorias: s.categories, ciudad: s.city, contacto: s.contactName }));
}

export async function buscarContratistas(texto: string) {
  const q = normalizeText(texto);
  const all = await prisma.contractor.findMany({ where: { status: "activo" }, orderBy: { name: "asc" } });
  return all
    .filter((c) => !q || normalizeText(`${c.name} ${c.contactName ?? ""} ${c.city ?? ""}`).includes(q))
    .slice(0, 15)
    .map((c) => ({ contratistaId: c.id, nombre: c.name, encargado: c.contactName, rubros: c.rubros, ciudad: c.city }));
}

/** Capturas del Registro rápido que todavía no se clasificaron (ver /registro-rapido). */
export async function registrosRapidosPendientes() {
  const items = await prisma.quickExpense.findMany({ where: { resuelto: false }, orderBy: { fecha: "desc" }, take: 30 });
  return items.map((q) => ({
    registroRapidoId: q.id,
    fecha: fmtYmd(q.fecha.toISOString().slice(0, 10)),
    monto: num(q.monto),
    medioPago: q.medioPago,
    nota: q.nota,
    conComprobante: Boolean(q.comprobanteMediaId),
  }));
}
