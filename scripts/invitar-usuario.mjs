// Crea un link de invitación para un usuario de ObrasFlow y lo abre en el
// navegador de esta PC (no lo muestra en pantalla: es de un solo uso, pero
// mientras no se use sirve para crear un usuario).
//
// Sirve para el PRIMER usuario, cuando todavía nadie puede ingresar. Usa la
// clave del conector de Memby (la misma que está en Vercel):
//
//   node --env-file=..\ObrasFlow-versiones\memby.env scripts/invitar-usuario.mjs "Ignacio Samaniego"
//
// Opciones: --url https://otra-app.vercel.app (por defecto MEMBY_REMOTE_URL)
//           --mostrar  (además de abrirlo, lo muestra)
// Los siguientes usuarios se invitan desde la app: Usuarios → Invitar a alguien.

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const nombre = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--url").join(" ").trim();
const base = (opt("--url") || process.env.MEMBY_REMOTE_URL || "").trim().replace(/\/$/, "");
const key = process.env.MEMBY_CONNECTOR_KEY?.trim();

if (!nombre) {
  console.error('Falta el nombre. Ej.: node --env-file=..\\ObrasFlow-versiones\\memby.env scripts/invitar-usuario.mjs "Ignacio Samaniego"');
  process.exit(1);
}
if (!base || !key) {
  console.error("Faltan MEMBY_REMOTE_URL y/o MEMBY_CONNECTOR_KEY (cargalos con --env-file apuntando a memby.env).");
  process.exit(1);
}

const res = await fetch(`${base}/api/auth/invitaciones`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  body: JSON.stringify({ nombre }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok || !body.link) {
  console.error(`No se pudo crear la invitación (${res.status}): ${body.error ?? "respuesta inesperada"}`);
  process.exit(1);
}

if (flag("--mostrar")) console.log(body.link);
const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", body.link]] : process.platform === "darwin" ? ["open", [body.link]] : ["xdg-open", [body.link]];
spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
console.log(`✅ Invitación para "${body.nombre}" creada (vence ${new Date(body.vence).toLocaleString("es-PY")}). Se abrió en el navegador: elegí tu usuario y contraseña ahí.`);
