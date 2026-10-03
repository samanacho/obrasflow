import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeItem } from "@/lib/serialize";
import { ITEM_KINDS } from "@/lib/itemKinds";
import { recomputeProjectSpent } from "@/lib/spent";
import { APP_SOURCE, logChanges } from "@/lib/history";
import { fmtGs } from "@/lib/agent/format";

export const dynamic = "force-dynamic";

interface Params {
  params: { itemId: string };
}

const ATTACHMENT_META_SELECT = { id: true, filename: true, mimeType: true, size: true, createdAt: true };

type JsonObj = Record<string, unknown>;
const asObj = (v: unknown): JsonObj => (v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObj) : {});
const hasValue = (v: unknown) => v !== undefined && v !== null && v !== "";
const fmtMonto = (v: unknown) => (hasValue(v) && Number.isFinite(Number(v)) ? fmtGs(Number(v)) : "—");
const fmtFecha = (v: unknown) => {
  if (!hasValue(v)) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(v);
};

/** "💸 movimiento \"Cemento\": título \"A\" → \"B\" · monto Gs. 1 → Gs. 2" — o null si no cambió nada que valga anotar. */
function describeEdit(
  kind: string,
  before: { title: string; status: string | null; data: unknown },
  after: { title: string; status: string | null; data: unknown }
): string | null {
  const cfg = ITEM_KINDS[kind];
  const parts: string[] = [];
  if (before.title !== after.title) parts.push(`título "${before.title}" → "${after.title}"`);
  if ((before.status ?? null) !== (after.status ?? null)) parts.push(`estado ${before.status ?? "—"} → ${after.status ?? "—"}`);
  if (kind === "change_order") {
    const b = asObj(before.data);
    const a = asObj(after.data);
    if (fmtMonto(b.monto) !== fmtMonto(a.monto)) parts.push(`monto ${fmtMonto(b.monto)} → ${fmtMonto(a.monto)}`);
    if (fmtFecha(b.fecha) !== fmtFecha(a.fecha)) parts.push(`fecha ${fmtFecha(b.fecha)} → ${fmtFecha(a.fecha)}`);
  }
  if (!parts.length) {
    // Cambiaron otros campos del registro (descripción, proveedor…): se anota igual, sin detalle.
    if (JSON.stringify(before.data ?? {}) === JSON.stringify(after.data ?? {})) return null;
    parts.push("se cambiaron otros datos");
  }
  return `${cfg?.icon ?? "📝"} ${cfg?.singular ?? "registro"} "${after.title}": ${parts.join(" · ")}`;
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as { title?: string; status?: string | null; data?: unknown };
    const existing = await prisma.projectItem.findUnique({ where: { id: params.itemId } });
    if (!existing) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    if (ITEM_KINDS[existing.kind]?.readOnly) {
      return NextResponse.json({ error: "Este registro es de solo lectura." }, { status: 400 });
    }
    if (existing.externalSource) {
      return NextResponse.json({ error: "Este registro viene de otra app y se corrige allá." }, { status: 400 });
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
      include: { attachments: { select: ATTACHMENT_META_SELECT, orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (existing.kind === "change_order") await recomputeProjectSpent(existing.projectId);

    const detail = describeEdit(existing.kind, existing, updated);
    if (detail) {
      await logChanges(prisma, existing.projectId, [{ action: "registro_editado", detail }], APP_SOURCE);
    }

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
    // Se lee antes de borrar para poder anotar en el historial qué se borró.
    const existing = await prisma.projectItem.findUnique({ where: { id: params.itemId } });
    if (!existing) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    if (existing.externalSource) {
      return NextResponse.json({ error: "Este registro viene de otra app y se corrige allá." }, { status: 400 });
    }
    const deleted = await prisma.projectItem.delete({ where: { id: params.itemId } });
    if (deleted.kind === "change_order") await recomputeProjectSpent(deleted.projectId);
    if (existing.kind !== "activity") {
      const cfg = ITEM_KINDS[existing.kind];
      const monto = asObj(existing.data).monto;
      await logChanges(
        prisma,
        existing.projectId,
        [
          {
            action: "registro_borrado",
            detail: `${cfg?.icon ?? "🗑️"} ${cfg?.singular ?? "registro"}: "${existing.title}"` + (hasValue(monto) ? ` · ${fmtMonto(monto)}` : ""),
          },
        ],
        APP_SOURCE
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "No encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar." }, { status: 500 });
  }
}
