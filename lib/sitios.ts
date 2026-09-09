import { prisma } from "./prisma";

// Servidor únicamente (usa Prisma) — igual criterio que lib/spent.ts.

/**
 * Resuelve el "Sitio" (texto libre, con sugerencias, ver components/
 * NewProjectWizard.tsx) al que el usuario quiere vincular una obra: busca
 * un Sitio existente con ese nombre (sin importar mayúsculas/espacios) y,
 * si no existe, lo crea. El responsable del Sitio nuevo arranca igual al
 * responsable de la obra que lo crea — es solo un valor inicial editable
 * después desde /sitios/[id], nunca se vuelve a pisar en cargas siguientes.
 * `nombre` vacío/null desvincula (devuelve null).
 */
export async function resolveSitioId(nombre: string | null, defaultResponsable: string): Promise<string | null> {
  const trimmed = (nombre ?? "").trim();
  if (!trimmed) return null;

  const existing = await prisma.sitio.findFirst({
    where: { nombre: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) return existing.id;

  const created = await prisma.sitio.create({
    data: { nombre: trimmed, responsable: defaultResponsable.trim() || "Sin asignar" },
  });
  return created.id;
}
