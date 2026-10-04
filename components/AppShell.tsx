"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CSidebar,
  CSidebarBrand,
  CSidebarNav,
  CSidebarHeader,
  CSidebarFooter,
  CSidebarToggler,
  CNavItem,
  CHeader,
  CHeaderToggler,
  CContainer,
  CBreadcrumb,
  CBreadcrumbItem,
  CButton,
} from "@coreui/react";
import { HardHat, List, Moon, Sun, Receipt } from "@phosphor-icons/react";
import Icon from "@/components/ui/Icon";
import { NAV_ITEMS, isNavActive, type NavFlagKey } from "@/lib/navItems";
import QuickExpenseButton, { QUICK_EXPENSES_CHANGED } from "@/components/QuickExpenseButton";
import QuickSearch from "@/components/QuickSearch";
import GastoObraButton, { GASTO_OBRA_OPEN } from "@/components/GastoObraButton";
import UserMenu from "@/components/UserMenu";
import { ACCEPTED_TYPES, MAX_SIZE_MB } from "@/components/FileDropZone";
import { notificar } from "@/lib/ui/alerts";
import type { ProjectDTO, PoleLotDTO, QuickExpenseDTO } from "@/lib/types";
import { todayLocal } from "@/lib/dates";

export interface Crumb {
  label: string;
  href?: string;
}

// ── Semáforo del menú ────────────────────────────────────────────────────
// Un número junto a Obras / Movimientos / Postes cuando algo necesita
// atención, para enterarse sin entrar a mirar. Siempre número + color +
// texto en el title (nunca solo color).
type Flag = { n: number; tone: "crit" | "warn"; why: string };
type Flags = Partial<Record<NavFlagKey, Flag>>;

// Cache entre pantallas: cada página monta su AppShell, y no hace falta
// volver a preguntar al servidor en cada clic.
let flagsCache: { at: number; flags: Flags } | null = null;
const FLAGS_TTL_MS = 60_000;

async function loadFlags(): Promise<Flags> {
  const get = <T,>(url: string): Promise<T[]> => fetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const [projects, lots, quick] = await Promise.all([
    get<ProjectDTO>("/api/projects"),
    get<PoleLotDTO>("/api/postes/lots"),
    get<QuickExpenseDTO>("/api/quick-expenses"),
  ]);
  const today = todayLocal();
  const flags: Flags = {};

  const activas = projects.filter((p) => p.status !== "finalizado");
  const vencidas = activas.filter((p) => p.end && p.end < today).length;
  const pasadas = activas.filter((p) => p.budget > 0 && p.spent > p.budget).length;
  if (vencidas + pasadas > 0) {
    const partes = [vencidas && `${vencidas} vencida${vencidas > 1 ? "s" : ""}`, pasadas && `${pasadas} pasada${pasadas > 1 ? "s" : ""} de presupuesto`].filter(Boolean);
    flags.obras = { n: vencidas + pasadas, tone: "crit", why: `Obras: ${partes.join(", ")}` };
  }

  const pendientes = quick.filter((q) => !q.resuelto).length;
  if (pendientes > 0) flags.movimientos = { n: pendientes, tone: "warn", why: `${pendientes} gasto${pendientes > 1 ? "s" : ""} rápido${pendientes > 1 ? "s" : ""} sin clasificar` };

  const paraEnsayo = lots.filter((l) => l.estado === "listo_para_ensayo").length;
  if (paraEnsayo > 0) flags.postes = { n: paraEnsayo, tone: "warn", why: `${paraEnsayo} lote${paraEnsayo > 1 ? "s" : ""} listo${paraEnsayo > 1 ? "s" : ""} para ensayo` };

  return flags;
}

function useNavFlags() {
  const [flags, setFlags] = useState<Flags>(flagsCache?.flags ?? {});
  useEffect(() => {
    let alive = true;
    const refresh = (force = false) => {
      if (!force && flagsCache && Date.now() - flagsCache.at < FLAGS_TTL_MS) return;
      loadFlags().then((f) => {
        flagsCache = { at: Date.now(), flags: f };
        if (alive) setFlags(f);
      });
    };
    refresh();
    const onChange = () => refresh(true);
    window.addEventListener(QUICK_EXPENSES_CHANGED, onChange);
    return () => {
      alive = false;
      window.removeEventListener(QUICK_EXPENSES_CHANGED, onChange);
    };
  }, []);
  return flags;
}

