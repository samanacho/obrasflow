// ObrasFlow completo en esta PC (modo local):
//   1. PostgreSQL local (embedded-postgres, datos en .local-db/, solo 127.0.0.1:5433)
//   2. La app web en http://localhost:3000 (server/local-server.mjs: Fastify + Next)
//   3. El conector de WhatsApp (Baileys + Claude Code) en http://localhost:3099
//
// Modos (elegí uno; por defecto dev):
//   npm run local        → dev: recarga en caliente; cada cambio de pantalla se ve al guardar.
//   npm run local:prod   → prod: compila (si el código cambió) y sirve lo compilado (más liviano).
//   También: --dev | --prod, o la variable OBRASFLOW_MODO=dev|prod.
// Otras opciones: --port=3000 (puerto de la app), --sin-conector (no levanta WhatsApp),
// --sin-web (solo la base; la app la sirve otra copia, p. ej. la principal en el puerto 80).
//
// Si algo se cae, lo vuelve a levantar. El conector se reinicia solo cuando
// cambian sus archivos (worker/ y lo que importa de lib/), sin perder la sesión
// vinculada (.baileys-auth/). Ctrl+C apaga todo en orden: app, conector y base.
// Estado: http://localhost:3000/__salud
//
// No usa Vercel ni claves de API: la IA corre con la sesión de Claude Code de
// esta PC y la base es local. WhatsApp sí sale a internet.

import { spawn, spawnSync, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, watch } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import net from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import { crearLog, prefijador } from "../server/log.mjs";

const ROOT = resolve(import.meta.dirname, "..");
process.chdir(ROOT);

const { values: args } = parseArgs({
  options: { dev: { type: "boolean" }, prod: { type: "boolean" }, port: { type: "string" }, "sin-conector": { type: "boolean" }, "sin-web": { type: "boolean" } },
  strict: false,
});
const MODO = args.prod ? "prod" : args.dev ? "dev" : process.env.OBRASFLOW_MODO === "prod" ? "prod" : "dev";
const CON_CONECTOR = !args["sin-conector"];
const CON_WEB = !args["sin-web"];

// OBRASFLOW_DB_DIR / OBRASFLOW_DB_PORT: solo para pruebas con una base aparte (no tocan .env.local).
const PRUEBA_DB = Boolean(process.env.OBRASFLOW_DB_DIR || process.env.OBRASFLOW_DB_PORT);
const DB_DIR = resolve(ROOT, process.env.OBRASFLOW_DB_DIR || ".local-db");
const DB_PORT = Number(process.env.OBRASFLOW_DB_PORT || 5433);
const DB_USER = "obrasflow";
const DB_PASS = "obrasflow-local";
const DB_NAME = "obrasflow";
const DB_URL = `postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}`;
const APP_PORT = Number(args.port || 3000);
const CONECTOR_PORT = Number(process.env.CONNECTOR_PORT || 3099); // el conector lee la misma variable
const ENV_FILE = join(ROOT, ".env.local");
const NODE = process.execPath;
const NPM_CLI = join(NODE, "..", "node_modules", "npm", "bin", "npm-cli.js");
const PG_CTL = join(ROOT, "node_modules", "@embedded-postgres", "windows-x64", "native", "bin", "pg_ctl.exe");

// Sin variables heredadas de una sesión de Claude (si se lanzó desde la app de Claude): rompen la autenticación de Claude Code.
for (const k of Object.keys(process.env)) {
  if (k !== "CLAUDE_CODE_OAUTH_TOKEN" && /^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_SDK|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_PREVIEW|ANTHROPIC_BASE_URL|BAGGAGE|AI_AGENT)/.test(k)) delete process.env[k];
}
delete process.env.NEXT_DIST_DIR; // la define solo el servidor web en modo dev

const log = crearLog("local");
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Asegura estas variables en .env.local (sin tocar las demás, p. ej. los números autorizados). */
function ensureEnv(vars) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : [];
  for (const [k, v] of Object.entries(vars)) {
    const line = `${k}="${v}"`;
    const i = lines.findIndex((l) => new RegExp(`^\\s*${k}\\s*=`).test(l));
    if (i >= 0) lines[i] = line;
    else lines.push(line);
  }
  writeFileSync(ENV_FILE, lines.filter((l, i) => l.trim() || i < lines.length - 1).join("\n") + "\n");
}

function run(cmd, cmdArgs, env = {}) {
  execSync([cmd, ...cmdArgs].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" "), { stdio: "inherit", env: { ...process.env, ...env } });
}

