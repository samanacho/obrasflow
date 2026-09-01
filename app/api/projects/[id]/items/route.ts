import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeItem } from "@/lib/serialize";
import { ITEM_KINDS } from "@/lib/itemKinds";
import { recomputeProjectSpent } from "@/lib/spent";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

// Nunca seleccionar `data` (Bytes) acá — los items se listan seguido y no
// hace falta el contenido del archivo para mostrar la fila, solo su
// metadata (nombre/tipo/tamaño). El contenido real se sirve aparte por
// GET /api/attachments/[id], bajo demanda.
const ATTACHMENT_META_SELECT = { id: true, filename: true, mimeType: true, size: true, createdAt: true };

/** Lista los items de un proyecto, opcionalmente filtrados por ?kind=. */
export async function GET(req: NextRequest, { params }: Params) {
  const kind = req.nextUrl.searchParams.get("kind");
  const items = await prisma.projectItem.findMany({
    where: { projectId: params.id, ...(kind ? { kind } : {}) },
    include: { attachments: { select: ATTACHMENT_META_SELECT, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(items.map(serializeItem));
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as { kind?: string; title?: string; status?: string; data?: unknown };
    const kind = String(body.kind ?? "");
    const config = ITEM_KINDS[kind];
    if (!config) return NextResponse.json({ error: `Módulo inválido: "${kind}".` }, { status: 400 });

    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "El título es obligatorio." }, { status: 400 });

    const created = await prisma.projectItem.create({
      data: {
        projectId: params.id,
        kind,
        title,
        status: body.status ? String(body.status) : config.defaultStatus ?? null,
        data: (body.data as any) ?? {},
      },
    });

    // Feed de actividad automático (excepto para el propio feed).
    if (kind !== "activity") {
      await prisma.projectItem.create({
        data: {
          projectId: params.id,
          kind: "activity",
          title: `${config.icon} Se agregó ${config.singular}: "${title}"`,
          data: {},
        },
      });
    }

    // Movimientos: el Ejecutado de la ficha se recalcula solo a partir de
    // estos items, así que hay que actualizarlo cada vez que se carga uno.
    if (kind === "change_order") await recomputeProjectSpent(params.id);

    return NextResponse.json(serializeItem(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo crear el registro." }, { status: 500 });
  }
}