// ── Soltar un comprobante en cualquier pantalla ──────────────────────────
// Arrastrar una foto o PDF sobre la app abre "Gasto de obra" con el archivo
// ya adjunto. No interfiere con las zonas de archivo propias de cada
// pantalla (esas frenan el evento antes) ni con los formularios abiertos.
function useDropComprobante(activo: boolean) {
  const [arrastrando, setArrastrando] = useState(false);
  useEffect(() => {
    if (!activo) return;
    let profundidad = 0;
    const conArchivos = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const hayModal = () => Boolean(document.querySelector(".modal.show, .swal2-container, .yarl__root"));
    const onEnter = (e: DragEvent) => {
      if (!conArchivos(e) || hayModal()) return;
      profundidad++;
      setArrastrando(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!conArchivos(e)) return;
      profundidad = Math.max(0, profundidad - 1);
      if (profundidad === 0) setArrastrando(false);
    };
    // Sin esto, soltar un archivo fuera de una zona hace que el navegador lo abra y se pierda la pantalla.
    const onOver = (e: DragEvent) => { if (conArchivos(e)) e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      profundidad = 0;
      setArrastrando(false);
      if (!conArchivos(e)) return;
      // Una zona de archivo de la pantalla ya lo recibió (frenó el evento antes).
      const yaAtendido = e.defaultPrevented;
      e.preventDefault();
      if (yaAtendido || hayModal()) return;
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!ACCEPTED_TYPES.includes(file.type)) return void notificar("Ese archivo no es una foto ni un PDF.", "error");
      if (file.size > MAX_SIZE_MB * 1024 * 1024) return void notificar(`El archivo pasa de ${MAX_SIZE_MB} MB.`, "error");
      window.dispatchEvent(new CustomEvent(GASTO_OBRA_OPEN, { detail: { file } }));
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [activo]);
  return arrastrando;
}

// ── Menú lateral oculto (solo PC) ────────────────────────────────────────
// Misma clave que lee el script de app/layout.tsx. 992 px es el corte de
// CoreUI entre menú fijo (PC) y menú que se despliega encima (celular).
const MENU_KEY = "obrasflow-menu";
const esEscritorio = () => window.matchMedia("(min-width: 992px)").matches;

export default function AppShell({
  children,
  crumbs,
  headerActions,
}: {
  children: React.ReactNode;
  crumbs: Crumb[];
  headerActions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const flags = useNavFlags();
  // En Memby el chat tiene su propia zona para soltar archivos.
  const arrastrando = useDropComprobante(!pathname.startsWith("/agente-whatsapp") && !pathname.startsWith("/memby"));

  useEffect(() => {
    let saved: "light" | "dark" = "light";
    try {
      saved = (localStorage.getItem("obrasflow-theme") as "light" | "dark" | null) ?? "light";
    } catch {
      // Sin acceso al almacenamiento (modo privado): tema claro.
    }
    setTheme(saved);
    document.documentElement.setAttribute("data-coreui-theme", saved);
  }, []);

  // Menú oculto en la PC: cada pantalla monta su propio AppShell, así que la
  // preferencia se guarda para que no se vuelva a abrir al navegar. El
  // script de app/layout.tsx marca <html data-menu-oculto> antes de pintar
  // (ver globals.css) y acá se alinea el estado. En el celular el menú se
  // abre y cierra solo, así que eso no se guarda.
  useEffect(() => {
    if (document.documentElement.hasAttribute("data-menu-oculto") && esEscritorio()) setSidebarVisible(false);
  }, []);

  function alternarMenu() {
    const next = !sidebarVisible;
    setSidebarVisible(next);
    if (!esEscritorio()) return;
    document.documentElement.toggleAttribute("data-menu-oculto", !next);
    try {
      localStorage.setItem(MENU_KEY, next ? "visible" : "oculto");
    } catch {
      // Sin acceso al almacenamiento (modo privado): vale hasta recargar la página.
    }
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-coreui-theme", next);
    try {
      localStorage.setItem("obrasflow-theme", next);
    } catch {
      // Modo privado: vale hasta recargar la página.
    }
  }

  return (
    <div className="of-shell">
      <CSidebar visible={sidebarVisible} onVisibleChange={setSidebarVisible} className="border-end">
        <CSidebarHeader className="border-bottom">
          <CSidebarBrand>
            <span className="of-brand-mark"><Icon icon={HardHat} size={20} weight="bold" /></span>
            <span className="of-brand-text">ObrasFlow</span>
          </CSidebarBrand>
        </CSidebarHeader>
        <CSidebarNav>
          {NAV_ITEMS.map((item) => {
            const active = isNavActive(item, pathname);
            const flag = item.flag ? flags[item.flag] : undefined;
            return (
              <Fragment key={item.key}>
                {item.groupStart && <li className="of-nav-sep" role="separator" aria-hidden="true" />}
                {/* CNavItem de CoreUI descarta la prop `active` si no recibe
                    href/to, así que el estado activo se marca con la clase. */}
                <CNavItem className={active ? "active" : undefined}>
                  <Link href={item.href} className={"nav-link" + (active ? " active" : "")} aria-current={active ? "page" : undefined}>
                    <Icon icon={item.icon} className="nav-icon" />
                    {item.highlightFirstLetter ? (
                      <span className="nav-label">
                        <span className="nav-label-highlight">{item.label[0]}</span>
                        {item.label.slice(1)}
                      </span>
                    ) : (
                      item.label
                    )}
                    {flag && (
                      <span className={"of-nav-flag is-" + flag.tone} title={flag.why}>
                        {flag.n}
                        <span className="visually-hidden"> — {flag.why}</span>
                      </span>
                    )}
                  </Link>
                </CNavItem>
              </Fragment>
            );
          })}
        </CSidebarNav>
        <CSidebarFooter className="border-top d-none d-lg-flex">
          <CSidebarToggler onClick={alternarMenu} />
        </CSidebarFooter>
      </CSidebar>

      <div className="of-content-wrap">
        <CHeader className="border-bottom of-header">
          <CContainer fluid className="d-flex align-items-center">
            {/* Visible también en escritorio: si el menú se oculta (con el
                botón del pie del menú, o por error), tiene que haber una
                forma de volver a abrirlo. */}
            <CHeaderToggler onClick={alternarMenu} title={sidebarVisible ? "Ocultar menú" : "Mostrar menú"}>
              <Icon icon={List} size={22} weight="bold" label={sidebarVisible ? "Ocultar menú" : "Mostrar menú"} />
            </CHeaderToggler>
            <CBreadcrumb className="mb-0 flex-grow-1">
              <CBreadcrumbItem>
                <Link href="/">Inicio</Link>
              </CBreadcrumbItem>
              {crumbs.map((c, i) => (
                <CBreadcrumbItem key={i} active={i === crumbs.length - 1}>
                  {c.href && i !== crumbs.length - 1 ? <Link href={c.href}>{c.label}</Link> : c.label}
                </CBreadcrumbItem>
              ))}
            </CBreadcrumb>
            {/* En el celular no entra todo en un renglón: las acciones bajan a
                un segundo renglón (ver .of-hdr-actions en globals.css) y
                arriba quedan la ruta, el buscador, el tema y la cuenta. */}
            <div className="of-hdr-right">
              <div className="of-hdr-search">
                <QuickSearch />
              </div>
              <div className="of-hdr-actions">
                <QuickExpenseButton />
                <GastoObraButton />
                {headerActions}
              </div>
              <div className="of-hdr-tools">
                <CButton color="secondary" variant="ghost" size="sm" className="of-hdr-icon" onClick={toggleTheme} title={theme === "dark" ? "Pasar a modo claro" : "Pasar a modo oscuro"}>
                  <Icon icon={theme === "dark" ? Sun : Moon} label={theme === "dark" ? "Modo claro" : "Modo oscuro"} />
                </CButton>
                <UserMenu />
              </div>
            </div>
          </CContainer>
        </CHeader>
        <CContainer fluid className="of-main">
          {children}
        </CContainer>
        {arrastrando && (
          <div className="of-drop-overlay" aria-hidden="true">
            <div className="of-drop-card">
              <Icon icon={Receipt} size={44} />
              <strong>Soltá el comprobante</strong>
              <span>Se abre "Gasto de obra" con el archivo ya adjunto</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
