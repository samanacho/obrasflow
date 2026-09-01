// Los 17 departamentos de Paraguay + el Distrito Capital (Asunción, que
// administrativamente no es un departamento pero funciona como tal a
// efectos de dirección/ubicación) — lista fija y estable, no como el
// catálogo de clases ANDE (ver lib/poleFields.ts): la división política
// del país no cambia, así que acá sí tiene sentido un select cerrado en
// vez de un campo libre que el usuario carga a mano.
export const PARAGUAY_DEPARTMENTS = [
  "Asunción (Capital)",
  "Concepción",
  "San Pedro",
  "Cordillera",
  "Guairá",
  "Caaguazú",
  "Caazapá",
  "Itapúa",
  "Misiones",
  "Paraguarí",
  "Alto Paraná",
  "Central",
  "Ñeembucú",
  "Amambay",
  "Canindeyú",
  "Presidente Hayes",
  "Boquerón",
  "Alto Paraguay",
] as const;
