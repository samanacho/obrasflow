import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeItem } from "@/lib/serialize";
import { ITEM_KINDS } from "@/lib/itemKinds";
import { recomputeProjectSpent } from "@/lib/spent";

export const dynamic = "force-dynamic";

interface Params {
  params: { itemId: string };
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as { title?: string; status?: string | null; data?: unknown };
    const existing = await prisma.projectItem.findUnique({ where: { id: params.itemId } });
    if (!existing) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    if (ITEM_KINDS[existing.kind]?.readOnly) {
      return NextResponse.json({ error: "Este registro es de solo lectura." }, { status: 400 });
    }

    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "El título es obligatorio." }, { status: 400 });

    const updated = await prisma.projectItem.update({
      where: { id: params.itemId },
      data: {
        title,
        status: body.status === undefined ? existing.status : body.status,
        data: (body.data as any) ?? existing.data,
      },
    });

    if (existing.kind === "change_order") await recomputeProjectSpent(existing.projectId);

    return NextResponse.json(serializeItem(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const deleted = await prisma.projectItem.delete({ where: { id: params.itemId } });
    if (deleted.kind === "change_order") await recomputeProjectSpent(deleted.projectId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar." }, { status: 500 });
  }
}
