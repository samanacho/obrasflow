"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// Centro aproximado de Paraguay — punto de partida cuando todavía no hay
// coordenadas cargadas, así el mapa arranca mostrando el país entero en vez
// de un punto al azar (ej. el (0,0) del océano).
const PARAGUAY_CENTER: [number, number] = [-23.4425, -58.4438];
const COUNTRY_ZOOM = 6;
const PIN_ZOOM = 15;

/**
 * Selector de ubicación con Leaflet (BSD-2-Clause, open source) + tiles de
 * OpenStreetMap — igual criterio que ThreeSkyline.tsx/DhtmlxGanttChart.tsx:
 * la librería se usa de forma imperativa dentro de un useEffect en vez de
 * con el wrapper "react-leaflet" (licencia Hippocratic, no es open source
 * en sentido estricto). Clic en el mapa = marca/mueve el pin y devuelve
 * las coordenadas; también sirve para ver dónde quedó un relevamiento ya
 * cargado sin tener que interpretar un "lat, long" a mano.
 */
export default function LocationPicker({
  value,
  onChange,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number }) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!mountRef.current) return;
    let disposed = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !mountRef.current) return;

      // Los íconos default de Leaflet apuntan a rutas relativas que el
      // bundler de Next.js no resuelve — se apuntan al CDN oficial del
      // propio paquete en vez de intentar empaquetar los PNG a mano.
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const startCenter: [number, number] = value ? [value.lat, value.lng] : PARAGUAY_CENTER;
      const map = L.map(mountRef.current, { attributionControl: true }).setView(startCenter, value ? PIN_ZOOM : COUNTRY_ZOOM);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      if (value) {
        markerRef.current = L.marker(startCenter).addTo(map);
      }

      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
        else markerRef.current = L.marker([lat, lng]).addTo(map);
        onChangeRef.current({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
      });

      // El mapa suele nacer dentro de un modal recién abierto, donde el
      // contenedor todavía mide 0×0 en el primer render — sin este
      // recálculo, Leaflet queda con los tiles mal recortados.
      setTimeout(() => map.invalidateSize(), 120);
    })();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // el mapa se crea una sola vez; después administra su propio marcador vía clicks

  return (
    <div>
      <div ref={mountRef} className="of-location-picker" />
      <p className="form-hint mb-0">
        Hacé clic en el mapa para marcar la ubicación
        {value ? ` — ${value.lat}, ${value.lng}` : ""}.
      </p>
    </div>
  );
}
