"use client";

// Atajos de teclado de la app. Cada pantalla registra los suyos con
// useShortcuts(); la tecla "?" muestra la ayuda con todos los disponibles.
// No se disparan mientras se escribe en un campo ni con un modal abierto.

import { useEffect, useState, useSyncExternalStore } from "react";
import { CModal, CModalBody, CModalHeader, CModalTitle } from "@coreui/react";

export interface Shortcut {
  /** Tecla (una letra, un número o "?"). */
  key: string;
  label: string;
  run: () => void;
}

type Group = { id: number; title: string; items: Shortcut[] };

let groups: Group[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => groups;

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

let installed = false;
function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (isTyping(e.target)) return;
    if (document.querySelector(".modal.show")) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // La pantalla actual tiene prioridad sobre los atajos generales.
    for (const g of [...groups].reverse()) {
      const s = g.items.find((x) => x.key.toLowerCase() === k);
      if (s) {
        e.preventDefault();
        s.run();
        return;
      }
    }
  });
}

/** Registra atajos mientras el componente está montado. */
export function useShortcuts(title: string, items: Shortcut[], deps: unknown[] = []) {
  useEffect(() => {
    install();
    const g: Group = { id: nextId++, title, items };
    groups = [...groups, g];
    emit();
    return () => {
      groups = groups.filter((x) => x.id !== g.id);
      emit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const SHOW_HELP = "obrasflow:show-shortcuts";

/** Ayuda de atajos ("?"), montada una vez en AppShell junto con los atajos generales. */
export function ShortcutsHelp({ globals }: { globals: Shortcut[] }) {
  const [open, setOpen] = useState(false);
  const all = useSyncExternalStore(subscribe, snapshot, () => []);

  useShortcuts("En toda la app", [{ key: "?", label: "Ver esta ayuda", run: () => setOpen(true) }, ...globals], []);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(SHOW_HELP, show);
    return () => window.removeEventListener(SHOW_HELP, show);
  }, []);

  const shown = [...all].reverse();
  return (
    <>
      <button type="button" className="of-kbd-btn d-none d-md-inline-flex" title="Atajos de teclado (?)" onClick={() => setOpen(true)}>
        ⌨
      </button>
      <CModal visible={open} onClose={() => setOpen(false)} alignment="center">
        <CModalHeader>
          <CModalTitle className="fs-5">Atajos de teclado</CModalTitle>
        </CModalHeader>
        <CModalBody>
          <div className="of-kbd-group">
            <div className="of-qa-label">Buscar</div>
            <div className="of-kbd-row">
              <span>
                <kbd>Ctrl</kbd> <kbd>K</kbd> o <kbd>/</kbd>
              </span>
              <span>Buscar obras, pantallas y acciones</span>
            </div>
          </div>
          {shown.map((g) => (
            <div className="of-kbd-group" key={g.id}>
              <div className="of-qa-label">{g.title}</div>
              {g.items.map((s) => (
                <div className="of-kbd-row" key={s.key}>
                  <span>
                    <kbd>{s.key.toUpperCase()}</kbd>
                  </span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          ))}
          <p className="small text-body-secondary mb-0 mt-2">Los atajos no funcionan mientras escribís en un campo.</p>
        </CModalBody>
      </CModal>
    </>
  );
}
