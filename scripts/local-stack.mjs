// ObrasFlow completo en esta PC (modo local de prueba):
//   1. PostgreSQL local (embedded-postgres, datos en .local-db/, solo 127.0.0.1)
//   2. La app web en http://localhost:3000 (next start, compila si hace falta)
//   3. El conector de WhatsApp (Baileys + Claude Code) en http://localhost:3099
// Si algo se cae, lo vuelve a levantar. Lo arranca scripts/start-conector.cmd
// (acceso en la carpeta Inicio de Windows). Uso manual: npm run local
//
// No usa Vercel ni claves de API: la IA corre con la sesión de Claude Code de
// esta PC y la base es local. WhatsApp sí sale a internet.

import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const ROOT = resolve(import.meta.dirname, "..");
process.chdir(ROOT);
const DB_DIR = join(ROOT, ".local-db");
const DB_PORT = 5433;
const DB_USER = "obrasflow";
const DB_PASS = "obrasflow-local";
const DB_NAME = "obrasflow";
const DB_URL = `postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${DB_PORT}/${DB_NAME}`;
const APP_PORT = 3000;
const ENV_FILE = join(ROOT, ".env.local");
const NODE = process.execPath;
const NPM_CLI = join(NODE, "..", "node_modules", "npm", "bin", "npm-cli.js");

// Sin variables heredadas de una sesión de Claude (si se lanzó desde la app de Claude): rompen la autenticación de Claude Code.
for (const k of Object.keys(process.env)) {
  if (k !== "CLAUDE_CODE_OAUTH_TOKEN" && /^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_SDK|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_PREVIEW|ANTHROPIC_BASE_URL|BAGGAGE|AI_AGENT)/.test(k)) delete process.env[k];
}

const log = (...a) => console.log(`[${new Date().toLocaleTimeString("es-PY")}]`, ...a);

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

function run(cmd, args, env = {}) {
  execSync([cmd, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" "), { stdio: "inherit", env: { ...process.env, ...env } });
}

/** Lanza un proceso y lo vuelve a levantar si se cae. */
function keepAlive(name, args, env = {}) {
  const start = () => {
    log(`▶ ${name}`);
    const p = spawn(NODE, args, { stdio: "inherit", env: { ...process.env, ...env } });
    p.on("exit", (code) => {
      if (stopping) return;
      log(`⚠️ ${name} se detuvo (código ${code}); reinicio en 10 s`);
      setTimeout(start, 10_000);
    });
    children.push(p);
  };
  start();
}

let stopping = false;
const children = [];

async function main() {
  // 1. Base de datos local
  const firstRun = !existsSync(join(DB_DIR, "PG_VERSION"));
  mkdirSync(DB_DIR, { recursive: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DB_DIR,
    user: DB_USER,
    password: DB_PASS,
    port: DB_PORT,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
  });
  if (firstRun) {
    log("Creando la base de datos local (solo la primera vez)…");
    await pg.initialise();
  }
  await pg.start();
  if (firstRun) await pg.createDatabase(DB_NAME);
  log(`✅ PostgreSQL local en 127.0.0.1:${DB_PORT}`);

  // La IA por defecto es Claude Code; si se cambia desde la pantalla, se respeta lo guardado.
  const hasBackend = existsSync(ENV_FILE) && /^s*AGENT_BACKENDs*=/m.test(readFileSync(ENV_FILE, "utf8"));
  ensureEnv({
    POSTGRES_PRISMA_URL: DB_URL,
    POSTGRES_URL_NON_POOLING: DB_URL,
    ...(hasBackend ? {} : { AGENT_BACKEND: "cli" }),
    APP_BASE_URL: `http://localhost:${APP_PORT}`,
  });
  const env = { POSTGRES_PRISMA_URL: DB_URL, POSTGRES_URL_NON_POOLING: DB_URL, APP_BASE_URL: `http://localhost:${APP_PORT}` };

  // Esquema al día (solo agrega lo que falte) y datos de ejemplo la primera vez.
  run(NODE, [join(ROOT, "node_modules", "prisma", "build", "index.js"), "db", "push", "--skip-generate"], env);
  if (firstRun) {
    log("Cargando obras de ejemplo…");
    run(NODE, [NPM_CLI, "run", "db:seed"], env);
  }

  // 2. App web: compila si no hay build o si el código cambió desde la última.
  const sha = (() => {
    try {
      return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim() + execSync("git status --porcelain", { encoding: "utf8" }).length;
    } catch {
      return "sin-git";
    }
  })();
  const stamp = join(ROOT, ".next", ".obrasflow-local-build");
  if (!existsSync(join(ROOT, ".next", "BUILD_ID")) || !existsSync(stamp) || readFileSync(stamp, "utf8") !== sha) {
    log("Compilando la app (tarda un par de minutos)…");
    run(NODE, [NPM_CLI, "run", "build"], env);
    writeFileSync(stamp, sha);
  }
  keepAlive("App ObrasFlow (http://localhost:3000)", [join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], env);

  // 3. Conector de WhatsApp (sus librerías de voz van aparte: worker/package.json).
  if (!existsSync(join(ROOT, "worker", "node_modules", "@huggingface", "transformers"))) {
    log("Instalando las librerías de notas de voz del conector…");
    try {
      run(NODE, [NPM_CLI, "install", "--prefix", "worker", "--no-audit", "--no-fund"]);
    } catch {
      log("⚠️ No se pudieron instalar; Memby funciona igual, pero sin notas de voz.");
    }
  }
  keepAlive("Conector de WhatsApp (http://localhost:3099)", ["--env-file-if-exists=.env.local", "--import", "tsx", "worker/whatsapp-baileys.mts"], env);

  const stop = async () => {
    stopping = true;
    for (const c of children) c.kill();
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error("❌ No se pudo arrancar el modo local:", err);
  process.exit(1);
});
