"use client";

import { useEffect } from "react";

/**
 * Llama a `fn` al montar y cada `ms`, pero no mientras la pestaña está
 * oculta: consultar cada pocos segundos una pestaña que nadie mira gasta
 * pedidos a Vercel y a la base. Al volver a la pestaña consulta enseguida.
 */
export function useVisiblePolling(fn: () => unknown, ms: number) {
  useEffect(() => {
    fn();
    const id = setInterval(() => {
      if (document.visibilityState !== "hidden") fn();
    }, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible") fn();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fn, ms]);
}
