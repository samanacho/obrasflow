#!/usr/bin/env node
// Herramienta de configuración del número de WhatsApp del agente
// (WhatsApp Cloud API de Meta). Gratis: solo usa la Graph API oficial y el
// fetch/crypto que trae Node. Ver docs/WHATSAPP_AGENT.md.
//
// Uso:  npm run wa -- <comando> [opciones]
//
// Lee las variables de .env.local (y .env.whatsapp.local si existe), que git
// ignora. Nunca muestra secretos, salvo el comando "secretos", que justamente
// los genera para que los guardes.

import { createHmac, randomBytes, randomInt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

// ----------------------------------------------------------------- entorno

for (const file of [".env.local", ".env.whatsapp.local"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const env = (k) => process.env[k]?.trim() || "";
const VERSION = env("WHATSAPP_GRAPH_VERSION") || "v25.0";
const GRAPH = `${env("WHATSAPP_GRAPH_BASE") || "https://graph.facebook.com"}/${VERSION}`;
const WEBHOOK_URL = env("WHATSAPP_WEBHOOK_URL") || "https://obrasflow-app.vercel.app/api/whatsapp/webhook";
const TOKEN = env("WHATSAPP_ACCESS_TOKEN");
const PHONE_ID = env("WHATSAPP_PHONE_NUMBER_ID");
const VERIFY = env("WHATSAPP_VERIFY_TOKEN");
const SECRET = env("WHATSAPP_APP_SECRET");
let WABA_ID = env("WHATSAPP_WABA_ID");

const args = process.argv.slice(2);
const cmd = args[0] ?? "ayuda";
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes(`--${name}`);

const OK = "✅", WARN = "⚠️ ", BAD = "❌";
let problems = 0;
const ok = (msg) => console.log(`${OK} ${msg}`);
const warn = (msg) => console.log(`${WARN} ${msg}`);
const bad = (msg) => { problems++; console.log(`${BAD} ${msg}`); };
const hint = (msg) => console.log(`   → ${msg}`);
const mask = (s) => (s ? `…${s.slice(-4)}` : "(vacío)");

// ------------------------------------------------------------- Graph API

/** Qué significa cada error frecuente y qué hacer (docs de Meta: support/error-codes). */
const GRAPH_HINTS = {
  190: "El token venció o no es válido. Generá el token permanente del System User (vencimiento: Nunca) y actualizá WHATSAPP_ACCESS_TOKEN.",
  10: "Al token le faltan permisos: whatsapp_business_messaging, whatsapp_business_management y business_management, con la WABA asignada al System User.",
  200: "Al token le faltan permisos: whatsapp_business_messaging, whatsapp_business_management y business_management, con la WABA asignada al System User.",
  100: "Parámetro o ID inválido: revisá WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_WABA_ID.",
  133005: "PIN incorrecto. Si no lo recordás, cambialo desde WhatsApp Manager (o con POST /{PHONE_NUMBER_ID} {\"pin\":...}).",
  133006: "El número todavía no está verificado: completá el código por SMS o llamada en WhatsApp Manager.",
  133010: "El número no está registrado en Cloud API: corré el comando registrar.",
  133016: "Demasiados intentos de registro: Meta bloquea 72 horas. NO reintentes hasta que pase ese plazo.",
  131030: "Con el número de prueba solo se puede escribir a los destinatarios agregados en API Setup.",
  131042: "Problema con el medio de pago de la cuenta de WhatsApp: revisá la tarjeta en WhatsApp Manager.",
  131047: "Pasaron más de 24 h desde el último mensaje de esa persona: primero tiene que escribirle al número del agente.",
};

async function graph(method, path, body) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    const err = new Error(`${e.message ?? `HTTP ${res.status}`} (código ${e.code ?? res.status}${e.error_subcode ? `/${e.error_subcode}` : ""})`);
    err.code = e.code;
    err.detail = e.error_data?.details;
    throw err;
  }
  return json;
}

function explain(err) {
  bad(err.message);
  if (err.detail) hint(err.detail);
  if (GRAPH_HINTS[err.code]) hint(GRAPH_HINTS[err.code]);
}

function need(...keys) {
  const missing = keys.filter((k) => !env(k) && !(k === "WHATSAPP_WABA_ID" && WABA_ID));
  if (missing.length) {
    bad(`Faltan variables en .env.local: ${missing.join(", ")}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------- comandos

async function checkToken() {
  const r = await graph("GET", `debug_token?input_token=${encodeURIComponent(TOKEN)}`);
  const d = r.data ?? {};
  if (!d.is_valid) return bad("El token no es válido.");
  ok(`Token válido (${mask(TOKEN)}), app ${d.application ?? d.app_id ?? "?"}.`);
  if (d.expires_at && d.expires_at !== 0) {
    warn(`El token VENCE el ${new Date(d.expires_at * 1000).toLocaleString("es-PY")}.`);
    hint("Para producción usá el token del System User con vencimiento \"Nunca\" (expires_at = 0).");
  } else ok("El token no vence.");
  const scopes = d.scopes ?? [];
  for (const s of ["whatsapp_business_messaging", "whatsapp_business_management"]) {
    if (scopes.includes(s)) ok(`Permiso ${s}.`);
    else bad(`Falta el permiso ${s}.`);
  }
  const wabas = (d.granular_scopes ?? []).find((g) => g.scope === "whatsapp_business_management")?.target_ids ?? [];
  if (!WABA_ID && wabas.length === 1) {
    WABA_ID = wabas[0];
    ok(`WABA detectada desde el token: ${WABA_ID} (podés fijarla con WHATSAPP_WABA_ID).`);
  } else if (!WABA_ID && wabas.length > 1) {
    warn(`El token tiene acceso a varias WABAs: ${wabas.join(", ")}. Fijá la del agente en WHATSAPP_WABA_ID.`);
  } else if (WABA_ID && wabas.length && !wabas.includes(WABA_ID)) {
    bad(`El token no tiene acceso a la WABA ${WABA_ID}. Asignala al System User (control total).`);
  }
}

async function checkNumber() {
  const n = await graph(
    "GET",
    `${PHONE_ID}?fields=display_phone_number,verified_name,code_verification_status,name_status,status,quality_rating,throughput,account_mode`
  );
  ok(`Número ${n.display_phone_number} — "${n.verified_name}" (modo ${n.account_mode ?? "?"}).`);
  if (n.code_verification_status && n.code_verification_status !== "VERIFIED") {
    bad(`Verificación del número: ${n.code_verification_status}.`);
    hint("Completá el código por SMS o llamada en WhatsApp Manager > Números de teléfono.");
  }
  if (n.status && n.status !== "CONNECTED") {
    bad(`Estado del número: ${n.status}.`);
    hint("Si no está CONNECTED, registralo: npm run wa -- registrar --pin <PIN> --si");
  } else if (n.status) ok("Número conectado a Cloud API.");
  if (["PENDING_REVIEW", "NONE"].includes(n.name_status)) warn(`Nombre visible en revisión (${n.name_status}): se puede usar igual, con capacidad LIMITED.`);
  if (n.name_status === "DECLINED") bad("Meta rechazó el nombre visible: cambialo en WhatsApp Manager y volvé a registrar el número.");

  const h = await graph("GET", `${PHONE_ID}?fields=health_status`);
  const can = h.health_status?.can_send_message;
  if (can === "AVAILABLE") ok("Salud del número: puede enviar mensajes.");
  else if (can === "LIMITED") warn("Salud del número: LIMITED (suele ser el nombre visible en revisión).");
  else if (can) {
    bad(`Salud del número: ${can}.`);
    for (const e of h.health_status?.entities ?? []) for (const x of e.errors ?? []) hint(`${e.entity_type}: ${x.error_description} — ${x.possible_solution ?? ""}`);
  }

  const w = await graph("GET", `${PHONE_ID}?fields=webhook_configuration`);
  const url = w.webhook_configuration?.phone_number || w.webhook_configuration?.whatsapp_business_account || w.webhook_configuration?.application;
  if (url === WEBHOOK_URL) ok(`Meta manda los mensajes a ${url}.`);
  else {
    bad(`Meta manda los mensajes a "${url ?? "(ninguna URL)"}", no a ${WEBHOOK_URL}.`);
    hint("App Dashboard > WhatsApp > Configuración > Webhook: Callback URL + Verify token, y suscribí el campo messages.");
  }
}

async function checkSubscription() {
  if (!WABA_ID) return warn("Sin WHATSAPP_WABA_ID no puedo revisar la suscripción de la app a la WABA.");
  const s = await graph("GET", `${WABA_ID}/subscribed_apps`);
  if (s.data?.length) ok(`La app está suscripta a la WABA (${s.data.map((a) => a.whatsapp_business_api_data?.name ?? "?").join(", ")}).`);
  else {
    bad("La app NO está suscripta a la WABA: el webhook no va a recibir mensajes de este número.");
    hint("npm run wa -- suscribir --si");
  }
}

async function checkWebhook() {
  if (!VERIFY) bad("Falta WHATSAPP_VERIFY_TOKEN en .env.local (tiene que ser el mismo que en Vercel y en Meta).");
  else {
    const challenge = String(randomInt(100000, 999999));
    const good = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY)}&hub.challenge=${challenge}`);
    const text = await good.text();
    if (good.status === 200 && text === challenge) ok("Handshake del webhook: responde el challenge con el verify token.");
    else if (good.status === 503) {
      bad("El webhook responde 503: en Vercel falta WHATSAPP_VERIFY_TOKEN (o falta el Redeploy).");
    } else {
      bad(`Handshake del webhook: HTTP ${good.status}. El verify token de .env.local no coincide con el de Vercel.`);
    }
    const wrong = await fetch(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=no-es-el-token&hub.challenge=1`);
    if (wrong.status === 403) ok("Con un verify token incorrecto el webhook rechaza (403).");
    else if (wrong.status !== 503) bad(`Con un verify token incorrecto el webhook respondió ${wrong.status} (se esperaba 403).`);
  }

  if (!SECRET) return bad("Falta WHATSAPP_APP_SECRET en .env.local.");
  // Mensaje firmado que no dispara nada (phone_number_id "0", sin mensajes).
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "0", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "0", phone_number_id: "0" }, messages: [] } }] }],
  });
  const sig = "sha256=" + createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
  const post = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig }, body });
  if (post.status === 200) ok("POST firmado con el App Secret: aceptado (el App Secret de Vercel es el correcto).");
  else if (post.status === 503) bad("El POST del webhook responde 503: en Vercel falta alguna de WHATSAPP_APP_SECRET / ACCESS_TOKEN / PHONE_NUMBER_ID (o el Redeploy).");
  else if (post.status === 401) bad("El webhook rechazó la firma: el WHATSAPP_APP_SECRET de Vercel no es el de App settings > Basic.");
  else bad(`POST firmado: HTTP ${post.status}.`);
  const forged = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=" + "0".repeat(64) }, body });
  if (forged.status === 401) ok("Un POST con firma falsa se rechaza (401).");
  else if (forged.status !== 503) bad(`Un POST con firma falsa respondió ${forged.status} (se esperaba 401).`);
}

async function step(label, fn) {
  console.log(`\n— ${label}`);
  try {
    await fn();
  } catch (err) {
    explain(err);
  }
}

const commands = {
  async secretos() {
    console.log("Guardalos en un gestor de contraseñas (no en un chat ni en el repo):\n");
    console.log(`WHATSAPP_VERIFY_TOKEN=${randomBytes(32).toString("hex")}`);
    console.log(`PIN de verificación en dos pasos (6 dígitos): ${String(randomInt(0, 1_000_000)).padStart(6, "0")}`);
    console.log("\nEl verify token va en .env.local, en Vercel y en Meta (Webhook). El PIN se usa en \"registrar\" y hace falta para mover o borrar el número más adelante.");
  },

  async revisar() {
    console.log(`Revisando la configuración (Graph API ${VERSION}, webhook ${WEBHOOK_URL})`);
    await step("Webhook en Vercel", checkWebhook);
    if (!TOKEN) {
      warn("Sin WHATSAPP_ACCESS_TOKEN solo se revisó el webhook.");
    } else {
      await step("Token de acceso", checkToken);
      if (PHONE_ID) await step("Número del agente", checkNumber);
      else warn("Sin WHATSAPP_PHONE_NUMBER_ID no puedo revisar el número.");
      await step("Suscripción de la app a la WABA", checkSubscription);
    }
    console.log(problems ? `\n${BAD} ${problems} problema(s) para resolver.` : `\n${OK} Todo en orden. Escribile al número del agente desde un número autorizado.`);
    process.exitCode = problems ? 1 : 0;
  },

  async numeros() {
    need("WHATSAPP_ACCESS_TOKEN");
    if (!WABA_ID) await checkToken();
    need("WHATSAPP_WABA_ID");
    const r = await graph("GET", `${WABA_ID}/phone_numbers?fields=id,display_phone_number,verified_name,code_verification_status,name_status,status,quality_rating`);
    if (!r.data?.length) return warn("La WABA no tiene números.");
    for (const n of r.data) {
      console.log(`• ${n.display_phone_number}  "${n.verified_name}"  → WHATSAPP_PHONE_NUMBER_ID=${n.id}`);
      console.log(`  verificación ${n.code_verification_status ?? "?"} · estado ${n.status ?? "?"} · nombre ${n.name_status ?? "?"} · calidad ${n.quality_rating ?? "?"}`);
    }
  },

  async registrar() {
    need("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID");
    const pin = opt("pin");
    if (!/^\d{6}$/.test(pin ?? "")) return bad("Pasá el PIN de 6 dígitos: npm run wa -- registrar --pin 123456 --si");
    if (!flag("si")) {
      warn(`Esto registra el número ${PHONE_ID} en Cloud API con ese PIN (verificación en dos pasos).`);
      hint("Meta permite 10 intentos cada 72 h: este comando nunca reintenta solo.");
      hint("Si está todo bien, repetilo agregando --si");
      return;
    }
    try {
      const r = await graph("POST", `${PHONE_ID}/register`, { messaging_product: "whatsapp", pin });
      if (r.success) ok("Número registrado. Guardá el PIN: se necesita para mover o borrar el número.");
      else bad(`Respuesta inesperada: ${JSON.stringify(r)}`);
    } catch (err) {
      explain(err);
    }
  },

  async suscribir() {
    need("WHATSAPP_ACCESS_TOKEN");
    if (!WABA_ID) await checkToken();
    need("WHATSAPP_WABA_ID");
    if (!flag("si")) {
      warn(`Esto suscribe la app a la WABA ${WABA_ID} para recibir sus mensajes (y quita cualquier URL de webhook propia de esa WABA).`);
      hint("Repetilo agregando --si");
      return;
    }
    try {
      const r = await graph("POST", `${WABA_ID}/subscribed_apps`);
      if (r.success) ok("App suscripta a la WABA.");
      else bad(`Respuesta inesperada: ${JSON.stringify(r)}`);
    } catch (err) {
      explain(err);
    }
  },

  async "probar-envio"() {
    need("WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID");
    const to = (opt("a") ?? "").replace(/\D/g, "");
    if (!to) return bad("Indicá el destinatario: npm run wa -- probar-envio --a 595981123456 --si");
    if (!flag("si")) {
      warn(`Esto manda un texto de prueba a ${to}. Solo funciona si esa persona le escribió al número del agente en las últimas 24 h.`);
      hint("Desde el 1/10/2026 Meta cobra los mensajes de respuesta (hay un cupo gratis mensual). Repetilo agregando --si");
      return;
    }
    try {
      const r = await graph("POST", `${PHONE_ID}/messages`, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: "✅ Prueba de configuración de ObrasFlow: el número del agente puede enviar mensajes." },
      });
      ok(`Meta aceptó el envío (id ${r.messages?.[0]?.id ?? "?"}). Fijate que llegue al teléfono.`);
    } catch (err) {
      explain(err);
    }
  },

  async ayuda() {
    console.log(`Configuración del número de WhatsApp del agente — ver docs/WHATSAPP_AGENT.md

  npm run wa -- secretos                         genera el verify token y el PIN de 6 dígitos
  npm run wa -- revisar                          revisa todo (webhook, token, número, suscripción) y dice qué falta
  npm run wa -- numeros                          lista los números de la WABA con su WHATSAPP_PHONE_NUMBER_ID
  npm run wa -- registrar --pin 123456 [--si]    registra el número en Cloud API (obligatorio, una vez)
  npm run wa -- suscribir [--si]                 suscribe la app a la WABA (para recibir sus mensajes)
  npm run wa -- probar-envio --a 5959... [--si]  manda un texto de prueba

Variables (en .env.local, que git ignora): WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID,
WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET y, opcionales, WHATSAPP_WABA_ID (se detecta desde el
token), WHATSAPP_WEBHOOK_URL (default: producción) y WHATSAPP_GRAPH_VERSION (default: v25.0).
Los comandos que cambian algo en Meta piden --si para ejecutarse.`);
  },
};
commands.check = commands.revisar;
commands.help = commands.ayuda;

const run = commands[cmd];
if (!run) {
  bad(`Comando desconocido: ${cmd}`);
  await commands.ayuda();
  process.exit(1);
}
await run();
