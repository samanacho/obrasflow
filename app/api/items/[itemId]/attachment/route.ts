import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeAttachmentMeta } from "@/lib/serialize";

export const dynamic = "force-dynamic";

interface Params {
  params: { itemId: string };
}

// Vercel limita el body de una función serverless a ~4.5MB — 4MB deja
// margen para el resto del multipart. Es una limitación real: si esto
// se vuelve un problema (PDFs escaneados de varias páginas, por
// ejemplo), el próximo paso sería mover el storage a Vercel Blob en vez
// de guardar el archivo en la propia base — pero eso necesita provisionar
// Blob storage en el dashboard de Vercel primero, algo que hoy no está
// configurado en este proyecto.
const MAX_SIZE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

/** Sube (o reemplaza) el único archivo adjunto de un item — un item guarda como mucho uno a la vez. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const item = await prisma.projectItem.findUnique({ where: { id: params.itemId } });
    if (!item) return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
    }
    if (file.size === 0) return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "El archivo no puede superar los 4MB. Probá con una foto de menor resolución o comprimí el PDF." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Formato no soportado — subí una foto (JPG/PNG/WEBP/HEIC) o un PDF." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Un item guarda como mucho un adjunto — subir uno nuevo reemplaza al anterior.
    const created = await prisma.$transaction(async (tx) => {
      await tx.attachment.deleteMany({ where: { projectItemId: params.itemId } });
      return tx.attachment.create({
        data: {
          projectItemId: params.itemId,
          filename: file.name || "comprobante",
          mimeType: file.type,
          size: file.size,
          data: buffer,
        },
      });
    });

    return NextResponse.json(serializeAttachmentMeta(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo subir el archivo." }, { status: 500 });
  }
}
