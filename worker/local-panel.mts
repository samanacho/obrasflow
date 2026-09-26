// Página de configuración del conector, SOLO en esta PC
// (http://localhost:3099). Muestra el QR para vincular WhatsApp y permite
// cargar la clave de Claude y los números autorizados, que se guardan en
// .env.local. Nada de esto se publica en Vercel ni sale de la PC.
//
// Seguridad: escucha solo en 127.0.0.1, rechaza cualquier Host que no sea
// localhost (evita DNS rebinding) y los POST de otros orígenes.

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const PORT = Number(process.env.CONNECTOR_PORT || 3099);
const ENV_FILE = resolve(process.cwd(), ".env.local");
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const MODELS = ["claude-sonnet-5", "claude-opus-5-5", "claude-haiku-4-5"];
const CLI_MODELS = ["sonnet", "opus", "haiku"];
const APP_PAGE = `${process.env.APP_BASE_URL?.trim() || "http://localhost:3000"}/agente-whatsapp`;
const EFFORTS = ["low", "medium", "high"];
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

interface Deps {
  local: { status: string; qr: string | null; phone: string | null; name: string | null; lastError: string | null; info: Record<string, unknown> | null };
  runCommand: (c: "logout" | "restart") => Promise<void>;
  reportInfo: () => Promise<void>;
  sendToSelf: (text: string) => Promise<void>;
  sendMediaToSelf: (file: { data: Buffer; mimeType: string; fileName: string; caption: string }) => Promise<void>;
  dbConfigured: boolean;
}

/** Actualiza (o agrega) una variable en .env.local y en el proceso, sin tocar las demás. */
function setEnv(key: string, value: string) {
  const line = `${key}="${value.replace(/["\\\r\n]/g, "")}"`;
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : [];
  const i = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  if (i >= 0) lines[i] = line;
  else lines.push(line);
  writeFileSync(ENV_FILE, lines.filter((l, idx) => l.trim() || idx < lines.length - 1).join("\n") + "\n");
  process.env[key] = value;
}

