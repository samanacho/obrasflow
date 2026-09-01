import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/** Sirve el contenido real del archivo — la única ruta que toca la columna `data` (Bytes). */
export async function GET(_req: NextRequest, { params }: Params) {
  const attachment = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!attachment) return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });

  return new NextResponse(new Uint8Array(attachment.data), {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType,
      // "inline" para que una foto/PDF se pueda ver en una pestaña nueva
      // en vez de forzar la descarga — mismo comportamiento que ya tenían
      // los links a comprobantes externos.
      "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.attachment.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar el archivo." }, { status: 500 });
  }
}