/** ¿Hay alguien escuchando en 127.0.0.1:puerto? */
function puertoOcupado(port) {
  return new Promise((ok) => {
    const s = net.connect({ host: "127.0.0.1", port });
    s.setTimeout(1000, () => (s.destroy(), ok(false)));
    s.once("connect", () => (s.destroy(), ok(true)));
    s.once("error", () => ok(false));
  });
}

/** Corta un proceso y todos sus hijos (en Windows, taskkill /T /F). */
function matarArbol(pid) {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
}

let parando = false;
const servicios = [];
let pg = null; // solo si esta copia arrancó la base (entonces la apaga al salir)

/**
 * Un proceso hijo que se vuelve a levantar si se cae. Su salida se muestra con
 * hora y etiqueta. Para apagarlo se le pide por IPC (apagado prolijo) y, si no
 * responde en 8 s, se corta junto con sus hijos.
 */
function servicio(nombre, etiqueta, nodeArgs, env) {
  let hijo = null;
  let espera = null;
  const iniciar = () => {
    espera = null;
    if (parando) return;
    log.info(`▶ ${nombre}`);
    const h = spawn(NODE, nodeArgs, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["inherit", "pipe", "pipe", "ipc"], windowsHide: true });
    const out = prefijador(etiqueta);
    const err = prefijador(etiqueta, process.stderr);
    h.stdout.on("data", out);
    h.stderr.on("data", err);
    h.on("exit", (code, signal) => {
      out.vaciar();
      err.vaciar();
      if (hijo === h) hijo = null;
      if (parando || h.esperado) return;
      const seg = code === 0 ? 3 : 10; // código 0 = se reinició a propósito (p. ej. al guardar la configuración)
      log.warn(`⚠️ ${nombre} se detuvo (código ${code ?? signal}); reinicio en ${seg} s`);
      espera = setTimeout(iniciar, seg * 1000);
    });
    hijo = h;
  };
  const detener = async () => {
    clearTimeout(espera);
    const h = hijo;
    if (!h || h.exitCode !== null || h.signalCode !== null) return;
    h.esperado = true;
    const salio = new Promise((r) => h.once("exit", r));
    try {
      h.send({ tipo: "apagar" });
    } catch {}
    const prolijo = await Promise.race([salio.then(() => true), dormir(8000).then(() => false)]);
    if (!prolijo) {
      log.warn(`${nombre} no respondió; se corta a la fuerza`);
      matarArbol(h.pid);
      await Promise.race([salio, dormir(3000)]);
    }
  };
  const s = { nombre, iniciar, detener, reiniciar: async () => (await detener(), iniciar()) };
  servicios.push(s);
  return s;
}

/** Archivos propios (no node_modules) que usa el conector: worker/ y lo que importa de lib/. */
function archivosDelConector() {
  const resolver = (base) => {
    const sinExt = base.replace(/\.(m?js|m?ts|tsx?)$/, "");
    const candidatos = [base, `${sinExt}.mts`, `${sinExt}.ts`, `${sinExt}.tsx`, `${sinExt}.mjs`, `${sinExt}.js`, join(base, "index.ts"), join(base, "index.tsx")];
    return candidatos.find((c) => existsSync(c) && statSync(c).isFile());
  };
  const vistos = new Set();
  const pila = [join(ROOT, "worker", "whatsapp-baileys.mts")];
  while (pila.length) {
    const f = pila.pop();
    if (vistos.has(f.toLowerCase())) continue;
    vistos.add(f.toLowerCase());
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g)) {
      const spec = m[1];
      const base = spec.startsWith(".") ? resolve(dirname(f), spec) : spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : null;
      const archivo = base && resolver(base);
      if (archivo) pila.push(archivo);
    }
  }
  return vistos;
}

/** Reinicia el conector cuando cambia alguno de sus archivos (con una pausa para agrupar guardados). */
function vigilarConector(conector) {
  let usados = archivosDelConector();
  let timer = null;
  const alCambiar = (carpeta) => (_ev, nombre) => {
    if (!nombre || parando) return;
    const abs = join(ROOT, carpeta, nombre.toString());
    const rel = abs.slice(ROOT.length + 1).replace(/\\/g, "/");
    if (/(^|\/)node_modules\//.test(rel) || !/\.(m?ts|tsx|m?js|json)$/.test(rel)) return;
    if (!rel.startsWith("worker/") && !usados.has(abs.toLowerCase())) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      log.info(`🔄 Cambió ${rel}: reinicio el conector (la sesión de WhatsApp se conserva)`);
      await conector.reiniciar();
      usados = archivosDelConector();
    }, 800);
  };
  for (const carpeta of ["worker", "lib"]) {
    try {
      watch(join(ROOT, carpeta), { recursive: true }, alCambiar(carpeta)).unref();
    } catch (err) {
      log.warn(`No se pudo vigilar ${carpeta}/: ${err.message}`);
    }
  }
}

