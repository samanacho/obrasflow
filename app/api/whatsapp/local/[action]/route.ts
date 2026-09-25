import { NextRequest, NextResponse } from "next/server";

// Puente entre la pantalla /agente-whatsapp y el conector de WhatsApp que
// corre en esta misma PC (worker/whatsapp-baileys.mts, escucha solo en
// 127.0.0.1:3099). Solo funciona cuando la app corre localmente: en Vercel
// el conector no existe y la respuesta es { available: false }.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONNECTOR = `http://127.0.0.1:${process.env.CONNECTOR_PORT || 3099}`;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Solo desde la propia PC: si alguien entra a la app por otra dirección, no ve el QR ni la configuración. */
function fromThisPc(req: NextRequest) {
  return LOCAL_HOSTS.has(req.nextUrl.hostname);
}

async function forward(path: string, init?: RequestInit) {
  try {
    const res = await fetch(`${CONNECTOR}${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(init?.method === "POST" ? 120_000 : 2_500) });
    const body = await res.json().catch(() => ({}));
    return NextResponse.json({ available: true, ...body }, { status: res.status });
  } catch {
    return NextResponse.json({ available: false });
  }
}

export async function GET(req: NextRequest, { params }: { params: { action: string } }) {
  if (!fromThisPc(req) || params.action !== "state") return NextResponse.json({ available: false });
  return forward("/state");
}

export async function POST(req: NextRequest, { params }: { params: { action: string } }) {
  if (!fromThisPc(req)) return NextResponse.json({ available: false }, { status: 403 });
  if (params.action !== "config" && params.action !== "command") return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  const body = await req.text();
  return forward(`/${params.action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
}
