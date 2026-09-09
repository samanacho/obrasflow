import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeSitio } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/**
 * Listado de Sitios (grupos de obras que son en realidad frentes de un
 * mismo lugar — ver model Sitio en prisma/schema.prisma). Alta/edición de
 * un Sitio en sí NO tiene formulario propio: se crea/vincula desde el
 * campo "Sitio" del alta de obra (components/NewProjectWizard.tsx, ver
 * lib/sitios.ts resolveSitioId) — acá solo se lista y se administra
 * (nombre/responsable/notas, y qué obras pertenecen) desde /sitios/[id].
 */
export async function GET() {
  const sitios = await prisma.sitio.findMany({
    include: { projects: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(sitios.map(serializeSitio));
}
