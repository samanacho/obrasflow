// Volver a importar un presupuesto sobre uno ya cargado: compara la planilla
// nueva con los ítems que ya existen y arma las preguntas que el usuario
// tiene que contestar antes de guardar. Antes, "reemplazar" dejaba los ítems
// con pedidos y además agregaba los nuevos: el mismo material quedaba dos
// veces y el presupuesto se inflaba. Sin dependencias: corre en el navegador.

export interface FilaNueva {
  codigo: string | null;
  descripcion: string;
  unidad: string | null;
  cantidad: number;
  precioUnitario: number;
  categoria: string | null;
}

export interface ItemExistente extends FilaNueva {
  id: string;
  /** Renglones de pedidos (de cualquier estado) vinculados: si hay, no se puede borrar. */
  pedidos: number;
  /** Cantidad ya pedida en pedidos aprobados o pagados. */
  pedido: number;
}

export type Campo = "descripcion" | "unidad" | "cantidad" | "precioUnitario" | "categoria";

export interface Cambio {
  campo: Campo;
  antes: string | number | null;
  despues: string | number | null;
}

/**
 * Qué pasa con cada fila de la planilla:
 *  - "nuevo": no se parece a nada cargado → se agrega.
 *  - "igual": coincide con un ítem y no cambió nada → no se toca.
 *  - "cambio": coincide con UN ítem y cambió algo → se pregunta.
 *  - "ambiguo": coincide con VARIOS ítems → se pregunta cuál.
 */
export interface Coincidencia {
  /** Posición en la planilla (0 = primera fila de ítems). */
  indice: number;
  fila: FilaNueva;
  tipo: "nuevo" | "igual" | "cambio" | "ambiguo";
  /** Por qué se las consideró la misma cosa. */
  por: "codigo" | "descripcion" | null;
  candidatos: ItemExistente[];
  /** Solo "cambio": qué cambia respecto del único candidato. */
  cambios: Cambio[];
  /** Avisos para que decida con información (ej. cantidad menor a lo ya pedido). */
  avisos: string[];
}

export interface Comparacion {
  filas: Coincidencia[];
  /** Ítems cargados que ya no aparecen en la planilla nueva. */
  faltantes: ItemExistente[];
}

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const normCodigo = (s: string | null | undefined) => norm(s).replace(/\s/g, "").replace(/\.$/, "");

function cambiosEntre(a: ItemExistente, b: FilaNueva): Cambio[] {
  const out: Cambio[] = [];
  if (norm(a.descripcion) !== norm(b.descripcion)) out.push({ campo: "descripcion", antes: a.descripcion, despues: b.descripcion });
  if (norm(a.unidad) !== norm(b.unidad)) out.push({ campo: "unidad", antes: a.unidad, despues: b.unidad });
  if (Math.abs(a.cantidad - b.cantidad) > 1e-9) out.push({ campo: "cantidad", antes: a.cantidad, despues: b.cantidad });
  if (Math.round(a.precioUnitario) !== Math.round(b.precioUnitario)) out.push({ campo: "precioUnitario", antes: a.precioUnitario, despues: b.precioUnitario });
  if (norm(a.categoria) !== norm(b.categoria) && b.categoria) out.push({ campo: "categoria", antes: a.categoria, despues: b.categoria });
  return out;
}

