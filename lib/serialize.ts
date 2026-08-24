import type { Project, ProjectItem } from "@prisma/client";
import type { ProjectDTO, ProjectItemDTO } from "./types";

/** Convierte el registro de Prisma (Decimal, Date) a la forma plana que consume el frontend. */
export function serializeProject(p: Project): ProjectDTO {
  return {
    id: p.id,
    name: p.name,
    type: p.type as ProjectDTO["type"],
    status: p.status as ProjectDTO["status"],
    manager: p.manager,
    start: p.start.toISOString().slice(0, 10),
    end: p.end.toISOString().slice(0, 10),
    budget: Number(p.budget),
    spent: Number(p.spent),
    progress: p.progress,
  };
}

export function serializeItem(i: ProjectItem): ProjectItemDTO {
  return {
    id: i.id,
    projectId: i.projectId,
    kind: i.kind,
    title: i.title,
    status: i.status,
    data: (i.data as Record<string, any>) ?? {},
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}
