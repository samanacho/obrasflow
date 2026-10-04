import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeItem } from "@/lib/serialize";
import { ITEM_KINDS } from "@/lib/itemKinds";
import { recomputeProjectSpent } from "@/lib/spent";
import { logChanges } from "@/lib/history";
import { appSource } from "@/lib/auth/server";
import { fmtGs } from "@/lib/agent/format";
import { enlaceInvalido, ERROR_ENLACE, normalizeMovimientoData } from "@/lib/validate";

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

/** Un solo registro (lo usa la ficha de un pedido de compra para no traer todos los movimientos de la obra). */
export async function GET(_req: NextRequest, { params }: Params) {
  const item = await prisma.projectItem.findUnique({
    where: { id: params.itemId },
    include: { attachments: { select: ATTACHMENT_META_SELECT, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!item) return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  return NextResponse.json(serializeItem(item));
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

    let data = body.data;
    if (existing.kind === "change_order" && data !== undefined && data !== null) {
      const n = normalizeMovimientoData(data);
      if ("error" in n) return NextResponse.json({ error: n.error }, { status: 400 });
      data = n.data;
    }
    if (enlaceInvalido(data)) return NextResponse.json({ error: ERROR_ENLACE }, { status: 400 });

    // Todo o nada: el registro, el Ejecutado de la obra y el monto del pedido
    // de compra quedan iguales entre sí (mismo criterio que lib/items.ts).
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.projectItem.update({
        where: { id: params.itemId },
        data: {
          title,
          status: body.status === undefined ? existing.status : body.status,
          data: (data as any) ?? existing.data,
        },
        include: { attachments: { select: ATTACHMENT_META_SELECT, orderBy: { createdAt: "desc" }, take: 1 } },
      });

      if (existing.kind === "change_order") {
        await recomputeProjectSpent(existing.projectId, tx);
        // Si es el gasto de un pedido de compra pagado, el pedido muestra el mismo monto.
        const monto = Number(asObj(updated.data).monto);
        if (Number.isFinite(monto) && monto !== Number(asObj(existing.data).monto)) {
          await tx.purchaseOrder.updateMany({ where: { gastoItemId: existing.id, status: "pagado" }, data: { montoPagado: monto } });
        }
      }
      return updated;
    });

    const detail = describeEdit(existing.kind, existing, updated);
    if (detail) {
      await logChanges(prisma, existing.projectId, [{ action: "registro_editado", detail }], await appSource());
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
    // Todo o nada: no queda un Ejecutado viejo ni un pedido "pagado" con un gasto que ya no existe.
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.projectItem.delete({ where: { id: params.itemId } });
      if (deleted.kind === "change_order") {
        await recomputeProjectSpent(deleted.projectId, tx);
        // Era el gasto de un pedido de compra: el pedido vuelve a "por pagar" (la factura cargada se conserva).
        await tx.purchaseOrder.updateMany({
          where: { gastoItemId: deleted.id, status: "pagado" },
          data: { status: "aprobado", gastoItemId: null, montoPagado: null, pagadoAt: null, grupoAvisado: "aprobado" },
        });
      }
    });
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
        await appSource()
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
