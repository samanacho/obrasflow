import { tmpdir } from "os";
import { query, createSdkMcpServer, tool, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { SYSTEM_PROMPT } from "./prompt";
import { buildTools, type TurnContext } from "./tools";
import { listPendingActions, type AgentUser } from "./actions";
import { loadHistory, contextBlock, type AgentTurnResult } from "./run";

// Turno del agente usando Claude Code (Claude Agent SDK) con la sesión de
// Claude ya iniciada en esta PC (~/.claude), en lugar de una clave de API:
// sirve para probar sin créditos de API. Mismas herramientas y mismas reglas
// que el backend por API (lib/agent/run.ts): el modelo solo consulta y propone.
//
// Aislado a propósito: sin las herramientas propias de Claude Code (Bash,
// archivos, web…), sin leer configuraciones ni CLAUDE.md de la PC y sin
// guardar la sesión. Solo puede usar las herramientas de ObrasFlow.

const SERVER = "obrasflow";

/**
 * Entorno para Claude Code: el de la PC, sin variables heredadas de otra
 * sesión de Claude (p. ej. si el conector se lanzó desde la app de Claude),
 * que redirigen la autenticación y hacen fallar con "Not logged in".
 */
function cleanEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k === "CLAUDE_CODE_OAUTH_TOKEN") out[k] = v;
    else if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_SDK|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_PREVIEW|ANTHROPIC_BASE_URL|BAGGAGE|AI_AGENT)/.test(k)) continue;
    else out[k] = v;
  }
  return out;
}
const MAX_TURNS = 12;

/** Convierte lo que devuelve una herramienta al formato de resultado de MCP. */
function toToolResult(out: unknown) {
  if (typeof out === "string") return { content: [{ type: "text" as const, text: out }] };
  if (Array.isArray(out)) {
    const content = out.map((b: any) => {
      if (b?.type === "image" && b.source?.type === "base64") return { type: "image" as const, data: b.source.data, mimeType: b.source.media_type };
      if (b?.type === "document") return { type: "text" as const, text: "[PDF: en este modo no se puede volver a mostrar; usá los datos que ya leíste o pedíselos al usuario]" };
      return { type: "text" as const, text: typeof b?.text === "string" ? b.text : JSON.stringify(b) };
    });
    return { content };
  }
  return { content: [{ type: "text" as const, text: JSON.stringify(out) }] };
}

/** El historial va como texto dentro del mensaje (el SDK arranca una conversación nueva en cada turno). */
function transcript(history: Awaited<ReturnType<typeof loadHistory>>): string {
  if (!history.length) return "";
  const lines = history.map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${typeof m.content === "string" ? m.content : "[mensaje]"}`);
  return `[Conversación reciente por WhatsApp, del más viejo al más nuevo]\n${lines.join("\n")}\n[Fin de la conversación reciente]\n\n`;
}

export async function runAgentTurnCli(
  user: AgentUser,
  currentContent: BetaContentBlockParam[],
  current: { id: string; createdAt: Date },
  timeoutMs: number
): Promise<AgentTurnResult> {
  const [history, pending] = await Promise.all([loadHistory(user.phone, current), listPendingActions(user.phone)]);
  const ctx: TurnContext = { user, proposals: [] };
  const defs = buildTools(ctx);

  const server = createSdkMcpServer({
    name: SERVER,
    version: "1.0.0",
    tools: defs.map((d) =>
      tool(d.name, d.description ?? "", d.zodSchema.shape, async (args: unknown) => {
        try {
          // Mismo control que el backend por API: el esquema Zod valida antes de ejecutar.
          return toToolResult(await d.runTyped(d.zodSchema.parse(args) as never));
        } catch (err) {
          return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
        }
      })
    ),
  });

  const content = [
    { type: "text" as const, text: `${transcript(history)}${contextBlock(user, pending)}` },
    ...currentContent,
  ];
  async function* input(): AsyncIterable<SDKUserMessage> {
    yield { type: "user", message: { role: "user", content: content as any }, parent_tool_use_id: null };
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  let text = "";
  let failed: string | null = null;
  try {
    const q = query({
      prompt: input(),
      options: {
        systemPrompt: SYSTEM_PROMPT,
        model: process.env.CLAUDE_CLI_MODEL?.trim() || "sonnet",
        tools: [],
        mcpServers: { [SERVER]: server },
        allowedTools: defs.map((d) => `mcp__${SERVER}__${d.name}`),
        permissionMode: "dontAsk",
        settingSources: [],
        persistSession: false,
        maxTurns: MAX_TURNS,
        abortController: abort,
        cwd: tmpdir(),
        env: cleanEnv(),
      },
    });
    for await (const m of q) {
      if (m.type !== "result") continue;
      if (m.subtype === "success") text = m.result.trim();
      else failed = m.subtype;
    }
  } catch (err) {
    if (ctx.proposals.length) return { reply: "Te preparé esto 👇 revisalo y confirmá con el código.", proposals: ctx.proposals };
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (failed) {
    return {
      reply: ctx.proposals.length ? "Te preparé esto 👇 revisalo y confirmá con el código." : "Me enredé con ese pedido 😅 ¿Me lo decís de nuevo, más corto?",
      proposals: ctx.proposals,
    };
  }
  return { reply: text, proposals: ctx.proposals };
}

/** Prueba mínima de que Claude Code responde con la sesión de esta PC. */
export async function checkClaudeCli(): Promise<{ ok: boolean; detail: string }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 90_000);
  try {
    const q = query({
      prompt: "Respondé solamente: ok",
      options: { tools: [], settingSources: [], persistSession: false, maxTurns: 1, abortController: abort, cwd: tmpdir(), env: cleanEnv(), model: process.env.CLAUDE_CLI_MODEL?.trim() || "sonnet" },
    });
    for await (const m of q) {
      if (m.type === "result") {
        return m.subtype === "success"
          ? { ok: true, detail: "Claude Code responde con la sesión de esta PC." }
          : { ok: false, detail: `Claude Code no pudo responder (${m.subtype}).` };
      }
    }
    return { ok: false, detail: "Claude Code no devolvió respuesta." };
  } catch (err) {
    return { ok: false, detail: `Claude Code no está disponible: ${(err as Error).message.slice(0, 160)}` };
  } finally {
    clearTimeout(timer);
  }
}
