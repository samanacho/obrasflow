// Configuración declarativa de los módulos secundarios de un proyecto.
// Cada "kind" comparte el mismo modelo (ProjectItem) y el mismo patrón de
// lista + formulario en el frontend; lo único que cambia es esta config.

import { MOVIMIENTO_TIPOS } from "./movimientos";

export type FieldType = "text" | "textarea" | "number" | "date" | "contractor" | "quote" | "select" | "location";

export interface ItemField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  /** Solo para type "select". */
  options?: string[];
}

export interface ItemKindConfig {
  key: string;
  label: string;
  singular: string;
  icon: string;
  description: string;
  titleLabel: string;
  statusOptions: string[] | null;
  defaultStatus?: string;
  fields: ItemField[];
  /** Cómo armar el subtítulo de una fila en la lista, a partir de `data`. */
  summary: (data: Record<string, any>) => string;
  readOnly?: boolean;
}

export const ITEM_KINDS: Record<string, ItemKindConfig> = {
  // La clave interna sigue siendo "rfi" (así no se pierde lo ya cargado en
  // producción bajo ese kind) aunque ahora representa el módulo de
  // Relevamiento — el paso de campo previo a la cotización.
  rfi: {
    key: "rfi",
    label: "Relevamiento",
    singular: "relevamiento",
    icon: "📐",
    description: "Información de campo previa a la obra: ubicación, mediciones y condiciones del terreno.",
    titleLabel: "Nombre / zona del relevamiento",
    statusOptions: ["Pendiente", "En proceso", "Completado"],
    defaultStatus: "Pendiente",
    fields: [
      { key: "ubicacion", label: "Ubicación / dirección del sitio", type: "text" },
      { key: "coordenadas", label: "Ubicación en el mapa (opcional)", type: "location" },
      { key: "area", label: "Superficie del terreno (m²)", type: "number" },
      {
        key: "tipoSuelo",
        label: "Tipo de suelo",
        type: "select",
        options: ["Arcilloso", "Arenoso", "Rocoso", "Limoso", "Mixto", "No determinado"],
      },
      { key: "accesos", label: "Accesos y servicios disponibles (agua, luz, caminos...)", type: "textarea" },
      { key: "mediciones", label: "Mediciones / cantidades estimadas", type: "textarea" },
      { key: "observaciones", label: "Observaciones técnicas y condiciones del terreno", type: "textarea" },
      { key: "responsable", label: "Responsable del relevamiento", type: "text" },
    ],
    summary: (d) => [d.ubicacion, d.tipoSuelo, d.responsable].filter(Boolean).join(" · "),
  },
  cotizacion: {
    key: "cotizacion",
    label: "Cotización",
    singular: "cotización",
    icon: "💰",
    description: "Cotizaciones de distintos contratistas para comparar y elegir la más conveniente.",
    titleLabel: "Título de la cotización",
    statusOptions: ["Pendiente", "Seleccionada", "Descartada"],
    defaultStatus: "Pendiente",
    fields: [
      { key: "contratistaId", label: "Contratista", type: "contractor", required: true },
      { key: "monto", label: "Monto cotizado (Gs.)", type: "number", required: true },
      { key: "notas", label: "Notas", type: "textarea" },
    ],
    summary: (d) => [d.contratistaNombre, d.monto ? `Gs. ${Number(d.monto).toLocaleString("es-PY")}` : ""].filter(Boolean).join(" · "),
  },
  contratista: {
    key: "contratista",
    label: "Contratistas",
    singular: "contratista",
    icon: "🧰",
    description: "Contratistas con los que se está trabajando en esta obra, por rubro — cada uno linkea a su ficha completa en el directorio.",
    titleLabel: "Tarea o alcance en esta obra",
    statusOptions: ["Activo", "Finalizado"],
    defaultStatus: "Activo",
    fields: [
      { key: "contratistaId", label: "Contratista", type: "contractor", required: true },
      { key: "rubro", label: "Rubro en esta obra", type: "select", options: ["Civil", "Eléctrico", "Vial", "Otro"], required: true },
      { key: "notas", label: "Notas", type: "textarea" },
    ],
    summary: (d) => d.rubro ?? "",
  },
  // La clave interna sigue siendo "daily_log" (sin migración) aunque ahora
  // representa el Parte Diario — más amplio que la bitácora original:
  // cualquier dato, aviso, alerta o pendiente que deba quedar registrado
  // ese día, no solo avance/clima. Ver ModuleView en app/project/[id]/
  // page.tsx: acá se abre el formulario solo al entrar a la pestaña y se
  // precarga con la fecha de hoy.
  daily_log: {
    key: "daily_log",
    label: "Parte Diario",
    singular: "registro",
    icon: "📋",
    description: "Cualquier dato, aviso, alerta o pendiente que deba quedar registrado ese día — no solo avance y clima.",
    titleLabel: "Título del registro",
    statusOptions: ["Abierto", "Resuelto"],
    defaultStatus: "Abierto",
    fields: [
      { key: "fecha", label: "Fecha", type: "date", required: true },
      {
        key: "tipo",
        label: "Tipo de registro",
        type: "select",
        required: true,
        options: ["Dato", "Aviso", "Alerta", "Pendiente", "Relevante"],
      },
      { key: "clima", label: "Clima (opcional)", type: "text" },
      { key: "personal", label: "Personal en sitio (opcional)", type: "text" },
      { key: "notas", label: "Detalle", type: "textarea" },
    ],
    summary: (d) => [d.tipo, d.fecha, d.clima].filter(Boolean).join(" · "),
  },
  // La clave interna sigue siendo "change_order" (así no se pierde lo ya
  // cargado en producción bajo ese kind) aunque ahora representa el
  // ledger financiero de la obra: gastos, adelantos, pagos a contratistas
  // y demás movimientos de plata — el propio concepto de "orden de
  // cambio" (impacto en presupuesto) queda como un tipo más dentro de
  // este mismo listado, en vez de un módulo aparte. La pestaña se llama
  // "Ejecución" (antes "Movimientos"); cada registro individual sigue
  // siendo un "movimiento" — mismo patrón que "activity" (label
  // "Actividad", singular "evento").
  change_order: {
    key: "change_order",
    label: "Ejecución",
    singular: "movimiento",
    icon: "💸",
    description: "Gastos, adelantos, pagos a contratistas y demás movimientos de plata de la obra — el Ejecutado de la ficha se calcula solo a partir de esto.",
    titleLabel: "Descripción del movimiento",
    statusOptions: ["Pendiente", "Pagado", "Conciliado"],
    defaultStatus: "Pendiente",
    fields: [
      { key: "tipo", label: "Tipo de movimiento", type: "select", required: true, options: MOVIMIENTO_TIPOS.map((t) => t.value) },
      { key: "monto", label: "Monto (Gs.)", type: "number", required: true },
      { key: "fecha", label: "Fecha del movimiento", type: "date", required: true },
      { key: "contratistaId", label: "Contratista (opcional)", type: "contractor" },
      { key: "cotizacionId", label: "Cotización vinculada (opcional)", type: "quote" },
      { key: "categoria", label: "Categoría", type: "select", options: ["Materiales y equipos", "Otro"] },
      { key: "medioPago", label: "Medio de pago", type: "select", options: ["Efectivo", "Transferencia", "Cheque", "Tarjeta"] },
      { key: "comprobante", label: "N° de factura/recibo, o link a una foto del comprobante", type: "text" },
      { key: "notas", label: "Notas", type: "textarea" },
    ],
    summary: (d) => [d.tipo, d.monto ? `Gs. ${Number(d.monto).toLocaleString("es-PY")}` : "", d.contratistaNombre].filter(Boolean).join(" · "),
  },
  // La clave interna sigue siendo "team" (sin migración, ProjectItem.kind
  // es String libre) aunque ahora representa el registro de maquinarias
  // de la obra en vez del equipo de personas. El campo "contratistaId"
  // reutiliza a propósito el mismo nombre de key que usan Ejecución/
  // Cotización/Contratistas: así el link "Ver ficha del contratista ↗"
  // que ya renderiza ModuleView para esa key aparece acá también, sin
  // código nuevo.
  team: {
    key: "team",
    label: "Maquinarias",
    singular: "maquinaria",
    icon: "🚜",
    description: "Maquinarias y equipos usados en la obra — propios, alquilados o de servicios tercerizados, con proveedor y costo asociado.",
    titleLabel: "Nombre / identificación de la maquinaria",
    statusOptions: ["Operativa", "En mantenimiento", "Fuera de servicio", "Devuelta"],
    defaultStatus: "Operativa",
    fields: [
      { key: "modalidad", label: "Modalidad", type: "select", required: true, options: ["Propia", "Alquilada", "Servicio tercerizado"] },
      {
        key: "tipoMaquinaria",
        label: "Tipo de maquinaria",
        type: "select",
        required: true,
        options: ["Excavadora", "Retroexcavadora", "Grúa", "Compactadora", "Camión volcador", "Motoniveladora", "Hormigonera", "Generador", "Andamio", "Herramienta menor", "Otro"],
      },
      { key: "marcaModelo", label: "Marca / modelo", type: "text" },
      { key: "patente", label: "Patente / N° de serie (opcional)", type: "text" },
      { key: "contratistaId", label: "Proveedor / contratista (si es alquilada o tercerizada)", type: "contractor" },
      { key: "costo", label: "Costo (Gs.) — alquiler, contrato o valor de compra", type: "number" },
      { key: "fechaInicio", label: "Fecha de inicio de uso", type: "date" },
      { key: "fechaFin", label: "Fecha de fin / devolución (opcional)", type: "date" },
      { key: "operador", label: "Operador asignado", type: "text" },
      { key: "notas", label: "Notas", type: "textarea" },
    ],
    summary: (d) =>
      [d.tipoMaquinaria, d.modalidad, d.contratistaNombre, d.costo ? `Gs. ${Number(d.costo).toLocaleString("es-PY")}` : ""]
        .filter(Boolean)
        .join(" · "),
  },
  checklist: {
    key: "checklist",
    label: "Checklist de seguridad",
    singular: "ítem",
    icon: "✅",
    description: "Inspecciones y controles de seguridad del sitio.",
    titleLabel: "Ítem a verificar",
    statusOptions: ["Pendiente", "Cumplido", "No aplica"],
    defaultStatus: "Pendiente",
    fields: [{ key: "categoria", label: "Categoría", type: "text" }],
    summary: (d) => d.categoria || "",
  },
  milestone: {
    key: "milestone",
    label: "Hitos",
    singular: "hito",
    icon: "🚩",
    description: "Fechas clave del proyecto, visibles también en el cronograma.",
    titleLabel: "Nombre del hito",
    statusOptions: ["Pendiente", "Cumplido"],
    defaultStatus: "Pendiente",
    fields: [{ key: "fecha", label: "Fecha", type: "date", required: true }],
    summary: (d) => d.fecha || "",
  },
  document: {
    key: "document",
    label: "Documentos",
    singular: "documento",
    icon: "📎",
    description: "Enlaces a planos, contratos y archivos del proyecto.",
    titleLabel: "Nombre del documento",
    statusOptions: null,
    fields: [
      { key: "url", label: "URL", type: "text", required: true },
      { key: "tipo", label: "Tipo (plano, contrato, permiso...)", type: "text" },
    ],
    summary: (d) => d.tipo || "",
  },
  photo: {
    key: "photo",
    label: "Fotos de avance",
    singular: "foto",
    icon: "📷",
    description: "Registro fotográfico del progreso de obra, con contexto de en qué momento se sacó cada imagen.",
    titleLabel: "Descripción breve",
    statusOptions: null,
    fields: [
      { key: "url", label: "URL de la imagen", type: "text", required: true },
      { key: "etapa", label: "Etapa de la obra", type: "select", options: ["Inicio", "Medio", "Final"] },
      { key: "fecha", label: "Fecha", type: "date" },
      { key: "notas", label: "Comentario / contexto de la foto", type: "textarea" },
    ],
    summary: (d) => [d.etapa, d.fecha].filter(Boolean).join(" · "),
  },
  budget_line: {
    key: "budget_line",
    label: "Presupuesto detallado",
    singular: "partida",
    icon: "💵",
    description: "Desglose del presupuesto por partidas de costo.",
    titleLabel: "Partida",
    statusOptions: null,
    fields: [
      { key: "monto", label: "Monto (Gs.)", type: "number", required: true },
      { key: "categoria", label: "Categoría (materiales, mano de obra...)", type: "text" },
    ],
    summary: (d) => (d.monto ? `Gs. ${Number(d.monto).toLocaleString("es-PY")}` : ""),
  },
  activity: {
    key: "activity",
    label: "Actividad",
    singular: "evento",
    icon: "🕒",
    description: "Historial automático de cambios del proyecto.",
    titleLabel: "Evento",
    statusOptions: null,
    fields: [],
    summary: () => "",
    readOnly: true,
  },
};

// "checklist" (Checklist de seguridad), "milestone" (Hitos), "budget_line"
// (Presupuesto detallado) y "activity" (Actividad) se sacaron de este
// listado a pedido del usuario — sus configs quedan arriba (no se borran)
// para no romper ni perder los registros que ya existan bajo esos kinds,
// solo dejan de aparecer como pestaña.
export const ITEM_KIND_ORDER = [
  "rfi",
  "cotizacion",
  "contratista",
  "daily_log",
  "change_order",
  "team",
  "document",
  "photo",
];
