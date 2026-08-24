"use client";

import { useEffect, useRef } from "react";

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

  useEffect(() => {
    let cancelled = false;
    let plotted: any = null;

    import("plotly.js-dist-min").then((Plotly) => {
      if (cancelled || !ref.current) return;
      plotted = Plotly;

      const isDark = document.documentElement.getAttribute("data-coreui-theme") === "dark";
      const inkColor = isDark ? "#e7e9ec" : "#1b2a4a";
      const gridColor = isDark ? "#3c4148" : "#d8dbe0";

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
                { range: [100, max], color: isDark ? "rgba(230,76,60,.15)" : "rgba(230,76,60,.08)" },
              ],
              threshold: { line: { color: "#b3392f", width: 3 }, thickness: 0.8, value: 100 },
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
  }, [value, max, color]);

  return <div ref={ref} role="img" aria-label={`${label}: ${value}%`} />;
}
