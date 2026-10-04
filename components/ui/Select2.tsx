"use client";

import { useEffect, useRef } from "react";
import "select2/dist/css/select2.min.css";
import "select2-bootstrap-5-theme/dist/select2-bootstrap-5-theme.min.css";
import { useJQuery } from "@/lib/ui/useJQuery";

// Select con buscador (Select2, tema Bootstrap 5). SOLO para listas largas o
// donde buscar ayuda: obras, proveedores, contratistas, ciudades. En un
// select de pocas opciones es ruido: ahí va un <CFormSelect> común.
//
//   <Select2 options={obras.map(o => ({ value: o.id, label: o.name }))}
//            value={obraId} onChange={setObraId} placeholder="Elegí la obra" />
//
// El <select> lo arma jQuery adentro de un <div> que React no toca (regla de
// lib/ui/useJQuery.ts), así React y Select2 no se pisan.

export interface Select2Option {
  value: string;
  label: string;
  /** Agrupa las opciones bajo un título (por ejemplo, el rubro). */
  group?: string;
}

const ES = {
  noResults: () => "No hay coincidencias",
  searching: () => "Buscando…",
  removeAllItems: () => "Quitar",
  inputTooShort: () => "Escribí para buscar",
};

export default function Select2({
  options,
  value,
  onChange,
  placeholder = "Elegí una opción",
  allowClear = false,
  disabled = false,
  id,
  invalid = false,
}: {
  options: Select2Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  /** Para asociar un <label htmlFor>. */
  id?: string;
  invalid?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const sel = useRef<HTMLSelectElement | null>(null);
  const jq = useRef<JQueryStatic | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Opciones y valor más recientes: jQuery carga en diferido y, si las opciones
  // llegan antes (fetch), el montaje tiene que usar estas y no las del primer render.
  const latest = useRef({ options, value });
  latest.current = { options, value };

  // Montaje: crea el <select> y activa Select2 una sola vez.
  useJQuery(wrap, ($, el) => {
    jq.current = $;
    let destroyed = false;
    const select = document.createElement("select");
    select.className = "form-select";
    if (id) select.id = id;
    el.appendChild(select);
    sel.current = select;
    fill(select, latest.current.options, latest.current.value);

    import("select2").then(({ default: attach }) => {
      if (destroyed) return;
      // Con webpack (Next) Select2 se registra solo en $.fn al cargarse (rama
      // AMD de su UMD; jQuery 4 comparte una sola instancia entre import y
      // require). Solo en CommonJS puro exporta la función (root, jQuery).
      if (!($.fn as any).select2) (attach as unknown as (root: Window, jq: JQueryStatic) => void)(window, $);
      const modal = el.closest(".modal");
      ($(select) as any).select2({
        theme: "bootstrap-5",
        width: "100%",
        placeholder,
        allowClear,
        language: ES,
        dropdownParent: modal ? $(modal) : $(document.body),
      });
      $(select).on("change", () => onChangeRef.current(String($(select).val() ?? "")));
    });

    return () => {
      destroyed = true;
      const $s = $(select) as any;
      if ($s.data("select2")) $s.select2("destroy");
      $s.off();
      select.remove();
      sel.current = null;
    };
  }, []);

  // Opciones o valor nuevos desde React → al <select> de Select2.
  useEffect(() => {
    const select = sel.current;
    const $ = jq.current;
    if (!select || !$) return;
    fill(select, options, value);
    $(select).trigger("change.select2");
  }, [options, value]);

  useEffect(() => {
    const select = sel.current;
    if (!select) return;
    select.disabled = disabled;
    select.classList.toggle("is-invalid", invalid);
  }, [disabled, invalid]);

  return <div ref={wrap} className="of-select2" />;
}

/** Reescribe las opciones del <select> (con grupos) y marca el valor. */
function fill(select: HTMLSelectElement, options: Select2Option[], value: string) {
  select.replaceChildren(new Option("", ""));
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const o of options) {
    const opt = new Option(o.label, o.value, false, o.value === value);
    if (o.group) {
      let g = groups.get(o.group);
      if (!g) {
        g = document.createElement("optgroup");
        g.label = o.group;
        groups.set(o.group, g);
        select.appendChild(g);
      }
      g.appendChild(opt);
    } else {
      select.appendChild(opt);
    }
  }
  select.value = value;
}
