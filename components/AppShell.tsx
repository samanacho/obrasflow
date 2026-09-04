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
import { cilSpeedometer, cilPeople, cilFactory, cilTruck, cilSettings, cilMoon, cilSun, cilMenu, cilPlus } from "@coreui/icons";
import { NAV_ITEMS } from "@/lib/navItems";

const ICONS: Record<string, any> = { cilSpeedometer, cilPeople, cilFactory, cilTruck, cilSettings };

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
          {NAV_ITEMS.map((item) => (
            <CNavItem key={item.key} active={pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))}>
              <Link href={item.href} className="nav-link">
                <CIcon customClassName="nav-icon" icon={ICONS[item.icon]} />
                {item.label}
              </Link>
            </CNavItem>
          ))}
        </CSidebarNav>
        <CSidebarFooter className="border-top d-none d-lg-flex">
          <CSidebarToggler onClick={() => setSidebarVisible(!sidebarVisible)} />
        </CSidebarFooter>
      </CSidebar>

      <div className="of-content-wrap">
        <CHeader className="border-bottom of-header">
          <CContainer fluid className="d-flex align-items-center">
            <CHeaderToggler className="d-lg-none" onClick={() => setSidebarVisible(!sidebarVisible)}>
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