/** Busca, para cada fila de la planilla, el o los ítems cargados que son "el mismo". */
export function compararConExistentes(existentes: ItemExistente[], nuevas: FilaNueva[]): Comparacion {
  const usados = new Set<string>();
  const filas: Coincidencia[] = nuevas.map((fila, indice) => {
    // 1) Mismo código (lo más confiable). 2) Si no trae código, misma
    // descripción; si hay varias, se desempata por categoría (capítulo).
    let por: Coincidencia["por"] = null;
    let candidatos: ItemExistente[] = [];
    const cod = normCodigo(fila.codigo);
    if (cod) {
      candidatos = existentes.filter((e) => normCodigo(e.codigo) === cod);
      if (candidatos.length) por = "codigo";
    }
    if (!candidatos.length) {
      candidatos = existentes.filter((e) => norm(e.descripcion) === norm(fila.descripcion));
      if (candidatos.length > 1 && fila.categoria) {
        const mismaCat = candidatos.filter((e) => norm(e.categoria) === norm(fila.categoria));
        if (mismaCat.length) candidatos = mismaCat;
      }
      if (candidatos.length) por = "descripcion";
    }

    if (!candidatos.length) return { indice, fila, tipo: "nuevo", por, candidatos, cambios: [], avisos: [] };
    if (candidatos.length > 1) {
      return { indice, fila, tipo: "ambiguo", por, candidatos, cambios: [], avisos: [`Hay ${candidatos.length} ítems cargados que podrían ser este: elegí cuál.`] };
    }
    const e = candidatos[0];
    const avisos: string[] = [];
    if (usados.has(e.id)) avisos.push("Otra fila de la planilla también coincide con este ítem.");
    usados.add(e.id);
    const cambios = cambiosEntre(e, fila);
    if (e.pedido > 0 && fila.cantidad < e.pedido) {
      avisos.push(`Ya se pidieron ${e.pedido} y la planilla nueva dice ${fila.cantidad}: quedaría pasado del presupuesto.`);
    }
    return { indice, fila, tipo: cambios.length ? "cambio" : "igual", por, candidatos, cambios, avisos };
  });

  const coinciden = new Set(filas.flatMap((f) => f.candidatos.map((c) => c.id)));
  const faltantes = existentes.filter((e) => !coinciden.has(e.id));
  return { filas, faltantes };
}

/** Qué hacer con una fila: actualizar un ítem cargado (su id), agregarla como ítem nuevo, o no cargarla. */
export type Decision = { accion: "actualizar"; id: string } | { accion: "agregar" } | { accion: "omitir" };

/** Lo que se propone por defecto; null = hay que preguntar sí o sí (ambiguo). */
export function decisionSugerida(c: Coincidencia): Decision | null {
  if (c.tipo === "nuevo") return { accion: "agregar" };
  if (c.tipo === "igual") return { accion: "omitir" };
  if (c.tipo === "cambio") return { accion: "actualizar", id: c.candidatos[0].id };
  return null;
}

export interface PlanImportacion {
  agregar: FilaNueva[];
  actualizar: (FilaNueva & { id: string })[];
  borrar: string[];
}

/**
 * Arma lo que se manda a guardar. Devuelve el problema si falta contestar
 * algo o si dos filas quieren actualizar el mismo ítem.
 */
export function armarPlan(
  comp: Comparacion,
  decisiones: (Decision | null)[],
  borrarFaltantes: Set<string>
): { plan: PlanImportacion } | { error: string } {
  const plan: PlanImportacion = { agregar: [], actualizar: [], borrar: [] };
  const destino = new Map<string, number>();
  for (const c of comp.filas) {
    const d = decisiones[c.indice];
    if (!d) return { error: `Falta decidir qué hacer con "${c.fila.descripcion}".` };
    if (d.accion === "agregar") plan.agregar.push(c.fila);
    else if (d.accion === "actualizar") {
      if (!c.candidatos.some((e) => e.id === d.id)) return { error: `"${c.fila.descripcion}": el ítem elegido no corresponde.` };
      if (destino.has(d.id)) return { error: `Dos filas de la planilla quieren actualizar el mismo ítem ("${c.fila.descripcion}"). Elegí otra opción para una de ellas.` };
      destino.set(d.id, c.indice);
      plan.actualizar.push({ ...c.fila, id: d.id });
    }
  }
  for (const e of comp.faltantes) {
    if (!borrarFaltantes.has(e.id)) continue;
    if (e.pedidos > 0) return { error: `"${e.descripcion}" tiene pedidos vinculados: no se puede borrar.` };
    plan.borrar.push(e.id);
  }
  return { plan };
}
