"use client";

import { useEffect, type RefObject } from "react";

// jQuery conviviendo con React: SOLO dentro de este hook y SOLO sobre un
// contenedor cuyo contenido NO arma React (por ejemplo un plugin que dibuja
// su propio HTML). Nunca usarlo para cambiar elementos que renderiza React:
// React y jQuery se pisarían y la pantalla quedaría desincronizada.
//
//   const ref = useRef<HTMLDivElement>(null);
//   useJQuery(ref, ($, el) => { $(el).append("<p>hola</p>"); return () => $(el).empty(); });
//   return <div ref={ref} />;

export function useJQuery<T extends HTMLElement>(
  ref: RefObject<T>,
  run: ($: JQueryStatic, el: T) => void | (() => void),
  deps: unknown[] = []
) {
  useEffect(() => {
    let cleanup: void | (() => void);
    let cancelled = false;
    import("jquery").then(({ default: $ }) => {
      if (!cancelled && ref.current) cleanup = run($, ref.current);
    });
    return () => {
      cancelled = true;
      if (typeof cleanup === "function") cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
