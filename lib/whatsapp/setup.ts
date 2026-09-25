import { timingSafeEqual } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../prisma";
import { getAllowedNumbers, getWhatsAppConfig, normalizePhone } from "./config";
import { sendText } from "./client";

// Servidor únicamente. Diagnóstico y acciones de configuración del agente de
// WhatsApp para el módulo /agente-whatsapp (mismo criterio que
// scripts/whatsapp-setup.mjs, pero corriendo en Vercel con sus variables).
// Nunca devuelve el valor de un secreto: solo si está cargado y si funciona.

export type CheckStatus = "ok" | "warn" | "error" | "skip";
export interface Check {
  id: string;
  group: "Meta" | "Claude";
  label: string;
  status: CheckStatus;
  detail?: string;
  hint?: string;
}

const env = (k: string) => process.env[k]?.trim() || "";
const graphVersion = () => env("WHATSAPP_GRAPH_VERSION") || "v25.0";
const GRAPH = () => `https://graph.facebook.com/${graphVersion()}`;
export const DEFAULT_MODEL = "claude-sonnet-5";
const agentModel = () => env("ANTHROPIC_MODEL") || DEFAULT_MODEL;
const agentEffort = () => env("ANTHROPIC_EFFORT") || "medium";

/** Qué significa cada error frecuente de la Graph API y qué hacer (docs de Meta: support/error-codes). */
const GRAPH_HINTS: Record<number, string> = {
  190: "El token venció o no es válido: generá el token permanente del System User (vencimiento: Nunca) y actualizá WHATSAPP_ACCESS_TOKEN en Vercel.",
  10: "Al token le faltan permisos (whatsapp_business_messaging, whatsapp_business_management, business_management) o la WABA no está asignada al System User.",
  200: "Al token le faltan permisos (whatsapp_business_messaging, whatsapp_business_management, business_management) o la WABA no está asignada al System User.",
  100: "Parámetro o ID inválido: revisá WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_WABA_ID.",
  133005: "PIN incorrecto. Si no lo recordás, cambialo desde WhatsApp Manager.",
  133006: "El número todavía no está verificado: completá el código por SMS o llamada en WhatsApp Manager.",
  133010: "El número no está registrado en Cloud API: usá \"Registrar número\".",
  133016: "Demasiados intentos de registro: Meta bloquea 72 horas. No reintentes hasta que pase ese plazo.",
  131030: "Con el número de prueba solo se puede escribir a los destinatarios agregados en API Setup.",
  131042: "Problema con el medio de pago de la cuenta de WhatsApp en Meta.",
  131047: "Pasaron más de 24 h desde el último mensaje de esa persona: primero tiene que escribirle al número del agente.",
};

class GraphError extends Error {
  constructor(message: string, public code?: number, public detail?: string) {
    super(message);
  }
}

