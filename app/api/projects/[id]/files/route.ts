import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ITEM_KINDS } from "@/lib/itemKinds";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

/** Datos del item que acompañan a cada archivo/enlace de la galería. */
export interface FileItemRef {
  id: string;
  kind: string;
  kindLabel: string;
  icon: string;
  title: string;
  fecha: string;
  monto: number | null;
}

export type ProjectFileEntry =
  | {
      id: string;
      filename: string;
      mimeType: string;
      size: number;
      createdAt: string;
      isLink?: false;
      item: FileItemRef;
    }
  | {
      id: string;
      url: string;
      isLink: true;
      createdAt: string;
      item: FileItemRef;
    };

function itemRef(item: { id: string; kind: string; title: string; data: unknown; createdAt: Date }): FileItemRef {
  const cfg = ITEM_KINDS[item.kind];
  const d = (item.data && typeof item.data === "object" ? item.data : {}) as Record<string, any>;
  const fecha = typeof d.fecha === "string" && /^\d{4}-\d{2}-\d{2}/.test(d.fecha)
    ? d.fecha.slice(0, 10)
    : item.createdAt.toISOString().slice(0, 10);
  // El formulario guarda los campos numéricos como texto ("1500000"), así
  // que se acepta tanto number como string numérico.
  const montoNum =
    typeof d.monto === "number" ? d.monto
    : typeof d.monto === "string" && d.monto.trim() !== "" ? Number(d.monto)
    : null;
  return {
    id: item.id,
    kind: item.kind,
    kindLabel: cfg?.label ?? item.kind,
    icon: cfg?.icon ?? "📁",
    title: item.title,
    fecha,
    monto: montoNum !== null && Number.isFinite(montoNum) ? montoNum : null,
  };
}

/**
 * Galería "Fotos y documentos" de una obra: todos los archivos adjuntos de
 * sus items (fotos, documentos, comprobantes de gastos...) más los enlaces
 * externos de Fotos/Documentos que todavía no tienen archivo subido.
 * Solo metadata — NUNCA se selecciona `data` (Bytes): el contenido se sirve
 * aparte por GET /api/attachments/[id].
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const items = await prisma.projectItem.findMany({
      where: { projectId: params.id },
      select: {
        id: true,
        kind: true,
        title: true,
        data: true,
        createdAt: true,
        attachments: {
          select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const entries: ProjectFileEntry[] = [];
    for (const item of items) {
      const ref = itemRef(item);
      for (const a of item.attachments) {
        entries.push({
          id: a.id,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          createdAt: a.createdAt.toISOString(),
          item: ref,
        });
      }
      if (item.attachments.length === 0 && (item.kind === "photo" || item.kind === "document")) {
        const d = (item.data && typeof item.data === "object" ? item.data : {}) as Record<string, any>;
        const url = typeof d.url === "string" ? d.url.trim() : "";
        if (url) {
          entries.push({
            id: `link-${item.id}`,
            url,
            isLink: true,
            createdAt: item.createdAt.toISOString(),
            item: ref,
          });
        }
      }
    }

    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json(entries);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudieron cargar los archivos de la obra." }, { status: 500 });
  }
}
