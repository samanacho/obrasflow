import { prisma } from "./prisma";

// Servidor únicamente (usa Prisma) — igual criterio que lib/spent.ts.

/**
 * Forma "comparable" de un nombre de sitio: sin tildes, sin mayúsculas y con
 * espacios colapsados — "Cnel. Oviedo", "cnel.  oviedo" y "CNEL. OVIEDO" son
 * el mismo sitio. Así un error de tipeo menor no crea un sitio duplicado.
 */
export function sitioKey(nombre: string): string {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Busca un sitio con el mismo nombre comparable (ver sitioKey), opcionalmente excluyendo uno. */
export async function findSitioByNombre(nombre: string, excludeId?: string): Promise<{ id: string; nombre: string } | null> {
  const key = sitioKey(nombre);
  // Son pocos sitios: traerlos y comparar en JS permite ignorar tildes, algo
  // que el filtro "insensitive" de Prisma/Postgres no hace.
  const all = await prisma.sitio.findMany({ select: { id: true, nombre: true } });
  return all.find((s) => s.id !== excludeId && sitioKey(s.nombre) === key) ?? null;
}

/**
 * Resuelve el "Sitio" (texto libre, con sugerencias, ver components/
 * NewProjectWizard.tsx) al que el usuario quiere vincular una obra: busca
 * un Sitio existente con ese nombre (sin importar mayúsculas, tildes ni
 * espacios de más) y, si no existe, lo crea. El responsable del Sitio nuevo
 * arranca igual al responsable de la obra que lo crea — es solo un valor
 * inicial editable después desde /sitios/[id], nunca se vuelve a pisar en
 * cargas siguientes. `nombre` vacío/null desvincula (devuelve null).
 */
export async function resolveSitioId(nombre: string | null, defaultResponsable: string): Promise<string | null> {
  const trimmed = (nombre ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  const existing = await findSitioByNombre(trimmed);
  if (existing) return existing.id;

  const created = await prisma.sitio.create({
    data: { nombre: trimmed, responsable: defaultResponsable.trim() || "Sin asignar" },
  });
  return created.id;
}