async function main() {
  log.info(`ObrasFlow local — modo ${MODO === "dev" ? "dev (recarga en caliente)" : "prod (compilado)"}${CON_CONECTOR ? "" : ", sin conector"}`);

  // 0. ¿Ya hay otra copia corriendo? Mejor avisar que pelear por los puertos.
  //    Solo se revisan los puertos de lo que esta copia va a levantar: con --sin-web
  //    el 3000 puede estar ocupado por otra copia de la app y no es problema.
  for (const [port, que] of [...(CON_WEB ? [[APP_PORT, "la app"]] : []), ...(CON_CONECTOR ? [[CONECTOR_PORT, "el conector de WhatsApp"]] : [])]) {
    if (await puertoOcupado(port)) {
      log.error(`El puerto ${port} (${que}) ya está en uso: parece que ObrasFlow ya está corriendo. Cerralo antes de arrancar otra copia.`);
      process.exit(1);
    }
  }

  // 1. Base de datos local. Si ya hay una escuchando en 5433 (p. ej. quedó de un
  //    arranque anterior), se usa esa y no se la apaga al salir.
  if (await puertoOcupado(DB_PORT)) {
    log.info(`PostgreSQL ya estaba corriendo en 127.0.0.1:${DB_PORT}: uso esa (no la apago al salir)`);
  } else {
    const firstRun = !existsSync(join(DB_DIR, "PG_VERSION"));
    mkdirSync(DB_DIR, { recursive: true });
    pg = new EmbeddedPostgres({
      databaseDir: DB_DIR,
      user: DB_USER,
      password: DB_PASS,
      port: DB_PORT,
      persistent: true,
      initdbFlags: ["--encoding=UTF8", "--locale=C"],
      // Los mensajes de rutina de Postgres solo con LOG_LEVEL=debug; los errores, siempre.
      onLog: (m) => (/FATAL|PANIC|ERROR/.test(String(m)) ? log.warn(`postgres: ${String(m).trim()}`) : log.debug(`postgres: ${String(m).trim()}`)),
      onError: (e) => log.error(`postgres: ${String(e?.message ?? e).trim()}`),
    });
    if (firstRun) {
      log.info("Creando la base de datos local (solo la primera vez)…");
      await pg.initialise();
    }
    await pg.start();
    if (firstRun) await pg.createDatabase(DB_NAME);
    pg.firstRun = firstRun;
    log.info(`✅ PostgreSQL local en 127.0.0.1:${DB_PORT}`);
  }

  const baseUrl = `http://localhost:${APP_PORT}`;
  // La IA por defecto es Claude Code; si se cambia desde la pantalla, se respeta lo guardado.
  const hasBackend = existsSync(ENV_FILE) && /^\s*AGENT_BACKEND\s*=/m.test(readFileSync(ENV_FILE, "utf8"));
  // En .env.local solo se guarda la configuración normal (puerto 3000 y base de
  // .local-db/). Con otros puertos o carpetas (pruebas) los valores van solo por
  // variable de entorno, que tiene prioridad sobre .env.local.
  if (APP_PORT === 3000 && !PRUEBA_DB) {
    ensureEnv({
      POSTGRES_PRISMA_URL: DB_URL,
      POSTGRES_URL_NON_POOLING: DB_URL,
      ...(hasBackend ? {} : { AGENT_BACKEND: "cli" }),
      APP_BASE_URL: baseUrl,
    });
  }
  const env = { POSTGRES_PRISMA_URL: DB_URL, POSTGRES_URL_NON_POOLING: DB_URL, APP_BASE_URL: baseUrl, ...(hasBackend ? {} : { AGENT_BACKEND: "cli" }) };

  // Esquema al día (solo agrega lo que falte) y datos de ejemplo la primera vez.
  const prismaCli = join(ROOT, "node_modules", "prisma", "build", "index.js");
  run(NODE, [prismaCli, "db", "push", "--skip-generate"], env);
  // En dev, si el esquema cambió desde el último "prisma generate", se regenera el
  // cliente (en prod lo hace el build). Se hace antes de levantar app y conector,
  // que son los que bloquean sus archivos en Windows.
  if (MODO === "dev") {
    const leer = (f) => (existsSync(f) ? readFileSync(f, "utf8").replace(/\r\n/g, "\n") : "");
    if (leer(join(ROOT, "prisma", "schema.prisma")) !== leer(join(ROOT, "node_modules", ".prisma", "client", "schema.prisma"))) {
      log.info("El esquema de la base cambió: regenero el cliente de Prisma…");
      try {
        run(NODE, [prismaCli, "generate"], env);
      } catch {
        log.warn("No se pudo regenerar el cliente de Prisma (¿otro programa lo tiene abierto?). Cerralo y volvé a arrancar.");
      }
    }
  }
  if (pg?.firstRun) {
    log.info("Cargando obras de ejemplo…");
    run(NODE, [NPM_CLI, "run", "db:seed"], env);
  }

  // 2. App web.
  if (CON_WEB && MODO === "prod") {
    // Compila si no hay build o si el código cambió desde la última.
    const sha = (() => {
      try {
        return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim() + execSync("git status --porcelain", { encoding: "utf8" }).length;
      } catch {
        return "sin-git";
      }
    })();
    const stamp = join(ROOT, ".next", ".obrasflow-local-build");
    if (!existsSync(join(ROOT, ".next", "BUILD_ID")) || !existsSync(stamp) || readFileSync(stamp, "utf8") !== sha) {
      log.info("Compilando la app (tarda un par de minutos)…");
      run(NODE, [NPM_CLI, "run", "build"], env);
      writeFileSync(stamp, sha);
    }
  }
  const web = servicio(`App ObrasFlow (${baseUrl})`, "web", [join(ROOT, "server", "local-server.mjs"), `--${MODO}`, `--port=${APP_PORT}`], env);
  if (CON_WEB) web.iniciar();

  // 3. Conector de WhatsApp (sus librerías de voz van aparte: worker/package.json).
  if (CON_CONECTOR) {
    if (!existsSync(join(ROOT, "worker", "node_modules", "@huggingface", "transformers"))) {
      log.info("Instalando las librerías de notas de voz del conector…");
      try {
        run(NODE, [NPM_CLI, "install", "--prefix", "worker", "--no-audit", "--no-fund"]);
      } catch {
        log.warn("⚠️ No se pudieron instalar; Memby funciona igual, pero sin notas de voz.");
      }
    }
    const apagarPorIpc = pathToFileURL(join(ROOT, "server", "apagar-por-ipc.mjs")).href;
    const conector = servicio(
      `Conector de WhatsApp (http://localhost:${CONECTOR_PORT})`,
      "whatsapp",
      ["--env-file-if-exists=.env.local", "--import", "tsx", "--import", apagarPorIpc, "worker/whatsapp-baileys.mts"],
      env,
    );
    conector.iniciar();
    vigilarConector(conector);
  }

  // Apagado prolijo: primero app y conector (usan la base), después la base.
  const apagar = async (motivo) => {
    if (parando) return;
    parando = true;
    log.info(`Apagando ObrasFlow local (${motivo})…`);
    await Promise.all(servicios.map((s) => s.detener()));
    if (pg) {
      log.info("Deteniendo PostgreSQL…");
      const r = process.platform === "win32" && existsSync(PG_CTL) ? spawnSync(PG_CTL, ["stop", "-D", DB_DIR, "-m", "fast", "-w", "-t", "30"], { stdio: "ignore", windowsHide: true }) : null;
      if (!r || (r.status !== 0 && existsSync(join(DB_DIR, "postmaster.pid")))) await pg.stop().catch(() => {});
    }
    log.info("Listo, todo apagado.");
    process.exit(0);
  };
  process.on("SIGINT", () => apagar("Ctrl+C"));
  process.on("SIGTERM", () => apagar("SIGTERM"));
  process.on("SIGHUP", () => apagar("se cerró la ventana"));
  // Si lo lanza otro programa de Node con canal IPC, puede pedirle el apagado así.
  if (process.send) process.on("message", (m) => m?.tipo === "apagar" && apagar("pedido por IPC"));
}

main().catch(async (err) => {
  log.error({ err }, "❌ No se pudo arrancar el modo local");
  parando = true;
  await Promise.all(servicios.map((s) => s.detener()));
  await pg?.stop().catch(() => {});
  process.exit(1);
});
