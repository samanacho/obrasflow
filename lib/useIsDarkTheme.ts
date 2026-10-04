"use client";

import { useEffect, useState } from "react";

/**
 * Tema actual (`data-coreui-theme` en <html>), leído recién en el cliente
 * después de montar — nunca durante el render en sí. Antes varias pantallas
 * (Inicio, Ejecución, Postes, ficha de obra) leían `document` directo en el
 * cuerpo del componente para elegir colores de gráfico; el servidor nunca
 * tiene `document`, así que esa lectura podía dar un resultado distinto al
 * del primer render del cliente y React tiraba un error de hidratación
 * (#418/#423) — sin romper nada a la vista, pero de forma consistente en
 * toda la app. Mismo criterio que components/AppShell.tsx al leer el tema
 * guardado en localStorage: se resuelve en un useEffect, no en el render.
 *
 * Escucha los cambios del atributo: al tocar el botón de tema, los gráficos
 * cambian de colores sin recargar la página.
 */
export function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    const leer = () => setIsDark(html.getAttribute("data-coreui-theme") === "dark");
    leer();
    const observer = new MutationObserver(leer);
    observer.observe(html, { attributes: true, attributeFilter: ["data-coreui-theme"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}
