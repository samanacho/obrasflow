"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import "dhtmlx-gantt/codebase/dhtmlxgantt.css";
import type { ProjectDTO, ProjectType } from "@/lib/types";

const TYPE_HEX: Record<ProjectType, string> = { civil: "#4a6b85", electrico: "#a9803d", vial: "#726c61", otro: "#8172a3" };
const TYPE_LABEL: Record<ProjectType, string> = { civil: "Civil", electrico: "Eléctrico", vial: "Vial", otro: "Otro" };

/**
 * Cronograma interactivo con dhtmlx Gantt (Community Edition, MIT) — a
 * diferencia de nuestro Gantt casero, trae zoom de escala (día/semana/mes),
 * arrastrar para mover/extender tareas, y una grilla de datos editable al
 * costado, todo con una sola librería especializada en esto.
 */
export default function DhtmlxGanttChart({ projects }: { projects: ProjectDTO[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!containerRef.current || projects.length === 0) return;
    let ganttInstance: any;
    let mounted = true;

    import("dhtmlx-gantt").then(({ gantt }) => {
      if (!mounted || !containerRef.current) return;
      ganttInstance = gantt;

      gantt.config.date_format = "%Y-%m-%d";
      gantt.config.scales = [
        { unit: "month", step: 1, format: "%F %Y" },
        { unit: "week", step: 1, format: "Sem. %W" },
      ];
      gantt.config.scale_height = 54;
      gantt.config.row_height = 34;
      gantt.config.columns = [
        { name: "text", label: "Proyecto", tree: true, width: 180 },
        { name: "type", label: "Rubro", align: "center", width: 80 },
        { name: "progress", label: "Avance", align: "center", width: 70, template: (t: any) => `${Math.round((t.progress || 0) * 100)}%` },
      ];
      gantt.config.readonly = false;
      gantt.config.drag_links = false;
      gantt.config.drag_progress = false;

      gantt.templates.task_class = (_s: Date, _e: Date, task: any) => `of-gantt-task of-gantt-${task.rubro}`;
      gantt.templates.progress_text = (_s: Date, _e: Date, task: any) => `<span style="opacity:0">${Math.round(task.progress * 100)}%</span>`;

      if (containerRef.current.childElementCount === 0 || !gantt.$container) {
        gantt.init(containerRef.current);
      }

      const tasks = projects.map((p) => ({
        id: p.id,
        text: p.name,
        start_date: p.start,
        end_date: p.end,
        progress: Math.max(0, Math.min(1, p.progress / 100)),
        type: p.type === "otro" && p.customType ? p.customType : TYPE_LABEL[p.type],
        rubro: p.type,
        color: TYPE_HEX[p.type],
        textColor: "#fff",
      }));

      gantt.clearAll();
      gantt.parse({ data: tasks, links: [] });

      gantt.detachAllEvents?.();
      gantt.attachEvent("onTaskClick", (id: string) => {
        router.push(`/project/${id}`);
        return true;
      });
    });

    return () => {
      mounted = false;
      try {
        ganttInstance?.clearAll();
      } catch {
        /* noop — el contenedor ya puede estar desmontado */
      }
    };
  }, [projects, router]);

  if (projects.length === 0) {
    return <p className="empty-col">Sin proyectos todavía para mostrar en el cronograma.</p>;
  }

  return <div ref={containerRef} className="of-dhtmlx-gantt" />;
}
