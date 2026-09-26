import { NextRequest, NextResponse } from "next/server";
// Tablas de Memby: en la app local pueden venir de producción (ver lib/memby/chat-db.ts).
import { membyDb as prisma } from "@/lib/memby/chat-db";

// Conversación reciente con el agente para el chat de /agente-whatsapp
// (modo local). Solo desde esta PC y nunca en Vercel: son mensajes privados.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function localPc(req: NextRequest) {
  return !process.env.VERCEL && ["localhost", "127.0.0.1", "[::1]"].includes(req.nextUrl.hostname);
}

export async function GET(req: NextRequest) {
  if (!localPc(req)) return NextResponse.json({ available: false }, { status: 403 });
  const session = await prisma.whatsAppSession.findUnique({ where: { id: "baileys" }, select: { phone: true } });
  if (!session?.phone) return NextResponse.json({ available: true, messages: [] });

  const rows = await prisma.whatsAppMessage.findMany({
    where: { phone: session.phone },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, direction: true, text: true, mediaId: true, proposalId: true, createdAt: true },
  });
  const ids = rows.map((r) => r.proposalId).filter((x): x is string => Boolean(x));
  const proposals = ids.length
    ? await prisma.whatsAppPendingAction.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, confirmCode: true, expiresAt: true, kind: true },
      })
    : [];
  const byId = new Map(proposals.map((p) => [p.id, p]));
  const mediaIds = rows.map((r) => r.mediaId).filter((x): x is string => Boolean(x));
  const medias = mediaIds.length
    ? await prisma.inboundMedia.findMany({ where: { id: { in: mediaIds } }, select: { id: true, mimeType: true, filename: true } })
    : [];
  const mediaById = new Map(medias.map((m) => [m.id, m]));

  return NextResponse.json({
    available: true,
    messages: rows.reverse().map((r) => {
      const p = r.proposalId ? byId.get(r.proposalId) : undefined;
      return {
        id: r.id,
        from: r.direction === "in" ? "user" : "agent",
        text: r.text ?? "",
        mediaId: r.mediaId,
        media: r.mediaId && mediaById.has(r.mediaId) ? { mimeType: mediaById.get(r.mediaId)!.mimeType, filename: mediaById.get(r.mediaId)!.filename } : null,
        createdAt: r.createdAt.toISOString(),
        proposal: p
          ? {
              id: p.id,
              kind: p.kind,
              status: p.status === "pendiente" && p.expiresAt < new Date() ? "vencida" : p.status,
              code: p.confirmCode,
            }
          : null,
      };
    }),
  });
}
