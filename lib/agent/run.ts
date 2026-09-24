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

/** Modelo por defecto; se puede cambiar sin tocar código con ANTHROPIC_MODEL. */
const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5";
/**
 * Esfuerzo de razonamiento. En Claude Opus 5, "low"/"medium" rinden muy
 * bien y son la palanca principal de costo y demora — "medium" es un buen
 * punto para consultas y cargas por WhatsApp.
 */
const EFFORT = (process.env.ANTHROPIC_EFFORT?.trim() || "medium") as "low" | "medium" | "high" | "xhigh" | "max";
const HISTORY_MESSAGES = 20;
const HISTORY_WINDOW_MS = 12 * 60 * 60 * 1000;
/** Tope de idas y vueltas con herramientas por mensaje (evita loops caros). */
const MAX_ITERATIONS = 10;

export function isAgentConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // maxRetries 1: el reintento automático del SDK no puede comerse la ventana de 60s de la función.
  client ??= new Anthropic({ maxRetries: 1 });
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
async function loadHistory(phone: string, current: { id: string; createdAt: Date }): Promise<BetaMessageParam[]> {
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
        ? `[Tarjeta automática del sistema, no escrita por vos: se le mandó al usuario la propuesta ${r.proposalId} con botones Confirmar/Cancelar]\n${r.text}`
        : (r.text as string);
      return { role: "assistant", content: text };
    });
  // La conversación tiene que empezar con un mensaje del usuario.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs;
}

function contextBlock(user: AgentUser, pending: Awaited<ReturnType<typeof listPendingActions>>): string {
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
  const [history, pending] = await Promise.all([loadHistory(user.phone, current), listPendingActions(user.phone)]);
  const ctx: TurnContext = { user, proposals: [] };

  const messages: BetaMessageParam[] = [
    ...history,
    { role: "user", content: [{ type: "text", text: contextBlock(user, pending) }, ...currentContent] },
  ];

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const final = await getClient().beta.messages.toolRunner(
      {
        model: MODEL,
        max_tokens: 16000,
        // Respaldo automático: si los clasificadores de seguridad de Opus 5
        // rechazan un pedido benigno, el API lo reintenta en el modelo que
        // Anthropic recomienda para esa categoría, en la misma llamada.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
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
  }
}
