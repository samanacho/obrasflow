// Corre en el middleware (Edge): sin imports de Node.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostnameOf(hostOrUrl: string): string {
  try {
    return new URL(hostOrUrl.includes("://") ? hostOrUrl : `http://${hostOrUrl}`).hostname;
  } catch {
    return "";
  }
}

/**
 * La app local no pide login, así que cualquier página web abierta en la PC
 * podría mandarle pedidos a 127.0.0.1 (cambiar los números permitidos de
 * Memby, mandar mensajes, desvincular WhatsApp). Solo se aceptan pedidos que
 * vengan de la propia app: Host local (eso también frena el "DNS rebinding")
 * y, si cambian algo, Origin local.
 */
export function localRequestAllowed(method: string, host: string | null, origin: string | null, fetchSite: string | null): boolean {
  if (!host || !LOCAL_HOSTS.has(hostnameOf(host))) return false;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (fetchSite === "cross-site") return false;
  return !origin || LOCAL_HOSTS.has(hostnameOf(origin));
}
