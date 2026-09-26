import { NextRequest, NextResponse } from "next/server";
// Tablas de Memby: en la app local pueden venir de producción (ver lib/memby/chat-db.ts).
import { membyDb as prisma } from "@/lib/memby/chat-db";
import { isValidPanelKey } from "@/lib/whatsapp/setup";

// Estado de la conexión por QR (Baileys) para la pantalla /agente-whatsapp.
// Sin clave: solo si está conectado y si el conector está corriendo. El QR
// y los pedidos al conector (desvincular / reiniciar) piden la clave del
// panel: con el QR, cualquiera podría vincular SU cuenta al agente.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** El conector escribe un latido cada 15 s: sin latido reciente, no está corriendo. */
const ONLINE_MS = 60_000;

function maskPhone(p: string | null) {
  return p && p.length > 6 ? `${p.slice(0, 5)}…${p.slice(-3)}` : p;
}

export async function GET(req: NextRequest) {
  const s = await prisma.whatsAppSession.findUnique({ where: { id: "baileys" } }).catch(() => null);
  const key = req.headers.get("x-panel-key");
  const unlocked = Boolean(key) && isValidPanelKey(key);
  const online = Boolean(s?.heartbeatAt && Date.now() - s.heartbeatAt.getTime() < ONLINE_MS);
  return NextResponse.json({
    exists: Boolean(s),
    workerOnline: online,
    status: online ? s?.status ?? "desconectado" : "desconectado",
    heartbeatAt: s?.heartbeatAt?.toISOString() ?? null,
    phone: unlocked ? s?.phone ?? null : maskPhone(s?.phone ?? null),
    name: s?.name ?? null,
    lastError: s?.lastError ?? null,
    pendingCommand: s?.command ?? null,
    info: s?.info ?? null,
    qr: unlocked && online && s?.status === "esperando_qr" ? s.qr : null,
    unlocked,
  });
}

export async function POST(req: NextRequest) {
  if (!isValidPanelKey(req.headers.get("x-panel-key"))) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Clave del panel incorrecta." }, { status: 401 });
  }
  const { command } = (await req.json().catch(() => ({}))) as { command?: string };
  if (command !== "logout" && command !== "restart") return NextResponse.json({ error: "Pedido desconocido." }, { status: 400 });
  await prisma.whatsAppSession.upsert({
    where: { id: "baileys" },
    create: { id: "baileys", status: "desconectado", command },
    update: { command },
  });
  return NextResponse.json({ ok: true });
}
