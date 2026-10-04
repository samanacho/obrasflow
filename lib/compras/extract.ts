import { tmpdir } from "os";
import Anthropic from "@anthropic-ai/sdk";
import { agentBackend, isAgentConfigured } from "../agent/run";
import type { ParsedRequest } from "./parse";

// Lectura de un "Pedido de compra" escrito a mano alzada ("necesitamos
// cemento y unas varillas para la losa de la escuela") con Claude. Solo se
// usa cuando la lectura fija (lib/compras/parse.ts) no alcanza. Usa lo mismo
// que Memby: la API de Claude si hay clave, o Claude Code de la PC.

const SYSTEM = `Extraés pedidos de compra de materiales de construcción escritos por WhatsApp en Paraguay (español, a veces con errores o abreviaturas).
Devolvé SOLO un objeto JSON, sin texto alrededor, con esta forma:
{"obra": string|null, "proveedor": string|null, "fechaNecesaria": "YYYY-MM-DD"|null, "notas": string|null, "lineas": [{"cantidad": number, "unidad": string|null, "descripcion": string}]}
Reglas:
- "obra": el nombre de la obra tal como aparece en la lista de obras que te paso si se puede reconocer; si no, como lo escribieron; null si no la dicen.
- Cada material es una línea. Si no dicen la cantidad, poné 0 (alguien la completa después). Unidades en singular y cortas (bolsa, m3, m2, ml, kg, varilla, unidad...).
- "descripcion": el material con su medida o tipo (ej. "varilla 10 mm", "cemento portland"), sin la cantidad.
- "fechaNecesaria": para cuándo lo necesitan, usando la fecha de hoy que te paso para "mañana", "el lunes", etc.
- No inventes nada que no esté en el mensaje.`;

function parseJson(text: string): ParsedRequest | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const j = JSON.parse(text.slice(a, b + 1));
    const lineas = Array.isArray(j.lineas)
      ? j.lineas
          .map((l: any) => ({ cantidad: Number(l?.cantidad) || 0, unidad: l?.unidad ? String(l.unidad) : null, descripcion: String(l?.descripcion ?? "").trim() }))
          .filter((l: { descripcion: string }) => l.descripcion)
      : [];
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const fecha = str(j.fechaNecesaria);
    return { obra: str(j.obra), proveedor: str(j.proveedor), fechaNecesaria: fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null, notas: str(j.notas), lineas };
  } catch {
    return null;
  }
}

/** null si no hay IA configurada o no se pudo leer. */
export async function extractWithAI(text: string, today: string, obras: string[], timeoutMs = 60_000): Promise<ParsedRequest | null> {
  if (!isAgentConfigured()) return null;
  const prompt = `Hoy es ${today}.\nObras de la empresa: ${obras.slice(0, 80).join(" | ") || "(sin lista)"}\n\nMensaje:\n${text}`;
  try {
    if (agentBackend() === "api") {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim(), maxRetries: 1, timeout: timeoutMs });
      const r = await client.messages.create({
        model: process.env.MEMBY_COMPRAS_MODEL?.trim() || "claude-haiku-4-5",
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      return parseJson(r.content.map((c) => (c.type === "text" ? c.text : "")).join(""));
    }
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const { cleanEnv } = await import("../agent/cli-run");
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const q = query({
        prompt,
        options: {
          systemPrompt: SYSTEM,
          model: process.env.CLAUDE_CLI_MODEL?.trim() || "haiku",
          tools: [],
          settingSources: [],
          persistSession: false,
          maxTurns: 1,
          abortController: abort,
          cwd: tmpdir(),
          env: cleanEnv(),
        },
      });
      for await (const m of q) {
        if (m.type === "result") return m.subtype === "success" && !m.is_error ? parseJson(m.result) : null;
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error("Compras: no se pudo leer el pedido con la IA:", (err as Error).message);
    return null;
  }
}
