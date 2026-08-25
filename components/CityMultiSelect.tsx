"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PARAGUAY_DEPARTMENTS } from "@/lib/paraguayCities";

const ACCENT_MAP: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n", ü: "u" };
/** Quita tildes/ñ para que buscar "asuncion" encuentre "Asunción". */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[áéíóúñü]/g, (ch) => ACCENT_MAP[ch] ?? ch);
}

/**
 * Selector de una o varias localidades de Paraguay (263 distritos, agrupados
 * por departamento) — una obra puede ejecutarse en una sola ciudad o en
 * varias a la vez. Un <select multiple> nativo sería inmanejable con este
 * volumen de opciones, así que esto es un combobox con buscador + chips de
 * seleccionados + lista agrupada por departamento.
 */
export default function CityMultiSelect({
  value,
  onChange,
  placeholder = "Buscar ciudad o localidad…",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return PARAGUAY_DEPARTMENTS;
    return PARAGUAY_DEPARTMENTS.map((d) => ({
      name: d.name,
      cities: d.cities.filter((c) => normalize(c).includes(q)),
    })).filter((d) => d.cities.length > 0);
  }, [query]);

  function toggle(city: string) {
    onChange(value.includes(city) ? value.filter((c) => c !== city) : [...value, city]);
  }

  return (
    <div className="city-multiselect" ref={boxRef}>
      {value.length > 0 && (
        <div className="city-chips">
          {value.map((c) => (
            <span key={c} className="city-chip">
              {c}
              <button type="button" aria-label={`Quitar ${c}`} onClick={() => toggle(c)}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        className="form-control"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="city-dropdown">
          {groups.length === 0 && <div className="city-dropdown-empty">Sin resultados.</div>}
          {groups.map((d) => (
            <div key={d.name} className="city-dropdown-group">
              <div className="city-dropdown-group-label">{d.name}</div>
              {d.cities.map((c) => (
                <label key={c} className="city-dropdown-item">
                  <input type="checkbox" checked={value.includes(c)} onChange={() => toggle(c)} />
                  {c}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
