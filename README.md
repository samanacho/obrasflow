# ObrasFlow

Panel de gestión de proyectos de obras civiles, eléctricas y viales — Next.js (App Router) + Prisma + Postgres, pensado para desplegar en Vercel.

## Stack

- **Next.js 14 (App Router)** — API routes (`app/api/projects`) y frontend (`app/page.tsx`) en el mismo proyecto.
- **Prisma** — ORM sobre Postgres (`prisma/schema.prisma`).
- **Postgres** — pensado para [Neon](https://neon.tech) o Vercel Postgres (ambos son Postgres serverless compatibles con Prisma).
- **Bootstrap 5 + CoreUI** (`@coreui/react`) — admin template open source elegido tras comparar AdminLTE, Tabler y CoreUI; se usó CoreUI por tener componentes React reales en vez de HTML/jQuery estático. Layout tipo Odoo: sidebar izquierdo persistente ([components/AppShell.tsx](components/AppShell.tsx)) + breadcrumbs, en vez de las pestañas horizontales de la primera versión.

El prototipo estático original (un solo `index.html` con datos embebidos) quedó en [`legacy/index.html`](legacy/index.html) como referencia.

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

Cada proyecto tiene una página propia con 10 módulos adicionales, todos con alta/edición/eliminación:

| Módulo | Para qué sirve |
|---|---|
| 📐 Relevamiento | Información de campo previa a la obra: ubicación, coordenadas, mediciones y condiciones del terreno |
| 💰 Cotización | Varias cotizaciones por proyecto, cada una vinculada a un contratista del directorio, para comparar y marcar la elegida |
| 🧰 Contratistas | Contratistas con los que se trabaja en esta obra, por rubro — cada uno linkea a su ficha completa en el directorio |
| 📋 Bitácora diaria | Registro diario de avance, clima y personal en obra |
| 🔁 Órdenes de cambio | Cambios de alcance con impacto en presupuesto |
| 👷 Equipo | Responsables y contactos asignados |
| ✅ Checklist de seguridad | Inspecciones y controles del sitio |
| 🚩 Hitos | Fechas clave del proyecto |
| 📎 Documentos | Enlaces a planos, contratos y permisos |
| 📷 Fotos de avance | Registro fotográfico del progreso |
| 💵 Presupuesto detallado | Desglose por partidas de costo |
| 🕒 Actividad | Historial automático (solo lectura) de todo lo anterior |

Estos módulos comparten un solo modelo de datos (`ProjectItem`, ver `prisma/schema.prisma`) con un campo `data` en JSON — la config de campos/estados por módulo vive en [lib/itemKinds.ts](lib/itemKinds.ts).

## Directorio de contratistas (`/contratistas`)

Sección **global** (no pertenece a ningún proyecto) para comparar contratistas de distintos rubros y ciudades antes de contratar. Cada ficha (`/contratistas/[id]`) tiene:

- Rubros (civil/eléctrico/vial, uno o varios), ciudad/provincia, celular, email, contacto, RUC, estado activo/inactivo.
- **Historial de obras**: una entrada por cada obra trabajada junto al contratista, opcionalmente vinculada a un proyecto existente, con su propia calificación 1-5 (tipo Uber) y comentario. La ficha muestra el promedio.

El módulo Cotización de cada proyecto se alimenta de este directorio (`GET /api/contractors`) para elegir el contratista al cargar una cotización.
