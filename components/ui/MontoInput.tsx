"use client";

import { useState } from "react";
import { CFormInput } from "@coreui/react";
import { fmtMiles, leerMonto } from "@/lib/compras/labels";

/**
 * Campo de monto en guaraníes: teclado numérico en el celular y puntos de
 * miles mientras se escribe. Antes era un <input type="number">: escribir
 * "1.500.000" daba vacío o 1,5 según el navegador.
 */
export default function MontoInput({
  value,
  onChange,
  permitirNegativo = false,
  ...rest
}: {
  value: number | string | null | undefined;
  onChange: (monto: number | null) => void;
  /** Solo donde tiene sentido (ej. una orden de cambio que achica el alcance). */
  permitirNegativo?: boolean;
} & Omit<React.ComponentProps<typeof CFormInput>, "value" | "onChange" | "type">) {
  // Solo para el "-" recién escrito, que todavía no es un número.
  const [soloSigno, setSoloSigno] = useState(false);
  const n = value === null || value === undefined || value === "" ? null : Number(value);
  const texto = soloSigno ? "-" : n === null || !Number.isFinite(n) ? "" : `${n < 0 ? "-" : ""}${fmtMiles(Math.abs(n))}`;
  return (
    <CFormInput
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={texto}
      onChange={(e) => {
        const raw = (e.target as HTMLInputElement).value;
        setSoloSigno(permitirNegativo && raw.trim() === "-");
        onChange(leerMonto(raw, permitirNegativo));
      }}
    />
  );
}
