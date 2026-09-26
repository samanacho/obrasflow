import { NextRequest, NextResponse } from "next/server";
import { checkConnectorKey } from "@/lib/memby/auth";
import { executePendingAction } from "@/lib/agent/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Confirma una propuesta de Memby y la registra, todo en Vercel: el registro
 * usa una transacción (movimiento + feed + Ejecutado + captura clasificada),
 * que el conector remoto no puede abrir. Devuelve el mensaje para WhatsApp.
 */
export async function POST(req: NextRequest) {
  const denied = checkConnectorKey(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { phone?: unknown; name?: unknown; actionId?: unknown } | null;
  const phone = typeof body?.phone === "string" ? body.phone : "";
  const name = typeof body?.name === "string" ? body.name : "";
  const actionId = typeof body?.actionId === "string" ? body.actionId : "";
  if (!phone || !actionId) return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  const message = await executePendingAction({ phone, name: name || phone }, actionId);
  return NextResponse.json({ result: message });
}
