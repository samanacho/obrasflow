// Íconos de pantalla para cada tipo de registro de una obra (lib/itemKinds.ts)
// y cada tipo de insumo. Los emojis de lib/itemKinds.ts se quedan allá porque
// se usan en textos que no son pantalla (historial guardado, WhatsApp); en la
// interfaz se usa este mapa con <Icon />.

import {
  Ruler, CurrencyCircleDollar, HardHat, Notebook, Coins, Truck, FileText, Camera,
  ListChecks, Flag, Calculator, ClockCounterClockwise, Folder,
  Wall, UsersThree, Tractor, Broom, Handshake, Archive, Question, type Icon,
} from "@phosphor-icons/react";

export const KIND_ICON: Record<string, Icon> = {
  rfi: Ruler,               // Relevamiento
  cotizacion: CurrencyCircleDollar,
  contratista: HardHat,
  daily_log: Notebook,      // Parte diario
  change_order: Coins,      // Ejecución (movimientos de plata)
  team: Truck,              // Maquinarias
  checklist: ListChecks,
  milestone: Flag,
  document: FileText,
  photo: Camera,
  budget_line: Calculator,
  activity: ClockCounterClockwise,
};

export const kindIcon = (kind: string): Icon => KIND_ICON[kind] ?? Folder;

export const TIPO_INSUMO_ICON: Record<string, Icon> = {
  "Materiales": Wall,
  "Mano de obra": UsersThree,
  "Maquinaria / Alquileres": Tractor,
  "Servicios varios": Broom,
  "Subcontrato": Handshake,
  "Gastos administrativos / Varios": Archive,
  "Sin clasificar": Question,
};
