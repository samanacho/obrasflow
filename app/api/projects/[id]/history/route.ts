import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { APP_SOURCE } from "@/lib/history";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

const LIMIT = 300;

export interface HistoryEntryDTO {
  id: string;
  action: string;
  field: string | null;
  before: string | null;
  after: string | null;
  detail: string | null;
  source: string;
  createdAt: string;
}

/**
 * Historial de cambios de la obra (lo más nuevo primero): las filas de
 * ProjectChange + el feed de actividad viejo (ProjectItem kind "activity")
 * de ANTES de que existiera el historial, así la ficha no arranca vacía.
 * El feed se sigue escribiendo, pero lo posterior al primer cambio
 * anotado ya está en ProjectChange y no se repite.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Proyecto no encontrado." }, { status: 404 });

    let changes: HistoryEntryDTO[] = [];
    let firstChangeAt: Date | null = null;
    try {
      const [rows, first] = await Promise.all([
        prisma.projectChange.findMany({
          where: { projectId: params.id },
          orderBy: { createdAt: "desc" },
          take: LIMIT,
        }),
        prisma.projectChange.findFirst({
          where: { projectId: params.id },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ]);
      firstChangeAt = first?.createdAt ?? null;
      changes = rows.map((r) => ({
        id: r.id,
        action: r.action,
        field: r.field,
        before: r.before,
        after: r.after,
        detail: r.detail,
        source: r.source,
        createdAt: r.createdAt.toISOString(),
      }));
    } catch (err) {
      // La tabla puede no existir todavía (falta `prisma db push`): se
      // muestra al menos el feed viejo en vez de un error.
      console.error("No se pudo leer el historial de cambios:", err);
    }

    const legacy = await prisma.projectItem.findMany({
      where: {
        projectId: params.id,
        kind: "activity",
        ...(firstChangeAt ? { createdAt: { lt: firstChangeAt } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      select: { id: true, title: true, createdAt: true },
    });

    const legacyEntries: HistoryEntryDTO[] = legacy.map((it) => ({
      id: `activity-${it.id}`,
      action: "registro_agregado",
      field: null,
      before: null,
      after: null,
      detail: it.title,
      source: APP_SOURCE,
      createdAt: it.createdAt.toISOString(),
    }));

    const all = [...changes, ...legacyEntries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return NextResponse.json(all);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo cargar el historial." }, { status: 500 });
  }
}
