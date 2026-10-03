"use client";

import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react";

// Único punto de entrada para íconos en la app (Phosphor Icons). El estilo
// (grosor, tamaño) se define acá, así todos los íconos se ven del mismo juego.
// Nada de emojis como íconos: se ven distinto en cada sistema y no se les
// puede cambiar tamaño ni color.
//
//   import { Buildings } from "@phosphor-icons/react";
//   <Icon icon={Buildings} />                 // 20 px, duotono, color del texto
//   <Icon icon={Warning} size={16} label="Vencida" />   // con texto para lectores de pantalla
//
// Buscador de íconos: https://phosphoricons.com

export default function Icon({
  icon: Glyph,
  size = 20,
  weight = "duotone",
  label,
  className,
}: {
  icon: PhosphorIcon;
  size?: number;
  /** "duotone" es el estilo de la app; "bold" solo para íconos muy chicos (≤ 14 px). */
  weight?: IconWeight;
  /** Si el ícono comunica algo que no está escrito al lado, describilo acá. */
  label?: string;
  className?: string;
}) {
  return (
    <Glyph
      size={size}
      weight={weight}
      className={"of-icon" + (className ? " " + className : "")}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}
