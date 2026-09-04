"use client";

import { useEffect } from "react";

/**
 * Bug clásico de los navegadores: si un <input type="number"> tiene el
 * foco y el usuario mueve la rueda del mouse (para seguir bajando por un
 * formulario largo, por ejemplo), Chrome/Firefox lo interpretan como "subí
 * o bajá el valor en 1" en vez de "scrolleá la página" — silencioso, sin
 * ningún aviso visual, y es justo lo que reportó el usuario: montos que
 * "se guardan con -1 de diferencia" de forma intermitente.
 *
 * Blurear el input apenas empieza el wheel (antes de que el navegador
 * aplique su acción por defecto de +/-1) lo neutraliza sin bloquear el
 * scroll de la página. Un solo listener acá, montado una vez en el layout
 * raíz, cubre TODOS los <input type="number"> de la app — actuales y
 * futuros — sin tener que tocar cada formulario por separado.
 */
export default function NumberInputWheelGuard() {
  useEffect(() => {
    function handleWheel() {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement && el.type === "number") {
        el.blur();
      }
    }
    document.addEventListener("wheel", handleWheel, { passive: true });
    return () => document.removeEventListener("wheel", handleWheel);
  }, []);

  return null;
}
