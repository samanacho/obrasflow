// Servidor web LOCAL de ObrasFlow: Fastify + Next.js como "custom server".
// Solo para esta PC (escucha en 127.0.0.1). En Vercel no se usa.
//
//   node server/local-server.mjs --dev  [--port 3000]   recarga en caliente (Next dev/HMR)
//   node server/local-server.mjs --prod [--port 3000]   sirve lo compilado en .next/ (npm run build)
//
// Sin --dev/--prod usa OBRASFLOW_MODO (dev|prod); por defecto dev.
// Normalmente lo lanza scripts/local.mjs (npm run local), que además arranca la
// base de datos y el conector de WhatsApp. Necesita la base ya corriendo.
//
// Extras: GET /__salud (estado de app, base y conector) y un log por pedido.
// El modo dev compila en .next-dev/ para no pisar el build de producción de .next/.

import Fastify, { LogController } from "fastify";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { crearLog } from "./log.mjs";

const ROOT = resolve(import.meta.dirname, "..");
process.chdir(ROOT);

const { values: args } = parseArgs({
  options: { dev: { type: "boolean" }, prod: { type: "boolean" }, port: { type: "string" } },
  strict: false,
});
const MODO = args.prod ? "prod" : args.dev ? "dev" : process.env.OBRASFLOW_MODO === "prod" ? "prod" : "dev";
const DEV = MODO === "dev";
const HOST = "127.0.0.1"; // nunca 0.0.0.0: la app no tiene login
const PORT = Number(args.port || process.env.PORT || 3000);
const CONECTOR_PORT = Number(process.env.CONNECTOR_PORT || 3099);

// Sin variables heredadas de una sesión de Claude (si se lanzó desde la app de Claude):
// rompen la autenticación de Claude Code. Mismo filtro que scripts/local.mjs.
for (const k of Object.keys(process.env)) {
  if (k !== "CLAUDE_CODE_OAUTH_TOKEN" && /^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_SDK|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_PREVIEW|ANTHROPIC_BASE_URL|BAGGAGE|AI_AGENT)/.test(k)) delete process.env[k];
}

// Antes de cargar Next: modo y carpeta de compilación.
process.env.NODE_ENV = DEV ? "development" : "production";
if (DEV) process.env.NEXT_DIST_DIR ||= ".next-dev";
else delete process.env.NEXT_DIST_DIR;

const log = crearLog("web");
const inicio = new Date();

if (!DEV && !existsSync(join(ROOT, ".next", "BUILD_ID"))) {
  log.error("No hay app compilada en .next/. Corré 'npm run build' (o usá 'npm run local:prod', que compila solo).");
  process.exit(1);
}

// ---------- Next ----------
const next = (await import("next")).default;
const nextApp = next({ dev: DEV, dir: ROOT, hostname: HOST, port: PORT });
log.info(`Preparando Next en modo ${DEV ? "dev (recarga en caliente)" : "prod (compilado)"}…`);
await nextApp.prepare();
const handle = nextApp.getRequestHandler();

// ---------- Fastify ----------
const app = Fastify({ loggerInstance: log, logController: new LogController({ disableRequestLogging: true }), forceCloseConnections: true });

// Fastify NO lee el cuerpo de los pedidos: se lo pasa intacto a Next (JSON, formularios, archivos).
app.removeAllContentTypeParsers();
app.addContentTypeParser("*", (_req, _payload, done) => done(null));

// Estado de salud: app, base de datos y conector de WhatsApp.
let prisma = null;
async function saludBase() {
  const t0 = performance.now();
  try {
    if (!prisma) {
      const { PrismaClient } = await import("@prisma/client");
      prisma = new PrismaClient();
    }
    await Promise.race([prisma.$queryRaw`SELECT 1`, new Promise((_, no) => setTimeout(() => no(new Error("tardó más de 3 s")), 3000))]);
    return { ok: true, ms: Math.round(performance.now() - t0) };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err).split("\n").filter(Boolean).pop()?.slice(0, 200) };
  }
}
async function saludConector() {
  try {
    const r = await fetch(`http://127.0.0.1:${CONECTOR_PORT}/state`, { signal: AbortSignal.timeout(2000) });
    const s = await r.json();
    return { ok: r.ok && s.status === "conectado", estado: s.status ?? "desconocido" };
  } catch {
    return { ok: false, estado: "no responde" };
  }
}
app.get("/__salud", async (_req, reply) => {
  const [base, conector] = await Promise.all([saludBase(), saludConector()]);
  const ok = base.ok; // el conector es opcional: no marca la app como caída
  reply.header("cache-control", "no-store").code(ok ? 200 : 503);
  return {
    ok,
    modo: MODO,
    app: { ok: true, puerto: PORT, desde: inicio.toISOString(), minutosEncendida: Math.round((Date.now() - inicio) / 60000) },
    base,
    conector,
  };
});

// Todo lo demás lo atiende Next. Log de pedidos solo en prod: en dev Next ya los anota.
const RUIDO = /^\/(_next\/|__nextjs|favicon)/;
app.setNotFoundHandler(async (req, reply) => {
  reply.hijack();
  const t0 = performance.now();
  const { method, url } = req.raw;
  if (!DEV) reply.raw.on("finish", () => {
    const code = reply.raw.statusCode;
    if (RUIDO.test(url) && code < 400) return;
    const linea = `${method} ${url} → ${code} (${Math.round(performance.now() - t0)} ms)`;
    code >= 500 ? log.error(linea) : log.info(linea);
  });
  try {
    await handle(req.raw, reply.raw);
  } catch (err) {
    log.error({ err }, `Falló ${method} ${url}`);
    if (!reply.raw.headersSent) reply.raw.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    reply.raw.end("Error interno del servidor local.");
  }
});

// Nota HMR: el custom server de Next 14 engancha solo el "upgrade" de WebSocket
// (/_next/webpack-hmr) sobre este mismo servidor http en el primer pedido; por
// eso NO se registra otro manejador de upgrade acá (se duplicaría).

// ---------- Apagado prolijo ----------
let cerrando = false;
async function apagar(motivo) {
  if (cerrando) return;
  cerrando = true;
  log.info(`Apagando el servidor web (${motivo})…`);
  setTimeout(() => process.exit(0), 5000).unref();
  await app.close().catch(() => {});
  await nextApp.close?.().catch(() => {});
  await prisma?.$disconnect().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", () => apagar("Ctrl+C"));
process.on("SIGTERM", () => apagar("SIGTERM"));
// En Windows no hay SIGTERM real: el orquestador pide el apagado por IPC, y si
// el orquestador muere de golpe el canal se corta y este proceso se apaga solo.
if (process.send) {
  process.on("message", (m) => m?.tipo === "apagar" && apagar("pedido del orquestador"));
  process.on("disconnect", () => apagar("se cerró el orquestador"));
  process.channel?.unref();
}
process.on("unhandledRejection", (err) => log.error({ err }, "Promesa rechazada sin manejar"));

try {
  await app.listen({ host: HOST, port: PORT });
} catch (err) {
  log.error(err.code === "EADDRINUSE" ? `El puerto ${PORT} ya está en uso (¿otra copia de ObrasFlow corriendo?).` : err.message);
  process.exit(1);
}
log.info(`✅ App ObrasFlow en http://localhost:${PORT} (modo ${MODO}) · salud: http://localhost:${PORT}/__salud`);
