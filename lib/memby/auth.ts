import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Rutas /api/memby/*: solo las puede usar el conector de Memby, con la clave
 * MEMBY_CONNECTOR_KEY (env var de Vercel y del conector). Sin clave
 * configurada, las rutas quedan apagadas (503).
 */
export function checkConnectorKey(req: NextRequest): NextResponse | null {
  const key = process.env.MEMBY_CONNECTOR_KEY?.trim();
  if (!key) return NextResponse.json({ error: "Conector de Memby no configurado." }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${key}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return null;
}
