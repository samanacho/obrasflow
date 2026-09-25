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
const EFFORTS = ["low", "medium", "high"];

interface Deps {
  local: { status: string; qr: string | null; phone: string | null; name: string | null; lastError: string | null; info: Record<string, unknown> | null };
  runCommand: (c: "logout" | "restart") => Promise<void>;
  reportInfo: () => Promise<void>;
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

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((ok) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 20_000) req.destroy();
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
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(PAGE);
    }
    if (req.method === "GET" && url.pathname === "/state") {
      return json(res, 200, {
        ...deps.local,
        aiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
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

const PAGE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conector WhatsApp · ObrasFlow</title>
<style>
:root{--bg:#f5f2ec;--card:#fff;--ink:#2a2622;--soft:#6f675e;--line:#e2dcd2;--ok:#5f8362;--warn:#a67d3f;--crit:#a0564d;--acc:#3d5a80}
@media (prefers-color-scheme:dark){:root{--bg:#1d1b19;--card:#262320;--ink:#ece6dc;--soft:#a79e92;--line:#3a3530;--ok:#8fb491;--warn:#d9b679;--crit:#c98980;--acc:#8fb0d9}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px}h1{font-size:1.5rem;margin:0 0 4px}p.sub{color:var(--soft);margin:0 0 20px;font-size:.9rem}
.grid{display:grid;grid-template-columns:1.2fr 1fr;gap:16px}@media(max-width:760px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px}.card h2{font-size:1rem;margin:0 0 12px}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:.8rem;font-weight:600;color:#fff}
.b-ok{background:var(--ok)}.b-warn{background:var(--warn)}.b-crit{background:var(--crit)}.b-soft{background:var(--soft)}
.qr{background:#fff;padding:10px;border-radius:10px;width:280px;height:280px;display:block}
label{display:block;font-size:.85rem;color:var(--soft);margin:12px 0 4px}input,textarea,select{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font:inherit}
textarea{min-height:76px}button{margin-top:12px;padding:8px 14px;border-radius:8px;border:1px solid var(--acc);background:var(--acc);color:#fff;font:inherit;cursor:pointer}
button.ghost{background:transparent;color:var(--acc)}button.danger{border-color:var(--crit);background:transparent;color:var(--crit)}
.msg{margin-top:10px;font-size:.88rem}.row{display:flex;gap:8px;flex-wrap:wrap}ol{padding-left:20px;margin:8px 0}small{color:var(--soft)}
</style></head><body><main>
<h1>💬 Conector de WhatsApp</h1>
<p class="sub">Solo en esta PC. Lo que cargás acá se guarda en <code id="envfile">.env.local</code> y no se publica en ningún lado.</p>
<div class="grid">
  <section class="card"><h2>Conexión <span id="badge" class="badge b-soft">…</span></h2><div id="conn">Consultando…</div></section>
  <section class="card">
    <h2>Configuración</h2>
    <form id="cfg">
      <label for="db">Base de datos de ObrasFlow (URL de Postgres) <span id="dbst"></span></label>
      <input id="db" type="password" autocomplete="off" placeholder="postgresql://… (dejalo vacío para no cambiarla)">
      <small>Está en Vercel › proyecto obrasflow-app › <b>Storage</b> › tu base › pestaña <b>.env.local</b> › <b>Show secret</b>: copiá el valor de <code>POSTGRES_PRISMA_URL</code> (o de <code>DATABASE_URL</code>).</small>
      <label for="key">Clave de Claude (API key) <span id="keyst"></span></label>
      <input id="key" type="password" autocomplete="off" placeholder="sk-ant-… (dejalo vacío para no cambiarla)">
      <label for="allowed">Números autorizados (uno por línea: número: nombre)</label>
      <textarea id="allowed" placeholder="595981123456: Ignacio Samaniego&#10;595982123456: Hugo Rotela"></textarea>
      <div class="row">
        <div style="flex:1"><label for="model">Modelo</label><select id="model"><option>claude-sonnet-5</option><option>claude-opus-5-5</option><option>claude-haiku-4-5</option></select></div>
        <div style="flex:1"><label for="effort">Esfuerzo</label><select id="effort"><option>low</option><option>medium</option><option>high</option></select></div>
      </div>
      <button type="submit">Guardar</button>
      <div id="cfgmsg" class="msg"></div>
    </form>
    <div id="ai" class="msg"></div>
  </section>
</div>
<script>
const $=id=>document.getElementById(id);let loaded=false;
async function refresh(){
  try{
    const s=await (await fetch('/state',{cache:'no-store'})).json();
    $('envfile').textContent=s.envFile;
    const st={conectado:['Conectado','b-ok'],esperando_qr:['Esperando QR','b-warn'],conectando:['Conectando','b-soft'],desconectado:['Desconectado','b-crit']}[s.status]||[s.status,'b-soft'];
    $('badge').textContent=st[0];$('badge').className='badge '+st[1];
    let h='';
    if(s.status==='esperando_qr'&&s.qr){h='<img class="qr" src="'+s.qr+'" alt="QR"><ol><li>Abrí <b>WhatsApp Business</b> en el teléfono del número del agente.</li><li><b>⋮</b> (Android) o <b>Configuración</b> (iPhone) › <b>Dispositivos vinculados</b>.</li><li><b>Vincular un dispositivo</b> y escaneá este código.</li></ol><small>Se renueva solo cada ~20 s. La app del teléfono sigue funcionando normal.</small>';}
    else if(s.status==='conectado'){h='<p>✅ Conectado como <b>'+(s.name||'')+'</b> (+'+(s.phone||'')+'). El agente responde a los números autorizados.</p><div class="row"><button class="ghost" onclick="cmd(\\'restart\\')">Reiniciar conexión</button><button class="danger" onclick="if(confirm(\\'¿Desvincular? El agente deja de responder hasta escanear un QR nuevo.\\'))cmd(\\'logout\\')">Desvincular</button></div>';}
    else if(s.status==='falta_base')h='<p>⚙️ Falta la <b>base de datos</b>: cargala a la derecha y tocá Guardar. El conector se reinicia solo y enseguida aparece el QR acá.</p>';
    else if(s.status==='reiniciando')h='<p>🔄 Reiniciando el conector (unos 20 s)…</p>';
    else h='<p>⏳ Conectando con WhatsApp…</p>';
    if(s.lastError&&s.status!=='conectado')h+='<p class="msg" style="color:var(--warn)">'+s.lastError+'</p>';
    $('conn').innerHTML=h;
    $('keyst').textContent=s.aiKeyConfigured?'✅ cargada':'— falta';
    $('dbst').textContent=s.dbConfigured?'✅ conectada':'— falta (primero esto)';
    const ai=s.info&&s.info.ai;$('ai').innerHTML=ai?(ai.ok?'✅ ':'❌ ')+ai.detail+' · '+(s.info.allowedCount||0)+' número(s) autorizado(s)':'';
    if(!loaded){$('allowed').value=s.allowed.map(e=>e.replace(':',': ')).join('\\n');$('model').value=s.model;$('effort').value=s.effort;loaded=true;}
  }catch(e){$('conn').textContent='El conector no responde.';}
}
async function cmd(c){await fetch('/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:c})});setTimeout(refresh,1500);}
$('cfg').addEventListener('submit',async e=>{e.preventDefault();$('cfgmsg').textContent='Guardando…';
  const r=await fetch('/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dbUrl:$('db').value,anthropicKey:$('key').value,allowed:$('allowed').value,model:$('model').value,effort:$('effort').value})});
  const j=await r.json().catch(()=>({}));$('cfgmsg').textContent=r.ok?(j.restarting?'✅ Base conectada. Reiniciando el conector (unos 20 s)…':'✅ Guardado.'):'❌ '+(j.error||'No se pudo guardar.');if(r.ok){$('key').value='';$('db').value='';}refresh();});
refresh();setInterval(refresh,3000);
</script></main></body></html>`;