function readBody(req: IncomingMessage, max = 20_000): Promise<any> {
  return new Promise((ok) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > max) req.destroy();
    });
    req.on("end", () => {
      try {
        ok(JSON.parse(raw || "{}"));
      } catch {
        ok({});
      }
    });
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function allowedList() {
  return (process.env.WHATSAPP_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export function startLocalPanel(deps: Deps): Promise<string> {
  const server = createServer(async (req, res) => {
    if (!ALLOWED_HOSTS.has(String(req.headers.host))) return json(res, 403, { error: "forbidden" });
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (req.method === "POST") {
      const origin = req.headers.origin;
      if (origin && !ALLOWED_HOSTS.has(origin.replace(/^https?:\/\//, ""))) return json(res, 403, { error: "forbidden" });
    }

    if (req.method === "GET" && url.pathname === "/") {
      // La configuración se hace en la pantalla Agente WhatsApp de la app local.
      res.writeHead(302, { Location: APP_PAGE });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/state") {
      return json(res, 200, {
        ...deps.local,
        aiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
        cliMode: process.env.AGENT_BACKEND?.trim() === "cli",
        backend: process.env.AGENT_BACKEND?.trim() === "api" ? "api" : "cli",
        cliModel: process.env.CLAUDE_CLI_MODEL?.trim() || "haiku",
        selfMode: Boolean((deps.local.info as { selfMode?: boolean } | null)?.selfMode),
        model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5",
        effort: process.env.ANTHROPIC_EFFORT?.trim() || "medium",
        allowed: allowedList(),
        dbConfigured: deps.dbConfigured,
        envFile: ENV_FILE,
      });
    }
    if (req.method === "POST" && url.pathname === "/config") {
      const b = await readBody(req);
      let restart = false;
      try {
        if (typeof b.dbUrl === "string" && b.dbUrl.trim()) {
          const url = b.dbUrl.trim().replace(/^psql\s+/, "").replace(/^['"]|['"]$/g, "");
          if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("La URL de la base tiene que empezar con postgresql:// o postgres://");
          const { PrismaClient } = await import("@prisma/client");
          const test = new PrismaClient({ datasources: { db: { url } } });
          try {
            await test.$queryRawUnsafe("SELECT 1");
            await test.whatsAppSession.count();
          } catch (err) {
            throw new Error("No pude conectarme a esa base: " + ((err as Error).message.split("\n").filter(Boolean).pop() ?? "").slice(0, 200));
          } finally {
            await test.$disconnect().catch(() => {});
          }
          setEnv("POSTGRES_PRISMA_URL", url);
          setEnv("POSTGRES_URL_NON_POOLING", url);
          restart = true;
        }
      if (typeof b.anthropicKey === "string" && b.anthropicKey.trim()) {
        const k = b.anthropicKey.trim();
        if (!/^sk-ant-[\w-]{20,}$/.test(k)) return json(res, 400, { error: "Eso no parece una clave de Anthropic (empieza con sk-ant-)." });
        setEnv("ANTHROPIC_API_KEY", k);
      }
      if (typeof b.allowed === "string") {
        const entries = b.allowed
          .split(/[\n,]/)
          .map((l: string) => l.trim())
          .filter(Boolean)
          .map((l: string) => {
            const m = /^([+\d\s()-]+)\s*[:\-–]\s*(.+)$/.exec(l);
            if (!m) throw new Error(`Formato inválido: "${l}". Usá: 595981123456: Nombre Apellido`);
            let d = m[1].replace(/\D/g, "");
            if (d.startsWith("00")) d = d.slice(2);
            if (d.startsWith("0")) d = "595" + d.slice(1);
            if (d.startsWith("5950")) d = "595" + d.slice(4);
            if (d.length < 11) throw new Error(`El número "${m[1].trim()}" está incompleto (tiene que tener código de país, ej. 595981123456).`);
            return `${d}:${m[2].trim().replace(/[:,"]/g, "")}`;
          });
        setEnv("WHATSAPP_ALLOWED_NUMBERS", entries.join(","));
      }
      if (typeof b.model === "string" && MODELS.includes(b.model)) setEnv("ANTHROPIC_MODEL", b.model);
      if (typeof b.cliModel === "string" && CLI_MODELS.includes(b.cliModel)) setEnv("CLAUDE_CLI_MODEL", b.cliModel);
      if (b.backend === "api" || b.backend === "cli") {
        if (b.backend === "api" && !process.env.ANTHROPIC_API_KEY?.trim()) throw new Error("Para usar la API primero cargá la clave de Anthropic.");
        setEnv("AGENT_BACKEND", b.backend);
      }
      if (typeof b.effort === "string" && EFFORTS.includes(b.effort)) setEnv("ANTHROPIC_EFFORT", b.effort);
      } catch (err) {
        return json(res, 400, { error: (err as Error).message });
      }
      if (restart) {
        // La base se toma al arrancar: el lanzador (scripts/start-conector.cmd) lo vuelve a levantar solo.
        deps.local.status = "reiniciando";
        json(res, 200, { ok: true, restarting: true });
        setTimeout(() => process.exit(0), 800);
        return;
      }
      await deps.reportInfo();
      return json(res, 200, { ok: true, info: deps.local.info });
    }
    if (req.method === "POST" && url.pathname === "/send") {
      const b = await readBody(req);
      const text = typeof b.text === "string" ? b.text.trim() : "";
      if (!text) return json(res, 400, { error: "Mensaje vacío." });
      if (text.length > 2000) return json(res, 400, { error: "El mensaje es demasiado largo." });
      try {
        await deps.sendToSelf(text);
        return json(res, 200, { ok: true });
      } catch (err) {
        return json(res, 409, { error: (err as Error).message });
      }
    }
    if (req.method === "POST" && url.pathname === "/send-media") {
      // Foto o PDF elegido en el chat de la pantalla (base64, hasta 4 MB).
      const b = await readBody(req, 6_000_000);
      const mimeType = typeof b.mimeType === "string" ? b.mimeType : "";
      if (!MEDIA_TYPES.includes(mimeType)) return json(res, 400, { error: "Solo fotos (JPG, PNG, WEBP) o PDF." });
      const data = typeof b.data === "string" ? Buffer.from(b.data, "base64") : null;
      if (!data?.length) return json(res, 400, { error: "No llegó el archivo." });
      if (data.length > 4 * 1024 * 1024) return json(res, 400, { error: "El archivo pesa más de 4 MB." });
      const fileName = typeof b.fileName === "string" ? b.fileName.replace(/[\\/:*?"<>|\r\n]/g, "").slice(0, 120) : "";
      const caption = typeof b.caption === "string" ? b.caption.trim().slice(0, 1000) : "";
      try {
        await deps.sendMediaToSelf({ data, mimeType, fileName, caption });
        return json(res, 200, { ok: true });
      } catch (err) {
        return json(res, 409, { error: (err as Error).message });
      }
    }
    if (req.method === "POST" && url.pathname === "/command") {
      const b = await readBody(req);
      if (b.command !== "logout" && b.command !== "restart") return json(res, 400, { error: "Pedido desconocido." });
      await deps.runCommand(b.command);
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: "not found" });
  });
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(PORT, "127.0.0.1", () => ok(`http://localhost:${PORT}`));
  });
}
