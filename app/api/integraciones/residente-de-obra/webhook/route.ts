import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SIGNATURE_HEADER, verifySignature } from "@/lib/integraciones/residente/signature";
import { checkEvent, esPendiente, processEvent } from "@/lib/integraciones/residente/process";
import { SOURCE } from "@/lib/integraciones/residente/types";

// Webhook de Residente de Obra. URL para darles:
//   https://obrasflow-app.vercel.app/api/integraciones/residente-de-obra/webhook
// Firma: "X-Signature: sha256=<HMAC del cuerpo>" con RESIDENTE_WEBHOOK_SECRET.
// Para probar sin su API: scripts/simular-webhook-residente.mjs.
// Ver docs/RESPUESTA_HANDOFF_RESIDENTE_DE_OBRA.md.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = process.env.RESIDENTE_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Integración no configurada." }, { status: 503 });

  // La firma se calcula sobre el cuerpo CRUDO: leerlo como texto antes de parsear.
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get(SIGNATURE_HEADER), secret)) {
    console.warn("Residente de Obra: firma inválida, pedido descartado");
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const check = checkEvent(body);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  // Se deduplica por el id del evento, que viene dentro del cuerpo firmado
  // (el header X-Delivery-Id no va firmado: cualquiera podría inventarlo).
  const deliveryId = check.event.id;

  // Se guarda primero (deduplicado): si el mismo envío llega dos veces, el
  // segundo no hace nada. Lo que no se pueda aplicar queda para reprocesar.
  let row;
  try {
    row = await prisma.integrationEvent.create({
      data: { source: SOURCE, deliveryId, event: check.event.event, payload: body as Prisma.InputJsonValue },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Ya lo teníamos. Si quedó pendiente (o colgado en "recibido" porque se
      // cortó la función), el reintento lo procesa; si no, es un duplicado.
      const previo = await prisma.integrationEvent.findUnique({ where: { source_deliveryId: { source: SOURCE, deliveryId } } });
      if (!previo || !esPendiente(previo)) return NextResponse.json({ ok: true, duplicado: true });
      const result = await processEvent(previo);
      return NextResponse.json({ ok: true, estado: result.status, ...(result.error ? { detalle: result.error } : {}) });
    }
    console.error("Residente de Obra: no se pudo guardar el evento", err);
    return NextResponse.json({ error: "No se pudo guardar el evento." }, { status: 500 });
  }

  // Respondemos 200 aunque no se haya podido aplicar (ej. obra sin código):
  // el evento ya está guardado y reintentarlo no cambiaría nada.
  const result = await processEvent(row);
  return NextResponse.json({ ok: true, estado: result.status, ...(result.error ? { detalle: result.error } : {}) });
}
