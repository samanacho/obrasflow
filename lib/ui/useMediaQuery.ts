"use client";

import { useEffect, useState } from "react";

/**
 * true mientras la ventana cumpla la consulta CSS. Arranca en false (en el
 * servidor no hay ventana) y se corrige al montar.
 *
 *   const esCelular = useMediaQuery("(max-width: 767px)");
 */
export function useMediaQuery(query: string): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setOk(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return ok;
}
