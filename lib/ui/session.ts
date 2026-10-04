"use client";

import { useEffect, useState } from "react";
import { safeReturnPath } from "@/lib/auth/token";

// Sesión del lado del navegador: quién ingresó, mantener la sesión viva
// mientras la app está abierta y salir. El login en sí lo maneja el servidor
// (middleware.ts + app/api/auth); acá solo se lo acompaña.
//
//   const yo = useSesion();           // null mientras carga
//   if (yo?.local) …                  // PC local: no hay login ni "Salir"
//   await salir();

export interface Yo {
  /** App local (PC, solo 127.0.0.1): no pide login. */
  local: boolean;
  nombre: string;
  usuario: string | null;
  /** Si ve "Personal" en el menú (lib/auth/personal.ts). Al abrirla, el servidor lo vuelve a controlar. */
  verPersonal: boolean;
}

const RENOVAR_CADA_MS = 10 * 60_000;
/** Si la pestaña estuvo escondida más que esto, se renueva al volver. */
const AUSENCIA_MS = 5 * 60_000;

// Cada pantalla monta su propio AppShell: se guarda acá para no volver a
// preguntar (ni parpadear el nombre) en cada clic.
let yoCache: Yo | null = null;
let yoPedido: Promise<Yo | null> | null = null;
let mantenimientoIniciado = false;

/** Ruta interna a la que volver después de ingresar; nunca la propia pantalla de ingreso. */
export function volverSeguro(p: string | null | undefined): string {
  const ruta = safeReturnPath(p);
  return ruta.startsWith("/ingresar") ? "/" : ruta;
}

/** Manda a la pantalla de ingreso y, al entrar, vuelve a donde estaba. */
export function irAIngresar() {
  const aqui = window.location.pathname + window.location.search;
  window.location.href = aqui === "/" ? "/ingresar" : `/ingresar?volver=${encodeURIComponent(aqui)}`;
}

/** Olvida al usuario guardado (después de ingresar o de crear el usuario). */
export function olvidarSesion() {
  yoCache = null;
  yoPedido = null;
}

function pedirYo(): Promise<Yo | null> {
  if (!yoPedido) {
    yoPedido = fetch("/api/auth/yo", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) {
          irAIngresar();
          return null;
        }
        if (!r.ok) return null;
        yoCache = (await r.json()) as Yo;
        return yoCache;
      })
      .catch(() => null)
      .finally(() => {
        // Si falló (sin red), que el próximo pedido vuelva a intentar.
        if (!yoCache) yoPedido = null;
      });
  }
  return yoPedido;
}

async function renovar() {
  try {
    const r = await fetch("/api/auth/renovar", { method: "POST", cache: "no-store" });
    if (r.status === 401) irAIngresar();
  } catch {
    // Sin conexión: se reintenta en la próxima vuelta.
  }
}

/**
 * Mantiene viva la sesión mientras se usa la app: renueva cada 10 minutos y
 * al volver a la pestaña después de un rato. Una sola vez por pestaña.
 */
function iniciarMantenimiento() {
  if (mantenimientoIniciado) return;
  mantenimientoIniciado = true;
  let escondidaDesde: number | null = null;
  setInterval(() => {
    if (document.visibilityState === "visible") void renovar();
  }, RENOVAR_CADA_MS);
  const alIrse = () => {
    if (escondidaDesde === null) escondidaDesde = Date.now();
  };
  const alVolver = () => {
    if (escondidaDesde !== null && Date.now() - escondidaDesde > AUSENCIA_MS) void renovar();
    escondidaDesde = null;
  };
  document.addEventListener("visibilitychange", () => (document.visibilityState === "hidden" ? alIrse() : alVolver()));
  window.addEventListener("blur", alIrse);
  window.addEventListener("focus", alVolver);
}

/** Quién ingresó (null mientras carga o si no se pudo saber). */
export function useSesion(): Yo | null {
  const [yo, setYo] = useState<Yo | null>(yoCache);
  useEffect(() => {
    let vivo = true;
    pedirYo().then((y) => {
      if (!vivo || !y) return;
      setYo(y);
      if (!y.local) iniciarMantenimiento();
    });
    return () => {
      vivo = false;
    };
  }, []);
  return yo;
}

/** Cierra la sesión y vuelve a la pantalla de ingreso (recarga entera: no queda nada en memoria). */
export async function salir() {
  try {
    await fetch("/api/auth/salir", { method: "POST" });
  } finally {
    olvidarSesion();
    window.location.href = "/ingresar";
  }
}
