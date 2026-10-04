import { NextRequest, NextResponse } from "next/server";
// Tablas de Memby: en la app local pueden venir de producción (ver lib/memby/chat-db.ts).
import { membyDb } from "@/lib/memby/chat-db";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/** Sirve un comprobante recibido por WhatsApp (ver InboundMedia) — mismo criterio que /api/attachments/[id]. */
export async function GET(_req: NextRequest, { params }: Params) {
  // Las facturas de pedidos de compra subidas desde la app quedan en la base de la app.
  const media =
    (await membyDb.inboundMedia.findUnique({ where: { id: params.id } })) ??
    (membyDb === prisma ? null : await prisma.inboundMedia.findUnique({ where: { id: params.id } }));
  if (!media) return NextResponse.json({ error: "Comprobante no encontrado." }, { status: 404 });
  const filename = media.filename || `comprobante.${media.mimeType === "application/pdf" ? "pdf" : "jpg"}`;
  return new NextResponse(new Uint8Array(media.data), {
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(media.size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // Un HTML/SVG recibido se muestra como archivo, sin ejecutar nada en el dominio de la app.
      // Al PDF no se le pone sandbox: Chrome bloquea su visor dentro de un documento con sandbox.
      ...(media.mimeType === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox" }),
    },
  });
}
