// Configuración declarativa de los módulos secundarios de un proyecto.
// Cada "kind" comparte el mismo modelo (ProjectItem) y el mismo patrón de
// lista + formulario en el frontend; lo único que cambia es esta config.

export type FieldType = "text" | "textarea" | "number" | "date" | "contractor";

export interface ItemField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
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
      { key: "coordenadas", label: "Coordenadas (opcional)", type: "text", placeholder: "lat, long" },
      { key: "mediciones", label: "Mediciones / cantidades estimadas", type: "textarea" },
      { key: "observaciones", label: "Observaciones técnicas y condiciones del terreno", type: "textarea" },
      { key: "responsable", label: "Responsable del relevamiento", type: "text" },
    ],
    summary: (d) => [d.ubicacion, d.responsable].filter(Boolean).join(" · "),
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
      { key: "monto", label: "Monto cotizado (USD)", type: "number", required: true },
      { key: "notas", label: "Notas", type: "textarea" },
    ],
    summary: (d) => [d.contratistaNombre, d.monto ? `$${Number(d.monto).toLocaleString("es-AR")}` : ""].filter(Boolean).join(" · "),
  },
  punch: {
    key: "punch",
    label: "Punch List",
    singular: "ítem",
    icon: "🧾",
    description: "Pendientes de cierre antes de dar por terminado el proyecto.",
    titleLabel: "Descripción",
    statusOptions: ["Pendiente", "En revisión", "Resuelto"],
    defaultStatus: "Pendiente",
    fields: [
      { key: "ubicacion", label: "Ubicación", type: "text" },
      { key: "responsable", label: "Responsable", type: "text" },
      { key: "foto", label: "URL de foto (opcional)", type: "text" },
    ],
    summary: (d) => [d.ubicacion, d.responsable].filter(Boolean).join(" · "),
  },
  daily_log: {
    key: "daily_log",
    label: "Bitácora diaria",
    singular: "entrada",
    icon: "📋",
    description: "Registro diario de avance, clima y personal en obra.",
    titleLabel: "Título de la entrada",
    statusOptions: null,
    fields: [
      { key: "fecha", label: "Fecha", type: "date", required: true },
      { key: "clima", label: "Clima", type: "text" },
      { key: "personal", label: "Personal en sitio", type: "text" },
      { key: "notas", label: "Notas / incidentes", type: "textarea" },
    ],
    summary: (d) => [d.fecha, d.clima].filter(Boolean).join(" · "),
  },
  change_order: {
    key: "change_order",
    label: "Órdenes de cambio",
    singular: "orden",
    icon: "🔁",
    description: "Cambios de alcance con impacto en presupuesto o plazo.",
    titleLabel: "Descripción del cambio",
    statusOptions: ["Pendiente", "Aprobada", "Rechazada"],
    defaultStatus: "Pendiente",
    fields: [
      { key: "impacto", label: "Impacto en presupuesto (USD)", type: "number" },
      { key: "motivo", label: "Motivo", type: "textarea" },
    ],
    summary: (d) => (d.impacto ? `Impacto: $${Number(d.impacto).toLocaleString("es-AR")}` : ""),
  },
  team: {
    key: "team",
    label: "Equipo",
    singular: "persona",
    icon: "👷",
    description: "Responsables y contactos asignados al proyecto.",
    titleLabel: "Nombre",
    statusOptions: null,
    fields: [
      { key: "rol", label: "Rol", type: "text" },
      { key: "contacto", label: "Contacto (email / teléfono)", type: "text" },
    ],
    summary: (d) => [d.rol, d.contacto].filter(Boolean).join(" · "),
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
    description: "Registro fotográfico del progreso de obra.",
    titleLabel: "Descripción",
    statusOptions: null,
    fields: [
      { key: "url", label: "URL de la imagen", type: "text", required: true },
      { key: "fecha", label: "Fecha", type: "date" },
    ],
    summary: (d) => d.fecha || "",
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
      { key: "monto", label: "Monto (USD)", type: "number", required: true },
      { key: "categoria", label: "Categoría (materiales, mano de obra...)", type: "text" },
    ],
    summary: (d) => (d.monto ? `$${Number(d.monto).toLocaleString("es-AR")}` : ""),
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

export const ITEM_KIND_ORDER = [
  "rfi",
  "cotizacion",
  "punch",
  "daily_log",
  "change_order",
  "team",
  "checklist",
  "milestone",
  "document",
  "photo",
  "budget_line",
  "activity",
];
