// Los 263 municipios/distritos del Paraguay (17 departamentos + el Distrito
// Capital, Asunción), agrupados por departamento — fuente: Wikipedia,
// "Anexo:Municipios de Paraguay" (basado en la Ley N.º 71/92 y actualizaciones
// posteriores de creación de distritos). Se usa para el campo "Localidad" del
// paso 3 del wizard "Nuevo proyecto" (obra pública), donde una obra puede
// ejecutarse en una ciudad o en varias a la vez.

export interface ParaguayDepartment {
  name: string;
  cities: string[];
}

export const PARAGUAY_DEPARTMENTS: ParaguayDepartment[] = [
  { name: "Capital", cities: ["Asunción"] },
  {
    name: "Concepción",
    cities: [
      "Arroyito", "Azotey", "Belén", "Concepción", "Horqueta", "Itacuá", "Loreto",
      "Paso Barreto", "Paso Horqueta", "San Alfredo", "San Carlos del Apa", "San Lázaro",
      "Sargento José Félix López", "Yby Yaú",
    ],
  },
  {
    name: "San Pedro",
    cities: [
      "Antequera", "Capiibary", "Choré", "General Elizardo Aquino", "General Isidoro Resquín",
      "Guayaibí", "Itacurubí del Rosario", "Liberación", "Lima", "Nueva Germania",
      "San José del Rosario", "San Estanislao", "San Pablo", "San Pedro de Ycuamandiyú",
      "San Vicente Pancholo", "Santa Rosa del Aguaray", "Tacuatí", "Unión",
      "Veinticinco de Diciembre", "Villa del Rosario", "Yataity del Norte", "Yrybucuá",
    ],
  },
  {
    name: "Cordillera",
    cities: [
      "Altos", "Arroyos y Esteros", "Atyrá", "Caacupé", "Caraguatay", "Emboscada",
      "Eusebio Ayala", "Isla Pucú", "Itacurubí de la Cordillera", "Juan de Mena",
      "Loma Grande", "Mbocayaty del Yhaguy", "Nueva Colombia", "Piribebuy",
      "Primero de Marzo", "San Bernardino", "San José Obrero", "Santa Elena", "Tobatí",
      "Valenzuela",
    ],
  },
  {
    name: "Guairá",
    cities: [
      "Borja", "Capitán Mauricio José Troche", "Coronel Martínez", "Doctor Botrell",
      "Félix Pérez Cardozo", "General Eugenio Alejandrino Garay", "Independencia",
      "Itapé", "Iturbe", "José A. Fassardi", "Mbocayaty del Guairá", "Natalicio Talavera",
      "Ñumí", "Paso Yobái", "San Salvador", "Tebicuary", "Villarrica", "Yataity del Guairá",
    ],
  },
  {
    name: "Caaguazú",
    cities: [
      "Caaguazú", "Carayaó", "Coronel Oviedo", "Doctor Cecilio Báez",
      "Doctor Juan Eulogio Estigarribia", "Doctor Juan Manuel Frutos",
      "José Domingo Ocampos", "La Pastora", "Mariscal Francisco Solano López",
      "Nueva Londres", "Nueva Toledo", "Raúl Arsenio Oviedo",
      "Regimiento de Infantería Tres Corrales", "Repatriación", "San Joaquín",
      "San José de los Arroyos", "Santa Rosa del Mbutuy", "Simón Bolívar", "Tembiaporá",
      "Tres de Febrero", "Vaquería", "Yhú",
    ],
  },
  {
    name: "Caazapá",
    cities: [
      "Abaí", "Buena Vista", "Caazapá", "Doctor Moisés Santiago Bertoni",
      "Fulgencio Yegros", "General Higinio Morínigo", "Maciel", "San Juan Nepomuceno",
      "Tavaí", "Tres de Mayo", "Yuty",
    ],
  },
  {
    name: "Itapúa",
    cities: [
      "Alto Verá", "Bella Vista", "Cambyretá", "Capitán Meza", "Capitán Miranda",
      "Carlos Antonio López", "Carmen del Paraná", "Coronel José Félix Bogado", "Edelira",
      "Encarnación", "Fram", "General Artigas", "General Delgado", "Hohenau",
      "Itapúa Poty", "Jesús de Tavarangüé", "José Leandro Oviedo", "La Paz",
      "Mayor Julio Dionisio Otaño", "Natalio", "Nueva Alborada", "Obligado", "Pirapó",
      "San Cosme y Damián", "San Juan del Paraná", "San Pedro del Paraná",
      "San Rafael del Paraná", "Tomás Romero Pereira", "Trinidad", "Yatytay",
    ],
  },
  {
    name: "Misiones",
    cities: [
      "Ayolas", "San Ignacio Guazú", "San Juan Bautista", "San Miguel", "San Patricio",
      "Santa María de Fe", "Santa Rosa de Lima", "Santiago", "Villa Florida", "Yabebyry",
    ],
  },
  {
    name: "Paraguarí",
    cities: [
      "Acahay", "Caapucú", "Carapeguá", "Escobar", "General Bernardino Caballero",
      "La Colmena", "María Antonia", "Mbuyapey", "Paraguarí", "Pirayú", "Quiindy",
      "Quyquyhó", "San Roque González de Santa Cruz", "Sapucai", "Tebicuarymí",
      "Yaguarón", "Ybycuí", "Ybytymí",
    ],
  },
  {
    name: "Alto Paraná",
    cities: [
      "Ciudad del Este", "Doctor Juan León Mallorquín", "Doctor Raúl Peña",
      "Domingo Martínez de Irala", "Hernandarias", "Iruña", "Itakyry",
      "Juan Emiliano O'Leary", "Los Cedrales", "Mbaracayú", "Minga Guazú", "Minga Porá",
      "Naranjal", "Ñacunday", "Presidente Franco", "San Alberto", "San Cristóbal",
      "Santa Fe del Paraná", "Santa Rita", "Santa Rosa del Monday", "Tavapy", "Yguazú",
    ],
  },
  {
    name: "Central",
    cities: [
      "Areguá", "Capiatá", "Fernando de la Mora", "Guarambaré", "Itá", "Itauguá",
      "Julián Augusto Saldívar", "Lambaré", "Limpio", "Luque", "Mariano Roque Alonso",
      "Nueva Italia", "Ñemby", "San Antonio", "San Lorenzo", "Villa Elisa", "Villeta",
      "Ypacaraí", "Ypané",
    ],
  },
  {
    name: "Ñeembucú",
    cities: [
      "Alberdi", "Cerrito", "Desmochados", "General José Eduvigis Díaz", "Guazú Cuá",
      "Humaitá", "Isla Umbú", "Laureles", "Mayor José Martínez", "Paso de Patria",
      "Pilar", "San Juan Bautista de Ñeembucú", "Tacuaras", "Villa Franca", "Villa Oliva",
      "Villalbín",
    ],
  },
  {
    name: "Amambay",
    cities: [
      "Bella Vista Norte", "Capitán Bado", "Cerro Corá", "Karapaí",
      "Pedro Juan Caballero", "Zanja Pytá",
    ],
  },
  {
    name: "Canindeyú",
    cities: [
      "Corpus Christi", "Curuguaty", "General Francisco Caballero Álvarez", "Itanará",
      "Katueté", "La Paloma del Espíritu Santo", "Laurel", "Maracaná", "Nueva Esperanza",
      "Puerto Adela", "Saltos del Guairá", "Villa Ygatimí", "Yasy Cañy", "Yby Pytá",
      "Ybyrarobaná", "Ypejhú",
    ],
  },
  {
    name: "Presidente Hayes",
    cities: [
      "Benjamín Aceval", "Campo Aceval", "General José María Bruguez", "José Falcón",
      "Nanawa", "Nueva Asunción", "Puerto Pinasco", "Teniente Esteban Martínez",
      "Teniente Primero Manuel Irala Fernández", "Villa Hayes",
    ],
  },
  {
    name: "Alto Paraguay",
    cities: ["Bahía Negra", "Capitán Carmelo Peralta", "Fuerte Olimpo", "Puerto Casado"],
  },
  {
    name: "Boquerón",
    cities: ["Boquerón", "Filadelfia", "Loma Plata", "Mariscal José Félix Estigarribia"],
  },
];

/** Lista plana de las 263 ciudades/distritos, sin agrupar — útil para búsquedas simples. */
export const PARAGUAY_CITIES: string[] = PARAGUAY_DEPARTMENTS.flatMap((d) => d.cities);
