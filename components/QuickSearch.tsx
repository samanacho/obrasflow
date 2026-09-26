"use client";

// Buscador rápido de toda la app (Ctrl+K o "/"): obras, pantallas y acciones.
// Se abre desde el encabezado; con ↑ ↓ se elige y con Enter se va.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CModal, CModalBody } from "@coreui/react";
import { NAV_ITEMS } from "@/lib/navItems";
import type { ProjectDTO } from "@/lib/types";

interface Entry {
  id: string;
  group: "Obras" | "Pantallas" | "Acciones";
  label: string;
  hint?: string;
  href: string;
  haystack: string;
}

const EXTRA_PAGES = [
  { label: "Registro rápido", href: "/registro-rapido", hint: "pagos sin clasificar" },
  { label: "Movimientos", href: "/movimientos", hint: "ingresos y egresos" },
  { label: "Obras por rubro", href: "/rubros" },
  { label: "Sitios", href: "/sitios" },
  { label: "Ejecución presupuestaria", href: "/ejecucion" },
  { label: "Tablero (Kanban)", href: "/?tab=kanban" },
  { label: "Tabla de obras", href: "/?tab=tabla" },
];
const ACTIONS = [{ label: "Nuevo proyecto", href: "/?nuevo=1", hint: "abre el asistente" }];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

export default function QuickSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [projects, setProjects] = useState<ProjectDTO[] | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);

  // Atajos globales.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Las obras se piden al abrir (y se refrescan cada vez que se abre).
  useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: ProjectDTO[]) => setProjects(Array.isArray(d) ? d : []))
      .catch(() => setProjects([]));
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const obras: Entry[] = (projects ?? []).map((p) => ({
      id: `o-${p.id}`,
      group: "Obras",
      label: p.name,
      hint: [p.reference, p.sitioNombre ? `Sitio ${p.sitioNombre}` : null, p.city].filter(Boolean).join(" · "),
      href: `/project/${p.id}`,
      haystack: norm([p.name, p.reference ?? "", p.sitioNombre ?? "", p.city ?? "", p.manager].join(" ")),
    }));
    const pages: Entry[] = [
      ...NAV_ITEMS.map((n) => ({ label: n.label, href: n.href, hint: undefined as string | undefined })),
      ...EXTRA_PAGES,
    ].map((p) => ({ id: `p-${p.href}`, group: "Pantallas" as const, label: p.label, hint: p.hint, href: p.href, haystack: norm(p.label) }));
    const actions: Entry[] = ACTIONS.map((a) => ({ id: `a-${a.href}`, group: "Acciones", label: a.label, hint: a.hint, href: a.href, haystack: norm(a.label) }));
    return [...actions, ...obras, ...pages];
  }, [projects]);

  const results = useMemo(() => {
    const words = norm(q.trim()).split(/\s+/).filter(Boolean);
    const hits = words.length ? entries.filter((e) => words.every((w) => e.haystack.includes(w))) : entries;
    // Sin texto: acciones, las primeras obras y las pantallas.
    if (!words.length) {
      return [...hits.filter((e) => e.group === "Acciones"), ...hits.filter((e) => e.group === "Obras").slice(0, 6), ...hits.filter((e) => e.group === "Pantallas")];
    }
    return hits.slice(0, 30);
  }, [entries, q]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const go = useCallback(
    (e: Entry | undefined) => {
      if (!e) return;
      setOpen(false);
      router.push(e.href);
    },
    [router]
  );

  let lastGroup = "";
  return (
    <>
      <button type="button" className="of-search-btn" onClick={() => setOpen(true)} title="Buscar (Ctrl+K)">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <span className="t">Buscar…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <CModal visible={open} onClose={() => setOpen(false)} alignment="top" className="of-search-modal" onShow={() => input.current?.focus()}>
        <CModalBody className="p-0">
          <div className="of-search-input">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              ref={input}
              value={q}
              placeholder="Buscar obra, pantalla o acción…"
              aria-label="Buscar"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSel((s) => Math.min(results.length - 1, s + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSel((s) => Math.max(0, s - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(results[sel]);
                }
              }}
            />
            <kbd>Esc</kbd>
          </div>
          <ul className="of-search-list" ref={list} role="listbox">
            {projects === null && <li className="of-search-empty">Cargando obras…</li>}
            {projects !== null && results.length === 0 && <li className="of-search-empty">Nada coincide con &quot;{q}&quot;.</li>}
            {results.map((r, i) => {
              const header = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              return (
                <li key={r.id} role="presentation">
                  {header && <div className="of-search-group">{header}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === sel}
                    data-i={i}
                    className={`of-search-item${i === sel ? " on" : ""}`}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => go(r)}
                  >
                    <span className="l">{r.label}</span>
                    {r.hint && <span className="h">{r.hint}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="of-search-foot">
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> elegir
            </span>
            <span>
              <kbd>Enter</kbd> abrir
            </span>
            <span>
              <kbd>/</kbd> o <kbd>Ctrl K</kbd> desde cualquier pantalla
            </span>
          </div>
        </CModalBody>
      </CModal>
    </>
  );
}
