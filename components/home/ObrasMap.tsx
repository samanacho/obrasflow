"use client";

// Mapa de obras (Leaflet + OpenStreetMap, sin claves): un punto por obra con
// el color de su semáforo de presupuesto. Las obras sin ubicación se pueden
// ubicar acá mismo: se elige la obra y se toca el lugar en el mapa.

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { notificar } from "@/lib/ui/alerts";
import type { ProjectDTO } from "@/lib/types";
import { budgetState, daysLeft, fmtGsShort, STATUS_LABEL, type Light } from "./HomeWidgets";

const PARAGUAY_CENTER: [number, number] = [-23.44, -58.44];
const COLORS: Record<Light, string> = { ok: "#5f8362", warn: "#b0843a", crit: "#a0564d", none: "#8b8478" };

function parseCoords(c: string | null): [number, number] | null {
  if (!c) return null;
  const [lat, lng] = c.split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export default function ObrasMap({ projects, onUpdated }: { projects: ProjectDTO[]; onUpdated: (p: ProjectDTO) => void }) {
  const mount = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layer = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [placing, setPlacing] = useState<ProjectDTO | null>(null);
  const placingRef = useRef<ProjectDTO | null>(null);
  placingRef.current = placing;
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  const located = projects.filter((p) => parseCoords(p.coordinates));
  const missing = projects.filter((p) => !parseCoords(p.coordinates));

  // Mapa: se crea una vez.
  useEffect(() => {
    let disposed = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !mount.current) return;
      const m = L.map(mount.current).setView(PARAGUAY_CENTER, 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      m.on("click", async (e: { latlng: { lat: number; lng: number } }) => {
        const p = placingRef.current;
        if (!p) return;
        const coordinates = `${e.latlng.lat.toFixed(6)},${e.latlng.lng.toFixed(6)}`;
        try {
          const r = await fetch(`/api/projects/${p.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coordinates }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || "No se pudo guardar la ubicación.");
          onUpdatedRef.current(j as ProjectDTO);
          notificar(`${p.name}: ubicación guardada`, "success");
          setPlacing(null);
        } catch (err) {
          notificar((err as Error).message, "error");
        }
      });
      map.current = m;
      setTimeout(() => m.invalidateSize(), 120);
      setReady(true);
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Puntos: se redibujan cuando cambian las obras (filtros, ubicaciones nuevas).
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const L = (await import("leaflet")).default;
      const g = layer.current;
      if (!g) return;
      g.clearLayers();
      const bounds: [number, number][] = [];
      for (const p of located) {
        const ll = parseCoords(p.coordinates)!;
        bounds.push(ll);
        const b = budgetState(p);
        const d = daysLeft(p.end);
        const late = d < 0 && p.status !== "finalizado";
        L.circleMarker(ll, {
          radius: 9,
          color: "#fff",
          weight: 2,
          fillColor: COLORS[late && b.light !== "crit" ? "crit" : b.light],
          fillOpacity: 0.95,
        })
          .bindPopup(
            `<div class="of-map-pop"><strong>${esc(p.name)}</strong>${p.reference ? ` · ${esc(p.reference)}` : ""}<br>` +
              `${esc(STATUS_LABEL[p.status])} · avance ${Math.round(p.progress)}&nbsp;%<br>` +
              `Ejecutado ${b.pct === null ? "—" : `${b.pct}&nbsp;%`} (${esc(fmtGsShort(p.spent))} de ${esc(fmtGsShort(p.budget))})` +
              `${late ? `<br><span style="color:#a0564d">Venció hace ${-d} días</span>` : ""}` +
              `<br><a href="/project/${p.id}">Abrir ficha →</a></div>`
          )
          .addTo(g);
      }
      if (bounds.length === 1) map.current?.setView(bounds[0], 10);
      else if (bounds.length > 1) map.current?.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, projects]);

  return (
    <div className="of-map">
      {placing && (
        <div className="of-map-placing">
          📍 Tocá en el mapa dónde está <strong>{placing.name}</strong>
          <button type="button" onClick={() => setPlacing(null)}>
            Cancelar
          </button>
        </div>
      )}
      <div ref={mount} className={`of-map-canvas${placing ? " is-placing" : ""}`} />
      <div className="of-map-legend">
        <span>
          <i style={{ background: COLORS.ok }} /> Bien
        </span>
        <span>
          <i style={{ background: COLORS.warn }} /> Atención
        </span>
        <span>
          <i style={{ background: COLORS.crit }} /> Pasada o vencida
        </span>
        <span className="ms-auto">
          {located.length} de {projects.length} obras ubicadas
        </span>
      </div>
      {missing.length > 0 && (
        <div className="of-map-missing">
          <div className="of-qa-label">Sin ubicación: elegí una y tocá el mapa</div>
          <div className="home-chips">
            {missing.map((p) => (
              <button key={p.id} type="button" className={placing?.id === p.id ? "on" : ""} onClick={() => setPlacing(placing?.id === p.id ? null : p)}>
                📍 {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
