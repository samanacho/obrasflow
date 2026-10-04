import { NextRequest, NextResponse } from "next/server";
import { APP_SOURCE } from "@/lib/history";
import { CompraError, annulOrder, approveOrder, payOrder, registerInvoice, rejectOrder, serializeOrder } from "@/lib/compras/core";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string; accion: string };
}

const MAX_SIZE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * Acciones del pedido:
 *  aprobar · rechazar { motivo? } · anular
 *  pagar { monto, fecha?, medioPago?, supplierId?, proveedorNombre?, rubro?, precios?: [{lineId, precioUnitario}] }
 *  factura (multipart: tipo?, numero?, ruc?, fecha?, iva10?, iva5?, file?)
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id, accion } = params;
    let order;
    if (accion === "aprobar") order = await approveOrder(id, APP_SOURCE);
    else if (accion === "rechazar") {
      const b = (await req.json().catch(() => ({}))) as { motivo?: string };
      order = await rejectOrder(id, APP_SOURCE, b.motivo ?? null);
    } else if (accion === "anular") order = await annulOrder(id);
    else if (accion === "pagar") {
      const b = (await req.json()) as Record<string, any>;
      order = await payOrder(id, {
        monto: Number(b.monto),
        fecha: b.fecha ? String(b.fecha) : null,
        medioPago: b.medioPago ? String(b.medioPago) : null,
        ...("supplierId" in b ? { supplierId: b.supplierId ? String(b.supplierId) : null } : {}),
        proveedorNombre: b.proveedorNombre ? String(b.proveedorNombre) : null,
        rubro: b.rubro ? String(b.rubro) : null,
        precios: Array.isArray(b.precios) ? b.precios.map((p: any) => ({ lineId: String(p.lineId), precioUnitario: Number(p.precioUnitario) })).filter((p: any) => Number.isFinite(p.precioUnitario)) : [],
        por: APP_SOURCE,
      });
    } else if (accion === "factura") {
      const form = await req.formData();
      const file = form.get("file");
      let upload: { data: Buffer; mimeType: string; filename: string } | null = null;
      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_SIZE_BYTES) return NextResponse.json({ error: "El archivo pesa más de 4 MB." }, { status: 400 });
        if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Subí una foto (JPG, PNG, WEBP) o un PDF." }, { status: 400 });
        upload = { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type, filename: file.name || "factura" };
      }
      const s = (k: string) => (form.has(k) ? String(form.get(k) ?? "") : undefined);
      order = await registerInvoice(id, {
        tipo: s("tipo"),
        numero: s("numero"),
        ruc: s("ruc"),
        fecha: s("fecha"),
        ...(form.has("iva10") ? { iva10: numOrNull(form.get("iva10")) } : {}),
        ...(form.has("iva5") ? { iva5: numOrNull(form.get("iva5")) } : {}),
        file: upload,
        por: APP_SOURCE,
      });
    } else {
      return NextResponse.json({ error: "Acción desconocida." }, { status: 404 });
    }
    return NextResponse.json(await serializeOrder(order));
  } catch (err) {
    if (err instanceof CompraError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "No se pudo completar la acción." }, { status: 500 });
  }
}
