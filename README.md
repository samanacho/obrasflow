# ObrasFlow

Panel de gestión de proyectos de obras civiles, eléctricas y viales — Next.js (App Router) + Prisma + Postgres, pensado para desplegar en Vercel.

## Stack

- **Next.js 14 (App Router)** — API routes (`app/api/projects`) y frontend (`app/page.tsx`) en el mismo proyecto.
- **Prisma** — ORM sobre Postgres (`prisma/schema.prisma`).
- **Postgres** — pensado para [Neon](https://neon.tech) o Vercel Postgres (ambos son Postgres serverless compatibles con Prisma).

El prototipo estático original (un solo `index.html` con datos embebidos) quedó en [`legacy/index.html`](legacy/index.html) como referencia.

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

- **Dashboard**: KPIs, barras de presupuesto/avance, y alertas de vencimientos próximos y sobre-presupuesto.
- **Tablero (Kanban)**: mover proyectos entre estados.
- **Tabla**: alta, edición, eliminación, búsqueda, filtros por tipo/estado y exportación a CSV.
- **Cronograma**: vista tipo Gantt según fechas.
- **Tema oscuro**: toggle manual en el header (persiste en `localStorage`).

## Detalle de proyecto (`/project/[id]`)

Cada proyecto tiene una página propia con 10 módulos adicionales, todos con alta/edición/eliminación:

| Módulo | Para qué sirve |
|---|---|
| 📐 Relevamiento | Información de campo previa a la obra: ubicación, coordenadas, mediciones y condiciones del terreno |
| 💰 Cotización | Varias cotizaciones por proyecto, cada una vinculada a un contratista del directorio, para comparar y marcar la elegida |
| 🧾 Punch List | Pendientes de cierre antes de terminar el proyecto |
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
