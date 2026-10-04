"use client";

import { useEffect, useRef } from "react";
import { useIsDarkTheme } from "@/lib/useIsDarkTheme";

/**
 * Gauge de ejecución presupuestaria con Plotly (indicator + gauge) — un tipo
 * de visualización que Chart.js no cubre bien. Carga Plotly dinámicamente en
 * el cliente (es una librería pesada) y evita cargarla dos veces si ya hay
 * otro gauge en la misma página.
 */
export default function PlotlyGauge({
  value,
  max = 150,
  label = "Ejecución presupuestaria",
  color,
}: {
  value: number;
  max?: number;
  label?: string;
  color: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Se vuelve a dibujar al cambiar de tema, para que los colores acompañen.
  const isDark = useIsDarkTheme();

  useEffect(() => {
    let cancelled = false;
    let plotted: any = null;

    import("plotly.js-dist-min").then((Plotly) => {
      if (cancelled || !ref.current) return;
      plotted = Plotly;

      const inkColor = isDark ? "#e6e2d9" : "#33312c";
      const gridColor = isDark ? "#3d3930" : "#e1ddd3";

      Plotly.default.newPlot(
        ref.current,
        [
          {
            type: "indicator",
            mode: "gauge+number",
            value,
            number: { suffix: "%", font: { color: inkColor, size: 28 } },
            gauge: {
              axis: { range: [0, max], tickcolor: inkColor, tickfont: { color: inkColor, size: 10 } },
              bar: { color },
              bgcolor: "transparent",
              borderwidth: 1,
              bordercolor: gridColor,
              steps: [
                { range: [0, 100], color: isDark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.03)" },
                { range: [100, max], color: isDark ? "rgba(201,137,128,.18)" : "rgba(160,86,77,.10)" },
              ],
              threshold: { line: { color: isDark ? "#c98980" : "#a0564d", width: 3 }, thickness: 0.8, value: 100 },
            },
          },
        ],
        {
          margin: { t: 10, b: 10, l: 20, r: 20 },
          paper_bgcolor: "transparent",
          font: { color: inkColor },
          height: 200,
        },
        { displayModeBar: false, responsive: true }
      );
    });

    return () => {
      cancelled = true;
      if (plotted && ref.current) plotted.purge(ref.current);
    };
  }, [value, max, color, isDark]);

  return <div ref={ref} role="img" aria-label={`${label}: ${value}%`} />;
}
