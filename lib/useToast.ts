"use client";

import { useEffect, useState } from "react";

/**
 * Reemplazo de window.alert() para toda la app — mismo motivo que
 * components/ConfirmDialog.tsx: un alert() nativo puede quedar silenciado
 * por el navegador sin avisar. Esto es un mensaje propio de la UI (usa la
 * clase .toast ya definida en globals.css) que se autodescarta solo.
 *
 * Uso: const { toast, showToast } = useToast(); showToast("Algo falló.");
 * y en el JSX: <Toast message={toast} /> (components/Toast.tsx).
 */
export function useToast(durationMs = 2400) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), durationMs);
    return () => clearTimeout(t);
  }, [toast, durationMs]);

  return { toast, showToast: setToast };
}
