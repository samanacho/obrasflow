import { NextRequest, NextResponse } from "next/server";
import {
  publicStatus,
  runDiagnostics,
  activity,
  isValidPanelKey,
  subscribeApp,
  registerNumber,
  sendTestMessage,
  testAI,
} from "@/lib/whatsapp/setup";

// API del módulo /agente-whatsapp. Sin clave: solo qué variables están
// cargadas (nunca sus valores). Con la clave del panel (header
// x-panel-key, verificada en el servidor): diagnóstico contra Meta y
// Claude, actividad y acciones de configuración.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function webhookUrl(req: NextRequest) {
  return process.env.WHATSAPP_WEBHOOK_URL?.trim() || `${req.nextUrl.origin}/api/whatsapp/webhook`;
}

/** Una clave incorrecta demora la respuesta: adivinar por fuerza bruta no es práctico. */
async function denied() {
  await new Promise((r) => setTimeout(r, 800));
  return NextResponse.json({ error: "Clave del panel incorrecta." }, { status: 401 });
}

/** App corriendo en esta PC (modo local, no Vercel) y abierta desde la misma PC: no hace falta clave. */
function localPc(req: NextRequest) {
  return !process.env.VERCEL && ["localhost", "127.0.0.1", "[::1]"].includes(req.nextUrl.hostname);
}

export async function GET(req: NextRequest) {
  const status = await publicStatus();
  if (localPc(req)) {
    return NextResponse.json({ ...status, webhookUrl: webhookUrl(req), unlocked: true, activity: await activity() });
  }
  const key = req.headers.get("x-panel-key");
  if (!key) return NextResponse.json({ ...status, webhookUrl: webhookUrl(req), unlocked: false });
  if (!isValidPanelKey(key)) return denied();
  const [diag, act] = await Promise.all([runDiagnostics(webhookUrl(req)), activity()]);
  return NextResponse.json({ ...status, webhookUrl: webhookUrl(req), unlocked: true, diagnostics: diag, activity: act });
}

export async function POST(req: NextRequest) {
  if (!isValidPanelKey(req.headers.get("x-panel-key"))) return denied();
  const body = (await req.json().catch(() => ({}))) as { action?: string; pin?: string; to?: string };
  switch (body.action) {
    case "subscribe":
      return NextResponse.json(await subscribeApp());
    case "register":
      return NextResponse.json(await registerNumber(String(body.pin ?? "")));
    case "send-test":
      return NextResponse.json(await sendTestMessage(String(body.to ?? "")));
    case "test-ai":
      return NextResponse.json(await testAI());
    default:
      return NextResponse.json({ ok: false, message: "Acción desconocida." }, { status: 400 });
  }
}
