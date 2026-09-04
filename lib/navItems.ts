// Config del sidebar persistente (patrón Odoo: los módulos viven a la
// izquierda, siempre visibles, en vez de pestañas por página).

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string; // nombre del ícono en @coreui/icons (cil*)
  /** Resalta la primera letra del label (ver AppShell) — pedido puntual para "Personal". */
  highlightFirstLetter?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "proyectos", label: "Proyectos", href: "/", icon: "cilSpeedometer" },
  { key: "contratistas", label: "Contratistas", href: "/contratistas", icon: "cilPeople" },
  { key: "proveedores", label: "Proveedores", href: "/proveedores", icon: "cilTruck" },
  { key: "inventario", label: "Inventario", href: "/inventario", icon: "cilSettings" },
  { key: "postes", label: "Fábrica de Postes", href: "/postes", icon: "cilFactory" },
  // Módulo todavía sin funcionalidad propia a propósito — el usuario va a
  // dar el contexto/requerimientos para desarrollarlo en un paso aparte.
  { key: "personal", label: "Personal", href: "/personal", icon: "cilBadge", highlightFirstLetter: true },
];
