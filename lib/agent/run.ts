import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { prisma } from "../prisma";
import { todayInParaguay, weekdayOf, fmtYmd, BUSINESS_TIME_ZONE } from "../dates";
import { SYSTEM_PROMPT } from "./prompt";
import { buildTools, type TurnContext } from "./tools";
import { listPendingActions, type AgentUser, type ProposalResult } from "./actions";

// Un turno del agente: historial reciente + mensaje actual -> Claude con
// herramientas (el tool runner del SDK maneja el ida y vuelta) -> texto de
// respuesta + propuestas creadas en este turno.

/**
 * Modelo por defecto: Claude Sonnet 5 — el más barato (40% del precio de
 * Opus) que mantiene razonamiento adaptativo, effort y visión de alta
 * resolución; y como cada registro pasa por el botón Confirmar, un error de
 * lectura se ve antes de guardarse. Para máxima precisión:
 * ANTHROPIC_MODEL=claude-opus-5-5 (sin tocar código).
 */
const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
/**
 * Esfuerzo de razonamiento: la palanca principal de costo y demora.
 * "medium" es un buen punto para consultas y cargas por WhatsApp.
 */
const EFFORT = (process.env.ANTHROPIC_EFFORT?.trim() || "medium") as "low" | "medium" | "high" | "xhigh" | "max";
/**
 * Respaldo del lado del servidor: solo los modelos con clasificadores de
 * seguridad (Opus 5.x / Fable 5.x) lo documentan; a otros no se les manda.
 */
const SERVER_FALLBACK = /^claude-(opus-5|fable-5)/.test(MODEL);
/** Haiku 4.5 rechaza thinking adaptativo y effort (400): se omiten. */
const LEGACY_THINKING = /^claude-haiku-4-5/.test(MODEL);
const HISTORY_MESSAGES = 20;
const HISTORY_WINDOW_MS = 12 * 60 * 60 * 1000;
/** Tope de idas y vueltas con herramientas por mensaje (evita loops caros). */
const MAX_ITERATIONS = 10;

/**
 * "cli": usa Claude Code con la sesión de Claude de la PC (sin clave de API),
 * pensado para el conector local. "api" (default si hay ANTHROPIC_API_KEY): API de Claude.
 */
export function agentBackend(): "api" | "cli" {
  const b = process.env.AGENT_BACKEND?.trim();
  if (b === "cli" || b === "api") return b;
  return process.env.ANTHROPIC_API_KEY?.trim() ? "api" : "cli";
}