async function graph(method: "GET" | "POST", path: string, opts: { token?: string; body?: unknown } = {}) {
  const token = opts.token ?? env("WHATSAPP_ACCESS_TOKEN");
  const res = await fetch(`${GRAPH()}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || json?.error) {
    const e = json?.error ?? {};
    throw new GraphError(`${e.message ?? `HTTP ${res.status}`} (código ${e.code ?? res.status})`, e.code, e.error_data?.details);
  }
  return json;
}

function fromGraphError(id: string, label: string, err: unknown, group: Check["group"] = "Meta"): Check {
  const g = err instanceof GraphError ? err : null;
  return {
    id,
    group,
    label,
    status: "error",
    detail: [g?.message ?? (err instanceof Error ? err.message : String(err)), g?.detail].filter(Boolean).join(" — "),
    hint: g?.code !== undefined ? GRAPH_HINTS[g.code] : undefined,
  };
}

function mask(phone: string) {
  return phone.length > 6 ? `${phone.slice(0, 5)}…${phone.slice(-3)}` : "…";
}

// ------------------------------------------------------------ acceso al panel

/**
 * Clave del panel: WHATSAPP_PANEL_KEY si está cargada; si no, el mismo
 * WHATSAPP_VERIFY_TOKEN (un secreto largo que el administrador ya generó y
 * guardó). Se compara en el servidor — la app todavía no tiene login.
 */
export function panelKeyConfigured(): boolean {
  return Boolean(env("WHATSAPP_PANEL_KEY") || env("WHATSAPP_VERIFY_TOKEN"));
}

export function isValidPanelKey(key: string | null | undefined): boolean {
  const expected = env("WHATSAPP_PANEL_KEY") || env("WHATSAPP_VERIFY_TOKEN");
  if (!expected || !key) return false;
  const a = Buffer.from(key.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ------------------------------------------------------------- estado público

/** Qué variables están cargadas (nunca sus valores) y datos no secretos de la configuración. */
export async function publicStatus() {
  const vars = {
    WHATSAPP_VERIFY_TOKEN: Boolean(env("WHATSAPP_VERIFY_TOKEN")),
    WHATSAPP_APP_SECRET: Boolean(env("WHATSAPP_APP_SECRET")),
    WHATSAPP_ACCESS_TOKEN: Boolean(env("WHATSAPP_ACCESS_TOKEN")),
    WHATSAPP_PHONE_NUMBER_ID: Boolean(env("WHATSAPP_PHONE_NUMBER_ID")),
    WHATSAPP_ALLOWED_NUMBERS: getAllowedNumbers().size > 0,
    ANTHROPIC_API_KEY: Boolean(env("ANTHROPIC_API_KEY")),
  };
  const lastIn = await prisma.whatsAppMessage
    .findFirst({ where: { direction: "in" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
    .catch(() => null);
  return {
    vars,
    allowedCount: getAllowedNumbers().size,
    webhookReady: vars.WHATSAPP_VERIFY_TOKEN,
    agentReady: Boolean(getWhatsAppConfig()) && vars.WHATSAPP_ALLOWED_NUMBERS && vars.ANTHROPIC_API_KEY,
    model: agentModel(),
    effort: agentEffort(),
    graphVersion: graphVersion(),
    panelKeyConfigured: panelKeyConfigured(),
    lastInboundAt: lastIn?.createdAt.toISOString() ?? null,
  };
}

// ----------------------------------------------------------------- diagnóstico

interface DiagContext {
  appId?: string;
  wabaId?: string;
  phoneDisplay?: string;
  isTestNumber?: boolean;
}

async function metaChecks(webhookUrl: string, ctx: DiagContext): Promise<Check[]> {
  const out: Check[] = [];
  const token = env("WHATSAPP_ACCESS_TOKEN");
  const phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
  const secret = env("WHATSAPP_APP_SECRET");
  if (!token) {
    out.push({ id: "token", group: "Meta", label: "Token de acceso", status: "skip", detail: "Falta WHATSAPP_ACCESS_TOKEN en Vercel." });
    return out;
  }

  // Token: válido, vencimiento, permisos, a qué WABA tiene acceso.
  try {
    const d = (await graph("GET", `debug_token?input_token=${encodeURIComponent(token)}`)).data ?? {};
    ctx.appId = d.app_id ? String(d.app_id) : undefined;
    if (!d.is_valid) out.push({ id: "token", group: "Meta", label: "Token de acceso", status: "error", detail: "Meta dice que el token no es válido.", hint: GRAPH_HINTS[190] });
    else {
      const expires = Number(d.expires_at ?? 0);
      out.push(
        expires
          ? { id: "token", group: "Meta", label: "Token de acceso", status: "warn", detail: `Válido, pero vence el ${new Date(expires * 1000).toLocaleString("es-PY", { timeZone: "America/Asuncion" })}.`, hint: "Para producción usá el token del System User con vencimiento \"Nunca\"." }
          : { id: "token", group: "Meta", label: "Token de acceso", status: "ok", detail: "Válido y no vence." }
      );
      const scopes: string[] = d.scopes ?? [];
      const missing = ["whatsapp_business_messaging", "whatsapp_business_management"].filter((s) => !scopes.includes(s));
      out.push(
        missing.length
          ? { id: "scopes", group: "Meta", label: "Permisos del token", status: "error", detail: `Faltan: ${missing.join(", ")}.`, hint: GRAPH_HINTS[200] }
          : { id: "scopes", group: "Meta", label: "Permisos del token", status: "ok", detail: "Tiene los permisos de WhatsApp." }
      );
      const wabas: string[] = (d.granular_scopes ?? []).find((g: any) => g.scope === "whatsapp_business_management")?.target_ids ?? [];
      ctx.wabaId = env("WHATSAPP_WABA_ID") || (wabas.length === 1 ? wabas[0] : undefined);
      if (!ctx.wabaId && wabas.length > 1) {
        out.push({ id: "waba", group: "Meta", label: "Cuenta de WhatsApp (WABA)", status: "warn", detail: `El token accede a ${wabas.length} WABAs.`, hint: "Cargá en Vercel WHATSAPP_WABA_ID con la del agente." });
      }
    }
  } catch (err) {
    out.push(fromGraphError("token", "Token de acceso", err));
    return out;
  }

  // App Secret: con el token de app (APP_ID|APP_SECRET) Meta responde solo si el secreto es el correcto.
  if (ctx.appId && secret) {
    const appToken = `${ctx.appId}|${secret}`;
    try {
      const app = await graph("GET", `${ctx.appId}?fields=id,name`, { token: appToken });
      out.push({ id: "secret", group: "Meta", label: "App Secret", status: "ok", detail: `Corresponde a la app "${app.name ?? ctx.appId}".` });
      try {
        const subs = (await graph("GET", `${ctx.appId}/subscriptions`, { token: appToken })).data ?? [];
        const wa = subs.find((s: any) => s.object === "whatsapp_business_account");
        const fields: string[] = (wa?.fields ?? []).map((f: any) => (typeof f === "string" ? f : f.name));
        if (!wa) out.push({ id: "webhook", group: "Meta", label: "Webhook de la app", status: "error", detail: "La app no tiene un webhook de WhatsApp configurado.", hint: `App Dashboard > WhatsApp > Configuration: Callback URL ${webhookUrl} y el verify token.` });
        else if (wa.callback_url !== webhookUrl) out.push({ id: "webhook", group: "Meta", label: "Webhook de la app", status: "error", detail: `Meta manda los mensajes a ${wa.callback_url}.`, hint: `Cambiá la Callback URL a ${webhookUrl}.` });
        else if (!fields.includes("messages")) out.push({ id: "webhook", group: "Meta", label: "Webhook de la app", status: "error", detail: "El webhook está configurado pero no tiene suscripto el campo \"messages\".", hint: "App Dashboard > WhatsApp > Configuration > Webhook fields: suscribí \"messages\"." });
        else out.push({ id: "webhook", group: "Meta", label: "Webhook de la app", status: wa.active === false ? "warn" : "ok", detail: `Apunta a esta app y recibe "messages"${wa.active === false ? " (figura inactivo)" : ""}.` });
      } catch (err) {
        out.push({ ...fromGraphError("webhook", "Webhook de la app", err), status: "warn", hint: "No se pudo leer la configuración del webhook; revisala en App Dashboard > WhatsApp > Configuration." });
      }
    } catch (err) {
      out.push({ ...fromGraphError("secret", "App Secret", err), hint: "WHATSAPP_APP_SECRET no coincide con el de App settings > Basic: sin el correcto, el agente rechaza todos los mensajes de Meta." });
    }
  } else if (!secret) {
    out.push({ id: "secret", group: "Meta", label: "App Secret", status: "skip", detail: "Falta WHATSAPP_APP_SECRET en Vercel." });
  }

  // Número: estado, verificación, nombre, salud y a dónde manda los mensajes.
  if (!phoneId) {
    out.push({ id: "number", group: "Meta", label: "Número del agente", status: "skip", detail: "Falta WHATSAPP_PHONE_NUMBER_ID en Vercel." });
  } else {
    try {
      const n = await graph("GET", `${phoneId}?fields=display_phone_number,verified_name,code_verification_status,name_status,status,quality_rating,account_mode`);
      ctx.phoneDisplay = n.display_phone_number;
      ctx.isTestNumber = /^\+?1[\s-]?555/.test(String(n.display_phone_number ?? ""));
      const label = `${n.display_phone_number ?? phoneId} — "${n.verified_name ?? "?"}"${ctx.isTestNumber ? " (número de prueba de Meta)" : ""}`;
      if (n.status && n.status !== "CONNECTED") {
        out.push({ id: "number", group: "Meta", label: "Número del agente", status: "error", detail: `${label}: estado ${n.status}.`, hint: "Registralo con \"Registrar número\" (PIN de 6 dígitos)." });
      } else if (n.code_verification_status && !["VERIFIED", "NOT_VERIFIED"].includes(n.code_verification_status) && !ctx.isTestNumber) {
        out.push({ id: "number", group: "Meta", label: "Número del agente", status: "warn", detail: `${label}: verificación ${n.code_verification_status}.` });
      } else {
        out.push({ id: "number", group: "Meta", label: "Número del agente", status: "ok", detail: `${label}: conectado a Cloud API.` });
      }
      if (n.name_status === "DECLINED") out.push({ id: "name", group: "Meta", label: "Nombre visible", status: "error", detail: "Meta rechazó el nombre visible.", hint: "Cambialo en WhatsApp Manager y volvé a registrar el número." });
      else if (["PENDING_REVIEW", "NONE"].includes(n.name_status)) out.push({ id: "name", group: "Meta", label: "Nombre visible", status: "warn", detail: `En revisión (${n.name_status}): se puede usar igual, con capacidad limitada.` });

      const h = await graph("GET", `${phoneId}?fields=health_status`);
      const can = h.health_status?.can_send_message;
      const errs: string[] = [];
      for (const e of h.health_status?.entities ?? []) for (const x of e.errors ?? []) errs.push(`${x.error_description ?? ""} ${x.possible_solution ?? ""}`.trim());
      if (can === "AVAILABLE") out.push({ id: "health", group: "Meta", label: "Puede enviar mensajes", status: "ok", detail: "Sí." });
      else if (can) out.push({ id: "health", group: "Meta", label: "Puede enviar mensajes", status: can === "LIMITED" ? "warn" : "error", detail: `${can}${errs.length ? `: ${errs.join(" · ")}` : ""}` });

      const w = (await graph("GET", `${phoneId}?fields=webhook_configuration`)).webhook_configuration ?? {};
      const effective = w.phone_number || w.whatsapp_business_account || w.application;
      if (effective && effective !== webhookUrl) {
        out.push({ id: "callback", group: "Meta", label: "Destino de los mensajes del número", status: "error", detail: `Los mensajes de este número van a ${effective}.`, hint: `Tienen que ir a ${webhookUrl}.` });
      }
    } catch (err) {
      out.push(fromGraphError("number", "Número del agente", err));
    }
  }

  // Suscripción de la app a la WABA (sin esto no llegan los mensajes del número).
  if (ctx.wabaId) {
    try {
      const s = (await graph("GET", `${ctx.wabaId}/subscribed_apps`)).data ?? [];
      out.push(
        s.length
          ? { id: "subscribed", group: "Meta", label: "App suscripta a la WABA", status: "ok", detail: s.map((a: any) => a.whatsapp_business_api_data?.name ?? "app").join(", ") }
          : { id: "subscribed", group: "Meta", label: "App suscripta a la WABA", status: "error", detail: "La app no está suscripta: los mensajes de este número no van a llegar.", hint: "Tocá \"Suscribir app\"." }
      );
    } catch (err) {
      out.push(fromGraphError("subscribed", "App suscripta a la WABA", err));
    }
  }
  return out;
}

async function claudeChecks(): Promise<Check[]> {
  if (!env("ANTHROPIC_API_KEY")) {
    return [{ id: "claude", group: "Claude", label: "Clave de Anthropic", status: "skip", detail: "Falta ANTHROPIC_API_KEY en Vercel." }];
  }
  const model = agentModel();
  try {
    // Consultar un modelo es gratis: valida la clave y que el modelo esté disponible para la organización.
    const info = await new Anthropic({ maxRetries: 0 }).models.retrieve(model);
    return [{ id: "claude", group: "Claude", label: "Clave y modelo de IA", status: "ok", detail: `Clave válida · modelo ${info.display_name ?? model} disponible · esfuerzo ${agentEffort()}.` }];
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    if (status === 401 || status === 403) {
      return [{ id: "claude", group: "Claude", label: "Clave y modelo de IA", status: "error", detail: "La clave de Anthropic no es válida o no tiene permisos.", hint: "Generá una nueva en platform.claude.com > Settings > API keys y actualizá ANTHROPIC_API_KEY en Vercel." }];
    }
    if (status === 404) {
      return [{ id: "claude", group: "Claude", label: "Clave y modelo de IA", status: "error", detail: `El modelo "${model}" no está disponible para esta organización.`, hint: `Cambiá ANTHROPIC_MODEL en Vercel (por ejemplo ${DEFAULT_MODEL}).` }];
    }
    return [{ id: "claude", group: "Claude", label: "Clave y modelo de IA", status: "warn", detail: `No se pudo verificar: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}` }];
  }
}

export async function runDiagnostics(webhookUrl: string) {
  const ctx: DiagContext = {};
  const [meta, claude] = await Promise.all([metaChecks(webhookUrl, ctx), claudeChecks()]);
  return { checks: [...meta, ...claude], phoneDisplay: ctx.phoneDisplay ?? null, isTestNumber: ctx.isTestNumber ?? null, wabaId: ctx.wabaId ?? null };
}

// ------------------------------------------------------------------ actividad

export async function activity() {
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [inbound7, outbound7, byStatus, recent] = await Promise.all([
    prisma.whatsAppMessage.count({ where: { direction: "in", createdAt: { gt: since7 } } }),
    prisma.whatsAppMessage.count({ where: { direction: "out", createdAt: { gt: since7 } } }),
    prisma.whatsAppPendingAction.groupBy({ by: ["status"], where: { createdAt: { gt: since7 } }, _count: { _all: true } }),
    prisma.whatsAppPendingAction.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, kind: true, status: true, summary: true, createdAt: true, phone: true } }),
  ]);
  const names = getAllowedNumbers();
  return {
    inbound7,
    outbound7,
    proposals7: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    recent: recent.map((a) => ({
      id: a.id,
      kind: a.kind,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      by: names.get(a.phone) ?? mask(a.phone),
      detail: a.summary.split("\n").filter((l) => l.startsWith("• ")).slice(0, 3).map((l) => l.slice(2).replaceAll("*", "")).join(" · "),
    })),
    allowed: Array.from(names.entries()).map(([phone, name]) => ({ name, phone: mask(phone), key: phone })),
  };
}

// -------------------------------------------------------------------- acciones

export type ActionResult = { ok: boolean; message: string; hint?: string };

function actionError(err: unknown): ActionResult {
  const g = err instanceof GraphError ? err : null;
  return {
    ok: false,
    message: [g?.message ?? (err instanceof Error ? err.message : String(err)), g?.detail].filter(Boolean).join(" — "),
    hint: g?.code !== undefined ? GRAPH_HINTS[g.code] : undefined,
  };
}

async function resolveWabaId(): Promise<string | null> {
  if (env("WHATSAPP_WABA_ID")) return env("WHATSAPP_WABA_ID");
  const d = (await graph("GET", `debug_token?input_token=${encodeURIComponent(env("WHATSAPP_ACCESS_TOKEN"))}`)).data ?? {};
  const wabas: string[] = (d.granular_scopes ?? []).find((g: any) => g.scope === "whatsapp_business_management")?.target_ids ?? [];
  return wabas.length === 1 ? wabas[0] : null;
}

export async function subscribeApp(): Promise<ActionResult> {
  if (!env("WHATSAPP_ACCESS_TOKEN")) return { ok: false, message: "Falta WHATSAPP_ACCESS_TOKEN en Vercel." };
  try {
    const waba = await resolveWabaId();
    if (!waba) return { ok: false, message: "No pude determinar la WABA.", hint: "Cargá WHATSAPP_WABA_ID en Vercel." };
    const r = await graph("POST", `${waba}/subscribed_apps`);
    return r.success ? { ok: true, message: "App suscripta a la WABA: los mensajes del número ya pueden llegar al agente." } : { ok: false, message: "Meta no confirmó la suscripción." };
  } catch (err) {
    return actionError(err);
  }
}

/** Registra el número en Cloud API. Nunca reintenta: Meta permite 10 intentos cada 72 h. */
export async function registerNumber(pin: string): Promise<ActionResult> {
  const phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
  if (!env("WHATSAPP_ACCESS_TOKEN") || !phoneId) return { ok: false, message: "Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID en Vercel." };
  if (!/^\d{6}$/.test(pin)) return { ok: false, message: "El PIN tiene que tener exactamente 6 dígitos." };
  try {
    const r = await graph("POST", `${phoneId}/register`, { body: { messaging_product: "whatsapp", pin } });
    return r.success
      ? { ok: true, message: "Número registrado en Cloud API. Guardá el PIN: se necesita para mover o borrar el número." }
      : { ok: false, message: "Meta no confirmó el registro." };
  } catch (err) {
    return actionError(err);
  }
}

/** Mensaje de prueba, solo a un número autorizado (así el panel no sirve para escribirle a cualquiera). */
export async function sendTestMessage(to: string): Promise<ActionResult> {
  const cfg = getWhatsAppConfig();
  if (!cfg) return { ok: false, message: "Faltan variables de WhatsApp en Vercel." };
  const phone = normalizePhone(to);
  const name = getAllowedNumbers().get(phone);
  if (!name) return { ok: false, message: "Solo se puede enviar la prueba a un número autorizado." };
  try {
    await sendText(cfg, phone, "✅ Prueba de ObrasFlow: el número del agente puede enviarte mensajes.");
    return { ok: true, message: `Meta aceptó el envío a ${name}. Fijate que llegue al teléfono.` };
  } catch (err) {
    // client.ts arma el error como "WhatsApp API <status>: <cuerpo JSON de Meta>".
    const msg = err instanceof Error ? err.message : String(err);
    let meta: { message?: string; code?: number; error_data?: { details?: string } } = {};
    try {
      meta = JSON.parse(msg.slice(msg.indexOf("{"))).error ?? {};
    } catch {
      /* no era JSON */
    }
    return {
      ok: false,
      message: meta.message ? `${meta.message} (código ${meta.code})${meta.error_data?.details ? ` — ${meta.error_data.details}` : ""}` : msg.slice(0, 300),
      hint: meta.code !== undefined ? GRAPH_HINTS[meta.code] : undefined,
    };
  }
}

/** Una respuesta mínima de la IA (unos pocos tokens): confirma clave, modelo y saldo. */
export async function testAI(): Promise<ActionResult> {
  if (!env("ANTHROPIC_API_KEY")) return { ok: false, message: "Falta ANTHROPIC_API_KEY en Vercel." };
  const model = agentModel();
  try {
    const r = await new Anthropic({ maxRetries: 0 }).messages.create({
      model,
      max_tokens: 64,
      messages: [{ role: "user", content: "Respondé solamente: listo" }],
    });
    return { ok: true, message: `La IA respondió (${model}, ${r.usage.input_tokens + r.usage.output_tokens} tokens: costo despreciable).` };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const body = (err as { error?: { error?: { message?: string } } }).error?.error ?? {};
      const m = String(body.message ?? err.message);
      if (/credit balance|You have reached your specified/i.test(m) || err.status === 402) {
        return { ok: false, message: "La cuenta de la IA no tiene saldo o llegó a su límite de gasto.", hint: "Revisá Billing y Spend limits en platform.claude.com." };
      }
      if (err.status === 401 || err.status === 403) return { ok: false, message: "La clave de Anthropic no es válida.", hint: "Actualizá ANTHROPIC_API_KEY en Vercel." };
      return { ok: false, message: `Error ${err.status ?? ""}: ${m.slice(0, 200)}` };
    }
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
