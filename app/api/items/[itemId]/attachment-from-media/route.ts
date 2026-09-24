import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeAttachmentMeta } from "@/lib/serialize";

export const dynamic = "force-dynamic";

interface Params {
  params: { itemId: string };
}

/**
 * Adjunta a un movimiento de obra un comprobante que llegó por WhatsApp
 * (InboundMedia). Lo usa /registro-rapido: cuando una captura que trajo foto
 * se clasifica en una obra, el comprobante pasa al movimiento nuevo y se ve
 * en la ficha como cualquier adjunto. Si el movimiento ya tiene un adjunto
 * (el usuario subió su propio archivo en el formulario) NO lo pisa: un item
 * guarda como mucho uno, y el que eligió el usuario manda.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json().catch(() => ({}))) as { mediaId?: string };
    if (!body.mediaId) return NextResponse.json({ error: "Falta mediaId." }, { status: 400 });

    const [item, media] = await Promise.all([
      prisma.projectItem.findUnique({ where: { id: params.itemId }, select: { id: true } }),
      prisma.inboundMedia.findUnique({ where: { id: String(body.mediaId) } }),
    ]);
    if (!item) return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
    if (!media) return NextResponse.json({ error: "Comprobante no encontrado." }, { status: 404 });

    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.attachment.findFirst({ where: { projectItemId: item.id } });
      if (existing) return null;
      return tx.attachment.create({
        data: {
          projectItemId: item.id,
          filename: media.filename || `comprobante-whatsapp.${media.mimeType === "application/pdf" ? "pdf" : "jpg"}`,
          mimeType: media.mimeType,
          size: media.size,
          data: media.data,
        },
      });
    });
    if (!created) return NextResponse.json({ skipped: true, reason: "El movimiento ya tiene un adjunto." }, { status: 200 });
    return NextResponse.json(serializeAttachmentMeta(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo adjuntar el comprobante." }, { status: 500 });
  }
}
