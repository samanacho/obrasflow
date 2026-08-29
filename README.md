# ObrasFlow

Panel de gestión de proyectos de obras civiles, eléctricas y viales — Next.js (App Router) + Prisma + Postgres, pensado para desplegar en Vercel.

## Stack

- **Next.js 14 (App Router)** — API routes (`app/api/projects`) y frontend (`app/page.tsx`) en el mismo proyecto.
- **Prisma** — ORM sobre Postgres (`prisma/schema.prisma`).
- **Postgres** — pensado para [Neon](https://neon.tech) o Vercel Postgres (ambos son Postgres serverless compatibles con Prisma).
- **Bootstrap 5 + CoreUI** (`@coreui/react`) — admin template open source elegido tras comparar AdminLTE, Tabler y CoreUI; se usó CoreUI por tener componentes React reales en vez de HTML/jQuery estático. Layout tipo Odoo: sidebar izquierdo persistente ([components/AppShell.tsx](components/AppShell.tsx)) + breadcrumbs, en vez de las pestañas horizontales de la primera versión.

El prototipo estático original (un solo `index.html` con datos embebidos) quedó en [`legacy/index.html`](legacy/index.html) como referencia.

## Sin diálogos nativos del navegador ([components/ConfirmDialog.tsx](components/ConfirmDialog.tsx), [components/Toast.tsx](components/Toast.tsx))

Ningún `window.confirm()` ni `window.alert()` en toda la app. El motivo: esos diálogos nativos pueden quedar silenciados sin ningún aviso (el navegador los bloquea solo después de varios usos seguidos en la misma pestaña, o una extensión los suprime) — ahí el botón que los dispara "no hace nada" y no queda ningún rastro de error. Se reemplazaron por:

- **`ConfirmDialog`** — modal de confirmación propio, reutilizado en cada pantalla que borra algo (proyectos, contratistas, items de cualquier módulo).
- **`useToast()`** ([lib/useToast.ts](lib/useToast.ts)) + **`Toast`** — mensaje de error que se autodescarta solo, mismo patrón que ya existía en el Dashboard, ahora extraído y reutilizado en todas las pantallas con acciones que pueden fallar.

## Diseño visual — paleta TDAH/autismo-friendly ([app/globals.css](app/globals.css))

La paleta por defecto de CoreUI (azules/grises saturados de admin genérico) se reemplazó por una paleta propia, apagada y cálida, pensada para reducir fatiga visual y sobrecarga sensorial:

- **Fondos** no blancos puros (`--paper #f5f3ee` / `--surface #fbfaf6` en claro; `#221f1b` / `#2b2823` en oscuro) y **texto** no negro puro (`--ink #33312c`), para bajar el contraste extremo sin perder legibilidad.
- Colores semánticos (`--civil`, `--electrico`, `--vial`, `--otro`, `--ok`, `--warn`, `--crit`, más un `--accent` para acciones) todos desaturados — nada de tonos neón o "alarma" que salten a la vista sin necesidad.
- Cada color tiene un par `-soft` (fondo tenue) para chips/badges, evitando bloques de color sólido y saturado en superficies grandes.
- Estas variables se mapean 1:1 a las variables internas de CoreUI/Bootstrap (`--cui-primary`, `--cui-success-bg-subtle`, etc.) en un único bloque puente, así todos los componentes de CoreUI (badges, alerts, botones) heredan la paleta sin duplicar overrides por componente.
- `prefers-reduced-motion: reduce` se respeta tanto en CSS (recorta animaciones/transiciones globales) como en el skyline 3D (desactiva la auto-rotación de [components/ThreeSkyline.tsx](components/ThreeSkyline.tsx)).
- Tipografía con `line-height` más generoso (1.55 en body, 1.6 en texto largo) para facilitar el seguimiento de línea, y foco de teclado visible (`:focus-visible`) en todos los elementos interactivos.
- Los gráficos (Chart.js, Plotly, dhtmlx-gantt, Three.js) leen la misma paleta en vez de colores propios, así el look es consistente en toda la app.

## Wizard "Nuevo proyecto" ([components/NewProjectWizard.tsx](components/NewProjectWizard.tsx))

Modal de 3 pasos (`size="lg"`, centrado):
1. **General** — los campos de siempre (nombre, tipo, estado, responsable, fechas, presupuesto, avance).
2. **Sector** — privada o pública, elegido con dos tarjetas grandes.
3. **Detalles** — campos específicos según el sector, definidos en [lib/sectorFields.ts](lib/sectorFields.ts):
   - **Pública**: entidad convocante, nombre de la licitación y procedimiento (LPN/LPI) fijos, más N° de ID / código de contratación, localidad (una o varias ciudades, [lib/paraguayCities.ts](lib/paraguayCities.ts) con los 263 distritos del país vía [components/CityMultiSelect.tsx](components/CityMultiSelect.tsx)) y monto adjudicado — terminología verificada contra la normativa de la DNCP paraguaya (Ley 2051/03).
   - **Privada**: cliente/comitente, tipo de contrato, monto contractual y forma de pago — campos estándar de client-intake de una constructora.

Se guardan en `Project.sector` + `Project.sectorData` (JSON flexible, mismo patrón que `ProjectItem.data`) y se muestran en el detalle del proyecto cuando hay datos cargados.

## Obras por rubro ([app/rubros/page.tsx](app/rubros/page.tsx), [app/rubros/[type]/page.tsx](app/rubros/[type]/page.tsx))

Desde el Dashboard, el KPI "Proyectos totales" y el módulo "Todas las obras" llevan a `/rubros`: una vista con una tarjeta por rubro (Civil/Eléctrico/Vial/Otro) con la cantidad de obras, presupuesto total y un desglose rápido por estado. Cada tarjeta lleva a `/rubros/[type]`, donde las obras de ese rubro se ven en 3 columnas por estado — **Proyectada** (planificado), **En curso** (en_curso + pausado, este último con una etiqueta propia para no perder la distinción) y **Terminada** (finalizado) — cada una linkeando a la ficha completa del proyecto.

**CRUD completo en todo el flujo**, sin depender de volver a la tabla plana:
- `/rubros` y `/rubros/[type]` tienen un botón "+ Nueva obra" que abre el wizard de 3 pasos ([components/NewProjectWizard.tsx](components/NewProjectWizard.tsx)); desde un rubro puntual, el wizard arranca con ese rubro ya preseleccionado (prop `initialType`).
- Cada tarjeta de obra en `/rubros/[type]` tiene botones de editar/eliminar (mismo patrón que la Tabla); si al editar se le cambia el rubro, la obra desaparece de esa lista.
- `/project/[id]` ahora tiene botones "Editar"/"Eliminar" en el header — antes solo se podía editar/eliminar el proyecto en sí desde la Tabla del Dashboard. Al eliminar, vuelve a `/rubros/[type]`. El breadcrumb de la ficha también pasa a routear por Obras por rubro en vez de por la tabla plana.

## Estructura

```
app/
  api/projects/route.ts        GET (listar) / POST (crear)
  api/projects/[id]/route.ts   PUT (reemplazar) / PATCH (parcial) / DELETE
  layout.tsx, page.tsx         UI (Dashboard, Tablero, Tabla, Cronograma)
  globals.css
lib/
  prisma.ts    cliente Prisma singleton
  types.ts     tipos compartidos frontend/API
  serialize.ts Prisma -> DTO plano
  validate.ts  validación del body entrante
prisma/
  schema.prisma  modelo Project
  seed.ts        6 proyectos de ejemplo
```

## Desarrollo local

1. **Base de datos**: creá un proyecto en [Neon](https://neon.tech) (tiene capa gratuita) o un Vercel Postgres storage. Copiá las connection strings.
2. Copiá `.env.example` a `.env` y completá `DATABASE_URL` (pooled) y `DIRECT_URL` (directa, la usa Prisma para migraciones):

   ```bash
   cp .env.example .env
   ```

3. Instalá dependencias:

   ```bash
   npm install
   ```

4. Creá las tablas y cargá los datos de ejemplo:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. Corré el servidor:

   ```bash
   npm run dev
   ```

   Abrí `http://localhost:3000`.

Otros comandos útiles: `npm run db:studio` (explorador visual de la base) y `npm run build` (build de producción, corre `prisma generate` antes).

## Deploy en Vercel

1. Subí este repo a GitHub/GitLab y hacé "Import Project" en [vercel.com](https://vercel.com).
2. En **Environment Variables** del proyecto en Vercel, agregá `DATABASE_URL` y `DIRECT_URL` con los valores de tu base (Neon o Vercel Postgres — si usás Vercel Postgres, podés conectarlo directo desde el marketplace de integraciones y las variables se cargan solas).
3. El build command ya está fijado en [`vercel.json`](vercel.json):

   ```
   prisma generate && prisma migrate deploy && next build
   ```

   Esto aplica las migraciones pendientes en cada deploy, así producción queda siempre con el schema al día.
4. Deploy. Si es la primera vez, corré el seed una sola vez apuntando `DATABASE_URL`/`DIRECT_URL` de producción en tu máquina:

   ```bash
   npm run db:seed
   ```

## API

| Método | Ruta                  | Uso                                              |
|--------|-----------------------|---------------------------------------------------|
| GET    | `/api/projects`       | Lista todos los proyectos                         |
| POST   | `/api/projects`       | Crea un proyecto (body: `ProjectInput`)           |
| PUT    | `/api/projects/:id`   | Reemplaza un proyecto completo                    |
| PATCH  | `/api/projects/:id`   | Actualiza campos parciales (usado por el Kanban)  |
| DELETE | `/api/projects/:id`   | Elimina un proyecto                               |

`ProjectInput`: `{ name, type: "civil"|"electrico"|"vial", status: "planificado"|"en_curso"|"pausado"|"finalizado", manager, start: "YYYY-MM-DD", end: "YYYY-MM-DD", budget: number, spent: number, progress: 0-100 }`.

## Vistas

- **Dashboard**: 8 KPIs (4 de proyectos + 4 agregados de `/api/dashboard`: contratistas activos, calificación promedio, relevamientos abiertos, cotizaciones pendientes), accesos directos, alertas de vencimientos/sobre-presupuesto, y deep links desde cada tarjeta/gráfico al proyecto o vista correspondiente. El tab activo se sincroniza con la URL (`/?tab=tabla`) para poder linkear directo a una vista. Cuatro librerías de visualización, cada una para lo que mejor resuelve:
  - **Chart.js** (`@coreui/react-chartjs`) — dona de presupuesto por rubro, barras de avance por proyecto.
  - **Plotly.js** (`react-plotly.js` + `plotly.js-dist-min`, [components/PlotlyGauge.tsx](components/PlotlyGauge.tsx)) — gauges de ejecución presupuestaria y avance promedio.
  - **dhtmlx Gantt** (Community Edition, MIT, [components/DhtmlxGanttChart.tsx](components/DhtmlxGanttChart.tsx)) — cronograma interactivo con zoom de escala y arrastre, mucho más completo que el Gantt casero del Tablero.
  - **Three.js** ([components/ThreeSkyline.tsx](components/ThreeSkyline.tsx)) — "skyline 3D" de la cartera: cada proyecto es un edificio cuya altura es el avance, el color el rubro, y se ilumina en rojo si está sobre presupuesto; se puede orbitar con el mouse y clickear un edificio abre el proyecto.
- **Tablero**: Kanban (estilo Trello, con badge de vencimiento por tarjeta) y Cronograma (Gantt con línea de "hoy" y barra de avance dentro de cada fila) fusionados en una sola pestaña, alternables con un selector Tablero/Cronograma.
- **Tabla**: alta, edición, eliminación, búsqueda, filtros por tipo/estado y exportación a CSV.
- **Tema oscuro**: toggle manual en el header (persiste en `localStorage`).

## Detalle de proyecto (`/project/[id]`)

Cada proyecto tiene una página propia con 7 módulos adicionales, todos con alta/edición/eliminación:

| Módulo | Para qué sirve |
|---|---|
| 📐 Relevamiento | Información de campo previa a la obra: ubicación, **mapa interactivo para marcar coordenadas** ([components/LocationPicker.tsx](components/LocationPicker.tsx), Leaflet BSD-2-Clause + tiles de OpenStreetMap — sin el wrapper `react-leaflet` porque su licencia Hippocratic no es open source en sentido estricto, mismo criterio imperativo que ThreeSkyline/DhtmlxGanttChart), superficie del terreno, tipo de suelo, accesos y servicios disponibles, mediciones y condiciones del terreno. Cada relevamiento con coordenadas cargadas muestra un link directo a OpenStreetMap en el listado |
| 💰 Cotización | Varias cotizaciones por proyecto, cada una vinculada a un contratista del directorio, con una **planilla de presupuesto** arriba de la lista que liga el monto directamente al presupuesto de la ficha de la obra (presupuesto oficial, cantidad de cotizaciones, monto de la ganadora y diferencia); la cotización con estado "Seleccionada" queda marcada en toda la fila con sombreado verde tenue + check ✓, no solo con el badge de estado |
| 🧰 Contratistas | Contratistas con los que se trabaja en esta obra, por rubro — cada uno linkea a su ficha completa en el directorio |
| 📋 Parte Diario | Antes "Bitácora diaria" — se amplió para cualquier dato, aviso, alerta o pendiente del día, no solo avance/clima: tipo de registro (Dato/Aviso/Alerta/Pendiente/Relevante), clima y personal opcionales, detalle, y estado Abierto/Resuelto para hacerle seguimiento a un pendiente. Al entrar a la pestaña se abre directo el formulario de carga, con la fecha de hoy ya puesta y mostrada arriba del módulo — pensado para anotar algo del día sin fricción |
| 💸 Ejecución | Ledger financiero de la obra (antes "Movimientos"; cada registro individual sigue llamándose "movimiento"): gasto, adelanto, pago/certificación de avance, devolución, ingreso de capital u orden de cambio (el concepto original de este módulo, ahora un tipo más) — cada uno con **fecha real** (no la de carga), monto, contratista y cotización vinculados (opcional), categoría, medio de pago, comprobante (número o **link a una imagen**, con miniatura embebida) y estado (Pendiente/Pagado/Conciliado). El **Ejecutado** de la ficha del proyecto se calcula solo sumando estos movimientos ([lib/spent.ts](lib/spent.ts)) — ya no se carga a mano en el wizard. Trae planilla resumen (presupuesto, ejecutado, adelantado, impacto de órdenes de cambio, saldo disponible) + barra visual de % ejecutado, un donut de gasto por categoría, una curva de ejecución acumulada mes a mes contra el presupuesto, y filtros (tipo, estado, texto, rango de fechas) con orden por fecha o monto |
| 🚜 Maquinarias | Ficha por maquinaria/equipo usado en la obra (antes "Equipo", de personas): modalidad (**Propia** / **Alquilada** / **Servicio tercerizado**), tipo de maquinaria, marca/modelo, patente, proveedor/contratista vinculado (opcional, con link a su ficha), costo, fechas de inicio y devolución, operador asignado, estado (Operativa/En mantenimiento/Fuera de servicio/Devuelta) y notas |
| 📎 Documentos | Enlaces a planos, contratos y permisos |
| 📷 Fotos de avance | Registro fotográfico del progreso, con **miniatura embebida** de cada imagen, etapa de la obra (Inicio/Medio/Final) y un comentario/contexto por foto |

"Checklist de seguridad", "Hitos", "Presupuesto detallado" y "Actividad" se sacaron del listado de pestañas a pedido del usuario — sus configs siguen en [lib/itemKinds.ts](lib/itemKinds.ts) sin borrar, así que ningún registro viejo bajo esos kinds se pierde, solo dejan de mostrarse como opción.

Estos módulos comparten un solo modelo de datos (`ProjectItem`, ver `prisma/schema.prisma`) con un campo `data` en JSON — la config de campos/estados por módulo vive en [lib/itemKinds.ts](lib/itemKinds.ts).

## Directorio de contratistas (`/contratistas`)

Sección **global** (no pertenece a ningún proyecto) para comparar contratistas de distintos rubros y ciudades antes de contratar. Cada ficha (`/contratistas/[id]`) tiene:

- Rubros (civil/eléctrico/vial, uno o varios), ciudad/provincia, celular, email, contacto, RUC, estado activo/inactivo.
- **Historial de obras**: una entrada por cada obra trabajada junto al contratista, opcionalmente vinculada a un proyecto existente, con su propia calificación 1-5 (tipo Uber) y comentario. La ficha muestra el promedio.

CRUD completo: crear/editar/**eliminar** desde `/contratistas` (cada tarjeta) y eliminar también desde la propia ficha (`/contratistas/[id]`, botón en el header) — al eliminar un contratista se borra en cascada su historial de calificaciones (`onDelete: Cascade` en el schema).

El módulo Cotización de cada proyecto se alimenta de este directorio (`GET /api/contractors`) para elegir el contratista al cargar una cotización.

## Fábrica de Postes (`/postes`)

Control de producción de postes de hormigón bajo especificaciones técnicas de la ANDE — sección global aparte de las obras (sidebar + al lado de Dashboard/Tablero/Tabla), con su propio modelo relacional (`PoleSpec`/`PoleLot`/`PoleQualityTest` en `prisma/schema.prisma`) en vez del patrón `ProjectItem`/JSON que usan los módulos de proyecto, porque acá los campos son fijos y conocidos de antemano.

**No hay una tabla de "clases ANDE oficiales" hardcodeada** — la nomenclatura exacta de clases varía y hay que cargarla real, no inventada (se investigó contra pliegos reales de licitaciones DNCP de adquisición de postes para ANDE — ver comentarios en [lib/poleFields.ts](lib/poleFields.ts)). Lo que sí está confirmado es la estructura de campos que describe una ficha técnica: longitud en metros, esfuerzo nominal en kgf, diámetro en la base, calidad del hormigón.

Tres pestañas dentro de `/postes`:
- **Resumen**: especificaciones activas, lotes en proceso/aprobados/rechazados, stock de postes en depósito (aprobados menos despachados), donut de lotes por estado.
- **Especificaciones**: catálogo de tipos de poste que produce la fábrica (longitud, esfuerzo nominal, diámetro, calidad del hormigón, armadura, norma ANDE) — CRUD completo; no se puede eliminar una especificación con lotes cargados (se sugiere marcarla inactiva).
- **Lotes de producción**: cada lote (código, especificación, cantidad, fecha de colado/desmolde, responsable) recorre `en_curado → listo_para_ensayo → en_ensayo → aprobado/rechazado → despachado`, con filtro por estado. Cada lote tiene su propia ficha (`/postes/lotes/[id]`) con los datos de aprobación ANDE (fecha, N° de acta, inspector), cantidad despachada vs. disponible, y el listado de **ensayos de calidad** (ruptura/flexión, verificación dimensional, curado) con alta/eliminación.
