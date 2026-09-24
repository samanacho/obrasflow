import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/** Sirve un comprobante recibido por WhatsApp (ver InboundMedia) — mismo criterio que /api/attachments/[id]. */
export async function GET(_req: NextRequest, { params }: Params) {
  const media = await prisma.inboundMedia.findUnique({ where: { id: params.id } });
  if (!media) return NextResponse.json({ error: "Comprobante no encontrado." }, { status: 404 });
  const filename = media.filename || `comprobante.${media.mimeType === "application/pdf" ? "pdf" : "jpg"}`;
  return new NextResponse(new Uint8Array(media.data), {
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(media.size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
