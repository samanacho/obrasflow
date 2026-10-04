# Entorno: correr la app, producción y versiones de prueba

Lo de Memby (conector de WhatsApp) está en `worker/CLAUDE.md`.

## Local

- Modo local completo (`scripts/local.mjs`): Postgres local en `.local-db/`
  (127.0.0.1:5433), app en http://localhost:3000 servida por Fastify + Next
  (`server/local-server.mjs`, solo 127.0.0.1) y conector de WhatsApp (3099).
  - `npm run local` = modo **dev**: recarga en caliente (compila en `.next-dev/`).
  - `npm run local:prod` = modo **prod**: `next build` si el código cambió y sirve `.next/`.
  - Estado: http://localhost:3000/__salud (app, base y conector). Logs con hora.
  - El conector se reinicia solo al cambiar `worker/` o lo que importa de `lib/`
    (la sesión de `.baileys-auth/` se conserva). Ctrl+C apaga todo en orden.
  - Si Memby de producción está prendido: `npm run local -- --sin-conector`
    (comparten la sesión de WhatsApp; ver `worker/CLAUDE.md`). Otra opción:
    `--sin-web` (no levanta la app).
  - Pantalla del agente: http://localhost:3000/agente-whatsapp
- Uso diario en esta PC (arranque con Windows): el acceso
  "ObrasFlow conector WhatsApp.vbs" de la carpeta Inicio lanza tres cosas:
  - `scripts/start-local.cmd [dev|prod]`: **solo la base local**
    (`local.mjs --sin-web --sin-conector`), en un bucle que la reinicia si se
    cae (log en `logs/conector-whatsapp.log`).
  - `E:\Desarrollos\ObrasFlow-versiones\iniciar-principal.cmd`: la app en
    http://localhost (puerto 80), desde la copia `ObrasFlow-versiones\A`,
    con esa base local.
  - `E:\Desarrollos\ObrasFlow-versiones\iniciar-memby.cmd`: Memby contra
    producción (ver `worker/CLAUDE.md`).
  Por qué `start-local.cmd` no levanta app ni conector: la app ya la sirve la
  copia principal, y un segundo conector usaría la misma sesión de WhatsApp
  (`.baileys-auth/`) que Memby y se pisarían. El viejo
  `scripts/start-conector.cmd` → `scripts/local-stack.mjs` (base + app con
  `next start` + conector) ya no lo lanza el arranque; queda en el repo.
- Tests: `npm test` (Vitest, `vitest.config.ts`). Solo lógica pura, sin base
  ni red: plata y compras (`lib/compras/*.test.ts`), fechas y validaciones,
  login y app local (`lib/auth/`), Memby y WhatsApp (`lib/memby/`,
  `lib/whatsapp/`), Residente de Obra y reparto de beneficios. Corren en UTC
  como Vercel: lo que dependa de la hora de Paraguay la fija a mano.

## Producción

- Producción: https://obrasflow-app.vercel.app (base Neon, se despliega con
  cada push a `main`). El build corre `prisma db push` sin `--accept-data-loss`:
  los cambios de esquema tienen que ser aditivos (si uno fuera a borrar datos,
  el deploy falla). Nunca vuelvas a agregar ese flag.
- Migraciones de datos de una sola vez: después del `db push`, el build corre
  `scripts/migraciones/aplicar.mjs`. Cada migración tiene un id fijo y deja
  su marca en la tabla `DataMigration`, así no se repite. Corre en producción
  y en cada preview (cada uno con su base). Si falla, el deploy falla sin
  dejar nada a medias. Una nueva se agrega al final de la lista y su id no se
  cambia nunca. Cambiar datos de producción así solo con el OK de Ignacio.
- `PERSONAL_USUARIOS` (Vercel → Settings → Environment Variables): usuarios de
  ingreso que ven la pantalla Personal, separados por coma. Sin la variable,
  solo el primer usuario creado.
- Vercel: un solo proyecto conectado al repo, `obrasflow-app` (cuenta
  `nachopy`). La base es Neon, conectada por la integración de Vercel
  (`obrasflow-db`); sus variables (`POSTGRES_PRISMA_URL`,
  `POSTGRES_URL_NON_POOLING`, etc.) las administra la integración.
  `scripts/resolve-db-env.sh` elige cuál usar.

## Cómo entra un cambio

1. Rama nueva desde `main` actualizado. Nunca commits ni push directo a `main`
   (bloqueado en `.claude/settings.json`).
2. Push y PR (`gh pr create --base main`).
3. **CI** (`.github/workflows/ci.yml`) en cada PR: `prisma generate`,
   `tsc --noEmit`, `npm test` y `next build`, con URLs de base falsas. No
   corre `prisma db push` ni se conecta a Neon, así que no prueba cambios de
   esquema: eso lo prueba el deploy del preview.
4. **Preview de Vercel**: cada rama subida arma una versión de prueba (link en
   el PR). La integración de Neon le crea **una branch propia de la base**
   (copia de `main` al momento del deploy), así que el `prisma db push` y lo
   que se pruebe ahí no tocan producción. La copia trae datos reales: se
   pueden ver, no se modifican en producción.
5. Merge cuando Ignacio lo pide (`gh pr merge <n> --merge --delete-branch`).

Mantenimiento: el plan gratuito de Neon tiene un límite de branches. Si se
acumulan copias de previews viejos: Neon (vercel.com → Storage → obrasflow-db →
Open in Neon) → Branches → borrar las `preview/...` de ramas ya mergeadas.
Nunca borrar `main`.

## Login

- Login (`middleware.ts`, `lib/auth/`): usuario y contraseña por persona, sin
  roles. Cookie firmada de 12 h que se renueva hasta 30 días ("Recordarme")
  si el usuario sigue activo. Quedan afuera del login: `/api/memby/*`,
  `/api/backup`, los webhooks de WhatsApp y de Residente, `/api/auth/*`,
  `/privacidad`, `/terminos` y `/ingresar`. La app local
  (`OBRASFLOW_LOCAL=1`) no pide login, pero solo acepta pedidos de la misma
  PC (`lib/auth/local.ts`).
  Usuarios nuevos: pantalla Usuarios → "Invitar a alguien" (link de un solo
  uso). El primero: `node --env-file=..\ObrasFlow-versiones\memby.env
  scripts/invitar-usuario.mjs "Nombre"`. El historial guarda el nombre de
  quien hizo el cambio (`appSource()`); una ruta nueva que anote historial
  tiene que usarlo. `AUTH_SECRET` (opcional) cambia la firma y cierra todas
  las sesiones.
