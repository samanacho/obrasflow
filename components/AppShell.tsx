"use client";

import { useEffect, useState } from "react";
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
import CIcon from "@coreui/icons-react";
import { cilSpeedometer, cilPeople, cilFactory, cilTruck, cilSettings, cilBadge, cilMoon, cilSun, cilMenu, cilPlus } from "@coreui/icons";
import { NAV_ITEMS } from "@/lib/navItems";
import QuickExpenseButton from "@/components/QuickExpenseButton";

const ICONS: Record<string, any> = { cilSpeedometer, cilPeople, cilFactory, cilTruck, cilSettings, cilBadge };

/** Pantallas que no tienen ítem propio en el menú y pertenecen a "Proyectos". */
const PROYECTOS_SUBPATHS = ["/rubros", "/project", "/sitios", "/movimientos", "/ejecucion", "/registro-rapido"];

export interface Crumb {
  label: string;
  href?: string;
}

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

  useEffect(() => {
    const saved = (localStorage.getItem("obrasflow-theme") as "light" | "dark" | null) ?? "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-coreui-theme", saved);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-coreui-theme", next);
    localStorage.setItem("obrasflow-theme", next);
  }

  return (
    <div className="of-shell">
      <CSidebar visible={sidebarVisible} onVisibleChange={setSidebarVisible} className="border-end">
        <CSidebarHeader className="border-bottom">
          <CSidebarBrand>
            <span className="of-brand-mark">🏗️</span>
            <span className="of-brand-text">ObrasFlow</span>
          </CSidebarBrand>
        </CSidebarHeader>
        <CSidebarNav>
          {NAV_ITEMS.map((item) => {
            // "Proyectos" (href "/") también cubre las pantallas de obras que
            // cuelgan de ahí (rubros, sitios, fichas, movimientos, etc.).
            const active =
              item.href === "/"
                ? pathname === "/" || PROYECTOS_SUBPATHS.some((p) => pathname.startsWith(p))
                : pathname.startsWith(item.href);
            return (
              // CNavItem de CoreUI descarta la prop `active` si no recibe
              // href/to, así que el estado activo se marca con la clase.
              <CNavItem key={item.key} className={active ? "active" : undefined}>
                <Link href={item.href} className={"nav-link" + (active ? " active" : "")} aria-current={active ? "page" : undefined}>
                  <CIcon customClassName="nav-icon" icon={ICONS[item.icon]} />
                  {item.highlightFirstLetter ? (
                    <span className="nav-label">
                      <span className="nav-label-highlight">{item.label[0]}</span>
                      {item.label.slice(1)}
                    </span>
                  ) : (
                    item.label
                  )}
                </Link>
              </CNavItem>
            );
          })}
        </CSidebarNav>
        <CSidebarFooter className="border-top d-none d-lg-flex">
          <CSidebarToggler onClick={() => setSidebarVisible(!sidebarVisible)} />
        </CSidebarFooter>
      </CSidebar>

      <div className="of-content-wrap">
        <CHeader className="border-bottom of-header">
          <CContainer fluid className="d-flex align-items-center">
            {/* Visible también en escritorio: si el menú se oculta (con el
                botón del pie del menú, o por error), tiene que haber una
                forma de volver a abrirlo. */}
            <CHeaderToggler onClick={() => setSidebarVisible(!sidebarVisible)} title={sidebarVisible ? "Ocultar menú" : "Mostrar menú"}>
              <CIcon icon={cilMenu} size="lg" />
            </CHeaderToggler>
            <CBreadcrumb className="mb-0 flex-grow-1">
              <CBreadcrumbItem>
                <Link href="/">Inicio</Link>
              </CBreadcrumbItem>
              {crumbs.map((c, i) => (
                <CBreadcrumbItem key={i} active={i === crumbs.length - 1} href={c.href}>
                  {c.href && i !== crumbs.length - 1 ? <Link href={c.href}>{c.label}</Link> : c.label}
                </CBreadcrumbItem>
              ))}
            </CBreadcrumb>
            <div className="d-flex align-items-center gap-2">
              <QuickExpenseButton />
              {headerActions}
              <CButton color="light" variant="ghost" onClick={toggleTheme} title="Cambiar tema">
                <CIcon icon={theme === "dark" ? cilSun : cilMoon} />
              </CButton>
            </div>
          </CContainer>
        </CHeader>
        <CContainer fluid className="of-main">
          {children}
        </CContainer>
      </div>
    </div>
  );
}

export { cilPlus };
