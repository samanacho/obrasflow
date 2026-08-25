// Paso 3 del wizard "Nuevo proyecto": campos específicos según el sector
// (privado/público) del proyecto. Separado de itemKinds.ts porque esto
// describe el propio Project (sectorData), no un módulo secundario.
//
// El listado surge de investigar el procedimiento de contratación pública
// paraguayo (DNCP — Ley 2051/03: LPN vs. LPI, garantías) y las prácticas
// estándar de client-intake de una constructora para obra privada.
// Deliberadamente compacto — el usuario pidió no sobrecargar el formulario,
// así que solo quedaron los campos más usados en la práctica, casi todos
// opcionales salvo los realmente imprescindibles.

export type SectorFieldType = "text" | "number" | "date" | "select" | "multiselect";

export interface SectorField {
  key: string;
  label: string;
  type: SectorFieldType;
  options?: string[];
  required: boolean;
  placeholder?: string;
}

// Pedidos explícitamente por el usuario — siempre van primero en obra pública.
export const PUBLIC_FIXED_FIELDS: SectorField[] = [
  { key: "entidadConvocante", label: "Entidad convocante", type: "text", required: true, placeholder: "Ej. Municipalidad de Asunción" },
  { key: "nombreLicitacion", label: "Nombre de la licitación", type: "text", required: true, placeholder: "Ej. Construcción de puente peatonal" },
  {
    key: "procedimiento",
    label: "Procedimiento de la contratación",
    type: "select",
    options: ["LPN — Licitación Pública Nacional", "LPI — Licitación Pública Internacional"],
    required: true,
  },
];

export const PUBLIC_EXTRA_FIELDS: SectorField[] = [
  { key: "numero_proceso", label: "N° de ID / código de contratación", type: "text", required: false, placeholder: "Ej. LPN-12345-2026" },
  {
    key: "localidad",
    label: "Localidad",
    type: "multiselect",
    required: false,
    placeholder: "Ciudad o ciudades donde se ejecuta la obra",
  },
  { key: "monto_adjudicado", label: "Monto adjudicado del contrato (Gs.)", type: "number", required: false, placeholder: "Ej. 850000000" },
];

export const PRIVATE_FIELDS: SectorField[] = [
  { key: "cliente", label: "Cliente / Comitente", type: "text", required: true, placeholder: "Nombre o razón social" },
  {
    key: "tipo_contrato",
    label: "Tipo de contrato",
    type: "select",
    options: ["Precio cerrado (ajuste alzado)", "Por administración", "Unidad de medida (precios unitarios)", "Coste y costas"],
    required: false,
  },
  { key: "monto_contractual", label: "Monto contractual (Gs.)", type: "number", required: false, placeholder: "Ej. 450000000" },
  {
    key: "forma_pago",
    label: "Forma de pago",
    type: "select",
    options: ["Anticipo + certificados mensuales", "Contra hitos de avance", "Contra entrega final", "Financiado"],
    required: false,
  },
];

export const PUBLIC_FIELDS: SectorField[] = [...PUBLIC_FIXED_FIELDS, ...PUBLIC_EXTRA_FIELDS];
