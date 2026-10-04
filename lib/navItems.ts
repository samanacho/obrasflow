// Config del sidebar persistente (patrón Odoo: los módulos viven a la
// izquierda, siempre visibles, en vez de pestañas por página). Ordenado por
// uso: arriba lo del día a día, abajo (después del separador) los listados
// de consulta.

import {
  SquaresFour, Buildings, ArrowsLeftRight, Factory, UsersThree, Truck, Package,
  IdentificationBadge, ChatCircleDots, ShoppingCart, type Icon,
} from "@phosphor-icons/react";

export type NavFlagKey = "obras" | "movimientos" | "postes";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: Icon;
  /** Otras rutas que pertenecen a este ítem (se marca activo también ahí). */
  also?: string[];
  /** Muestra el semáforo del menú (ver AppShell). */
  flag?: NavFlagKey;
  /** Resalta la primera letra del label (ver AppShell) — pedido puntual para "Personal". */
  highlightFirstLetter?: boolean;
  /** Dibuja un separador antes de este ítem. */
  groupStart?: boolean;
  /** Solo para quien tiene permiso de Personal (verPersonal de /api/auth/yo). */
  soloPersonal?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "inicio", label: "Inicio", href: "/", icon: SquaresFour },
  { key: "obras", label: "Obras", href: "/rubros", icon: Buildings, also: ["/project", "/sitios", "/ejecucion"], flag: "obras" },
  { key: "movimientos", label: "Movimientos", href: "/movimientos", icon: ArrowsLeftRight, also: ["/registro-rapido"], flag: "movimientos" },
  // Pedidos de compra: pedido → aprobación → pago → factura (lib/compras/core.ts).
  { key: "compras", label: "Compras", href: "/compras", icon: ShoppingCart },
  { key: "postes", label: "Fábrica de postes", href: "/postes", icon: Factory, flag: "postes" },
  { key: "contratistas", label: "Contratistas", href: "/contratistas", icon: UsersThree, groupStart: true },
  { key: "proveedores", label: "Proveedores", href: "/proveedores", icon: Truck },
  { key: "inventario", label: "Inventario", href: "/inventario", icon: Package },
  // Reparto de beneficios. Solo para ciertos usuarios (lib/auth/personal.ts):
  // a los demás no les aparece.
  { key: "personal", label: "Personal", href: "/personal", icon: IdentificationBadge, highlightFirstLetter: true, soloPersonal: true },
  // Asistente de WhatsApp (docs/WHATSAPP_AGENT.md).
  { key: "agente", label: "Memby", href: "/agente-whatsapp", icon: ChatCircleDots, also: ["/memby"] },
];

/**
 * Ítems que le corresponden a quien usa la app. Mientras no se sabe quién es
 * (undefined) se esconde Personal: mejor que aparezca un instante después a
 * que se le muestre a quien no puede.
 */
export function navItemsPara(verPersonal: boolean | undefined): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.soloPersonal || verPersonal === true);
}

export function isNavActive(item: NavItem, pathname: string) {
  if (item.href === "/") return pathname === "/";
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(p + "/"));
}
