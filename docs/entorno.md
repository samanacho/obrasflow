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
  - Arranque con Windows: `scripts/start-local.cmd [dev|prod]` (log en
    `logs/conector-whatsapp.log`). Hasta hacer el cambio, el acceso de la
    carpeta Inicio sigue lanzando el viejo `scripts/start-conector.cmd` →
    `scripts/local-stack.mjs` (next start).
  Pantalla del agente: http://localhost:3000/agente-whatsapp
- Tests: `npm test` (Vitest). Hoy cubren los cálculos de plata de Compras
  (`lib/compras/calculos.test.ts`).

## Producción

- Producción: https://obrasflow-app.vercel.app (base Neon, se despliega con
  cada push a `main`). El build corre `prisma db push` sin `--accept-data-loss`:
  los cambios de esquema tienen que ser aditivos (si uno fuera a borrar datos,
  el deploy falla). Nunca vuelvas a agregar ese flag.
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
  `/api/backup`, los webhooks de WhatsApp y de Residente, `/privacidad`,
  `/terminos` y `/ingresar`. La app local (`OBRASFLOW_LOCAL=1`) no pide login.
  Usuarios nuevos: pantalla Usuarios → "Invitar a alguien" (link de un solo
  uso). El primero: `node --env-file=..\ObrasFlow-versiones\memby.env
  scripts/invitar-usuario.mjs "Nombre"`.
  Contraseña olvidada: otro usuario, en Usuarios → "Restablecer contraseña"
  (link de un solo uso, `UserInvitation.userId`; el usuario no cambia). Si
  nadie puede entrar: el mismo script con `--usuario <usuario>`. El historial guarda el nombre de
  quien hizo el cambio (`appSource()`); una ruta nueva que anote historial
  tiene que usarlo. `AUTH_SECRET` (opcional) cambia la firma y cierra todas
  las sesiones.
