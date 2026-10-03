import type { ResidenteParte } from "./types";

// Cliente de la API de Residente de Obra. Hoy esa API NO existe (ver
// docs/HANDOFF_RESIDENTE_DE_OBRA.md): las rutas son las que ellos propusieron
// y pueden cambiar. Queda apagado hasta que estén las variables:
//   RESIDENTE_API_URL  ej. https://<preview>.vercel.app
//   RESIDENTE_API_KEY  clave de API de nuestra constructora (Bearer)

export function getApiConfig(): { url: string; key: string } | null {
  const url = process.env.RESIDENTE_API_URL?.trim().replace(/\/+$/, "");
  const key = process.env.RESIDENTE_API_KEY?.trim();
  return url && key ? { url, key } : null;
}

async function get<T>(path: string): Promise<T> {
  const cfg = getApiConfig();
  if (!cfg) throw new Error("La API de Residente de Obra no está configurada (RESIDENTE_API_URL / RESIDENTE_API_KEY).");
  const res = await fetch(cfg.url + path, {
    headers: { Authorization: `Bearer ${cfg.key}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Residente de Obra respondió ${res.status} en ${path}`);
  return (await res.json()) as T;
}

/** GET /api/v1/obras/{codigo}/partes?desde=AAAA-MM-DD (propuesto por ellos). */
export function listPartes(codigo: string, desde: string): Promise<ResidenteParte[]> {
  return get(`/api/v1/obras/${encodeURIComponent(codigo)}/partes?desde=${encodeURIComponent(desde)}`);
}

/** Un parte puntual, para cuando el webhook trae solo el id. Ruta tentativa. */
export async function getParte(codigo: string, parteId: string): Promise<ResidenteParte> {
  return get(`/api/v1/obras/${encodeURIComponent(codigo)}/partes/${encodeURIComponent(parteId)}`);
}
