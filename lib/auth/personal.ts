import { normalizeUsername } from "./password";

// Quién puede ver la pantalla Personal (reparto de beneficios). Parte pura,
// sin base ni cookies, para poder probarla; la que consulta la base está en
// ./personalServer.ts.
//
// Decisión de Ignacio (2026-10-04): solo él y quien indique; el servidor lo
// controla con el usuario de ingreso (antes era un PIN escrito en el código
// del navegador, que cualquiera podía leer).
//
//   PERSONAL_USUARIOS="ignacio,hugo"   → solo esos usuarios de ingreso.
//   Sin definir (o vacía)              → solo el primer usuario creado que siga
//                                        activo: Ignacio, que se creó primero
//                                        con scripts/invitar-usuario.mjs.

/**
 * Lista de usuarios habilitados según PERSONAL_USUARIOS, normalizados igual
 * que al ingresar (así "Ignacio " o "ignácio" coinciden con "ignacio").
 * null = no definida: corresponde la regla del primer usuario.
 */
export function usuariosPersonal(env: string | undefined): string[] | null {
  const lista = (env ?? "")
    .split(",")
    .map(normalizeUsername)
    .filter(Boolean);
  // Vacía cuenta como no definida: si no, una variable mal cargada dejaría a
  // nadie (ni a Ignacio) con acceso.
  return lista.length ? Array.from(new Set(lista)) : null;
}

/** ¿Este usuario de ingreso está en la lista? */
export function estaEnPersonal(username: string, lista: string[]): boolean {
  const u = normalizeUsername(username);
  return u !== "" && lista.includes(u);
}
