import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { waitUntil } from "@vercel/functions";
import { getWhatsAppConfig, getVerifyToken } from "@/lib/whatsapp/config";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";
import { parseWebhookPayload, logWebhookEvents } from "@/lib/whatsapp/parse";
import { handleInbound } from "@/lib/whatsapp/handle";

// Webhook de WhatsApp Cloud API (Meta). URL a configurar en Meta:
//   https://<dominio>/api/whatsapp/webhook
// Ver docs/WHATSAPP_AGENT.md.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// El procesamiento (IA + base) sigue después de responder 200 (waitUntil);
// esto es el tiempo total que Vercel le deja vivir a la función.
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Handshake de verificación: Meta llama con hub.mode/hub.verify_token/hub.challenge al guardar el webhook. */
export async function GET(req: NextRequest) {
  const verifyToken = getVerifyToken();
  if (!verifyToken) return new NextResponse("WhatsApp no configurado", { status: 503 });
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token") ?? "";
  const challenge = sp.get("hub.challenge") ?? "";
  if (mode === "subscribe" && safeEqual(token, verifyToken)) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** Mensajes entrantes. Responde 200 enseguida (si Meta no recibe 200 rápido, reintenta) y procesa en segundo plano. */
export async function POST(req: NextRequest) {
  // Todo el trabajo en segundo plano tiene que terminar antes de que Vercel corte la función.
  const deadline = Date.now() + (maxDuration - 5) * 1000;
  const cfg = getWhatsAppConfig();
  if (!cfg) return new NextResponse("WhatsApp no configurado", { status: 503 });

  // La firma se calcula sobre el cuerpo CRUDO: leerlo como texto antes de parsear.
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    console.warn("WhatsApp webhook: firma inválida, request descartado");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  // Fallas de entrega (p. ej. sin medio de pago en Meta), mensajes a otro
  // número, avisos de la cuenta: no se procesan, pero quedan en los logs.
  logWebhookEvents(body, cfg.phoneNumberId);
  const messages = parseWebhookPayload(body, cfg.phoneNumberId);
  if (messages.length) {
    // En orden (una foto seguida de su texto tiene que procesarse en ese orden).
    waitUntil(
      (async () => {
        for (const m of messages) {
          try {
            await handleInbound(cfg, m, deadline);
          } catch (err) {
            console.error("WhatsApp webhook: error no controlado", err);
          }
        }
      })()
    );
  }
  return NextResponse.json({ ok: true });
}
