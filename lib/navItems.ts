// Config del sidebar persistente (patrón Odoo: los módulos viven a la
// izquierda, siempre visibles, en vez de pestañas por página).

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string; // nombre del ícono en @coreui/icons (cil*)
}

export const NAV_ITEMS: NavItem[] = [
  { key: "proyectos", label: "Proyectos", href: "/", icon: "cilSpeedometer" },
  { key: "contratistas", label: "Contratistas", href: "/contratistas", icon: "cilPeople" },
  { key: "proveedores", label: "Proveedores", href: "/proveedores", icon: "cilTruck" },
  { key: "postes", label: "Fábrica de Postes", href: "/postes", icon: "cilFactory" },
];