export function isAgentConfigured(): boolean {
  return agentBackend() === "cli" ? process.env.AGENT_BACKEND?.trim() === "cli" : Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let client: Anthropic | null = null;
let clientKey = "";
function getClient(): Anthropic {
  // maxRetries 1: el reintento automático del SDK no puede comerse la ventana de 60s de la función.
  // Si la clave cambia en caliente (conector de WhatsApp), se crea un cliente nuevo.
  const key = process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (!client || key !== clientKey) {
    client = new Anthropic({ apiKey: key, maxRetries: 1 });
    clientKey = key;
  }
  return client;
}

/**
 * Historial reciente del número como mensajes user/assistant de texto: todo
 * lo que se le respondió, pero de lo que escribió el usuario solo lo ANTERIOR
 * al mensaje actual (un mensaje posterior lo atiende su propio turno, que
 * corre después de este — ver el lock en lib/whatsapp/handle.ts). Las
 * tarjetas con botones las escribe el sistema, no el modelo: van marcadas
 * como tales para que no las tome como propias.
 */
export async function loadHistory(phone: string, current: { id: string; createdAt: Date }): Promise<BetaMessageParam[]> {
  const rows = await prisma.whatsAppMessage.findMany({
    where: {
      phone,
      id: { not: current.id },
      createdAt: { gt: new Date(Date.now() - HISTORY_WINDOW_MS) },
      OR: [{ direction: "out" }, { createdAt: { lte: current.createdAt } }],
    },
    orderBy: { createdAt: "desc" },
    take: HISTORY_MESSAGES,
  });
  const msgs: BetaMessageParam[] = rows
    .reverse()
    .filter((r) => r.text && r.text.trim())
    .map((r) => {
      if (r.direction === "in") return { role: "user", content: r.text as string };
      const text = r.proposalId
        ? `[Tarjeta automática del sistema: se le mandó al usuario la propuesta ${r.proposalId} con botones Confirmar/Cancelar. El resumen de la tarjeta lo arma el sistema, no vos]\n${r.text}`
        : (r.text as string);
      return { role: "assistant", content: text };
    });
  // La conversación tiene que empezar con un mensaje del usuario.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

export function contextBlock(user: AgentUser, pending: Awaited<ReturnType<typeof listPendingActions>>): string {
  const today = todayInParaguay();
  const hora = new Intl.DateTimeFormat("es-PY", { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const pend = pending.length
    ? pending
        .map((p) => {
          const detalle = p.resumen.split("\n").filter((l) => l.startsWith("• ")).slice(0, 4).join(" ");
          return `- propuestaId ${p.propuestaId}: ${detalle.replace(/\s+/g, " ")}`;
        })
        .join("\n")
    : "(ninguna)";
  return [
    "[Contexto del sistema, no escrito por el usuario]",
    `Hoy es ${weekdayOf(today)} ${fmtYmd(today)} (${today}), ${hora} hora de Paraguay.`,
    `Te escribe: ${user.name}.`,
    `Propuestas de este usuario esperando confirmación:\n${pend}`,
  ].join("\n");
}

export interface AgentTurnResult {
  reply: string;
  proposals: ProposalResult[];
}

const CUT_WITH_PROPOSALS = "Te preparé esto 👇 revisalo y confirmá con el botón.";
const CUT_WITHOUT_PROPOSALS = "Me enredé con ese pedido 😅 ¿Me lo decís de nuevo, más corto?";

/**
 * @param currentContent  contenido del mensaje actual (texto + imagen/PDF si vino).
 * @param current         el WhatsAppMessage entrante actual (se excluye del historial y lo acota en el tiempo).
 * @param timeoutMs       tiempo máximo para el turno completo con el modelo.
 */
export async function runAgentTurn(
  user: AgentUser,
  currentContent: BetaContentBlockParam[],
  current: { id: string; createdAt: Date },
  timeoutMs: number
): Promise<AgentTurnResult> {
  if (agentBackend() === "cli") {
    const { runAgentTurnCli } = await import("./cli-run");
    return runAgentTurnCli(user, currentContent, current, timeoutMs);
  }
  const [history, pending] = await Promise.all([loadHistory(user.phone, current), listPendingActions(user.phone)]);
  const ctx: TurnContext = { user, proposals: [] };

  const messages: BetaMessageParam[] = [
    ...history,
    { role: "user", content: [{ type: "text", text: contextBlock(user, pending) }, ...currentContent] },
  ];

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  // Consumo real del turno (todas las vueltas con herramientas), para ver en
  // los logs de Vercel cuánto cuesta y si la caché está funcionando.
  const usage = { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  try {
    const runner = getClient().beta.messages.toolRunner(
      {
        model: MODEL,
        max_tokens: 16000,
        // Respaldo automático: si los clasificadores de seguridad de Opus 5.x
        // rechazan un pedido benigno, el API lo reintenta en el modelo que
        // Anthropic recomienda para esa categoría, en la misma llamada.
        ...(SERVER_FALLBACK ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        ...(LEGACY_THINKING ? {} : { thinking: { type: "adaptive" as const }, output_config: { effort: EFFORT } }),
        // Caché: el system prompt fijo lleva su propio punto de corte, y el
        // automático cubre lo que crece dentro del turno (historial, foto/PDF,
        // resultados de herramientas): cada vuelta del runner lo relee de caché.
        cache_control: { type: "ephemeral" },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: buildTools(ctx),
        messages,
        max_iterations: MAX_ITERATIONS,
      },
      { signal: abort.signal }
    );
    for await (const m of runner) {
      usage.calls++;
      usage.input += m.usage.input_tokens ?? 0;
      usage.cacheRead += m.usage.cache_read_input_tokens ?? 0;
      usage.cacheWrite += m.usage.cache_creation_input_tokens ?? 0;
      usage.output += m.usage.output_tokens ?? 0;
    }
    const final = await runner.done();

    if (final.stop_reason === "refusal") {
      return { reply: "No puedo ayudarte con eso por acá. Si es algo de la obra, probá decírmelo de otra forma.", proposals: ctx.proposals };
    }
    if (final.stop_reason === "tool_use" || final.stop_reason === "max_tokens") {
      // Cortado (tope de iteraciones o de tokens): el texto, si lo hay, es
      // una frase a medias ("Reviso los movimientos…"), no una respuesta.
      return { reply: ctx.proposals.length ? CUT_WITH_PROPOSALS : CUT_WITHOUT_PROPOSALS, proposals: ctx.proposals };
    }
    const text = final.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { reply: text, proposals: ctx.proposals };
  } catch (err) {
    // Timeout o error del API a mitad del turno: las propuestas que ya se
    // crearon (y validaron) igual tienen que llegarle con sus botones.
    if (ctx.proposals.length) {
      console.error("WhatsApp agent: turno cortado con propuestas ya creadas", err);
      return { reply: CUT_WITH_PROPOSALS, proposals: ctx.proposals };
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (usage.calls) {
      console.log(
        `WhatsApp agent: ${MODEL} · ${usage.calls} llamada(s) · entrada ${usage.input} (caché leída ${usage.cacheRead}, escrita ${usage.cacheWrite}) · salida ${usage.output} tokens`
      );
    }
  }
}
