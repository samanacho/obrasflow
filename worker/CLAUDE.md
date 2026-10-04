# Memby (conector de WhatsApp) — instrucciones para Claude

Se carga solo cuando trabajás en `worker/`. Las reglas generales están en el
`CLAUDE.md` de la raíz. Pantalla del agente en la app: /agente-whatsapp
(atajo /memby).

## Cómo corre en producción

- **Memby registra en producción** (desde 26/09/2026): el conector de la PC
  corre con `MEMBY_REMOTE_URL=https://obrasflow-app.vercel.app` y
  `MEMBY_CONNECTOR_KEY` (misma clave en Vercel). Así `lib/prisma.ts` usa el
  cliente remoto (`lib/memby/remote-prisma.ts` → `/api/memby/db`) y confirmar
  una propuesta corre entero en Vercel (`/api/memby/execute`, usa transacción).
  El conector no puede usar `$transaction` ni SQL crudo. Lo arranca
  `E:\Desarrollos\ObrasFlow-versiones\iniciar-memby.cmd` (config en
  `memby.env`, fuera del repo; log en `logs/memby.log`). El QR se ve en la app
  local: http://localhost/agente-whatsapp.
- **Corre desde una copia aparte del repo**: `iniciar-memby.cmd` entra a
  `E:\Desarrollos\ObrasFlow-versiones\A` (un clon de GitHub), no a este
  repo. Un cambio en `worker/` o en lo que importa de `lib/` llega a Memby
  recién cuando esa copia se actualiza (`git pull` en `A`, con el cambio ya
  mergeado en `main`) y Memby se reinicia. Hacelo solo con el OK de Ignacio y
  avisale que Memby se corta unos segundos.
- Memby (conector, `worker/`): notas de voz transcriptas en la PC con Whisper
  (`worker/transcribe.mts`, modelo en `.local-models/`), avisos automáticos
  (`worker/notices.mts`, tabla `WhatsAppNotice`). Opciones en `.env.local`:
  `MEMBY_VOZ=off`, `MEMBY_AVISOS=off`, `MEMBY_RESUMEN_HORA=19`, `WHISPER_MODEL`.
- Compras (`lib/compras/`, pantalla /compras, pestaña Presupuesto de la obra):
  Memby lee SOLO el grupo de WhatsApp `MEMBY_GRUPO_COMPRAS` (por defecto
  "Pedidos de compra"): cada "Pedido de compra" se registra, al dueño le llega
  la tarjeta Sí/No (`aprobar_pedido`) y el conector avisa en el grupo cada
  cambio de estado. Pagar crea el gasto en Ejecución; la factura se agrega
  después (también por el grupo: foto con "Factura pedido 14").
  `MEMBY_APROBADOR` = número que aprueba (si no, el chat "Tú"); `MEMBY_COMPRAS=off` lo apaga.

## Restricciones del conector

- **Sin `$transaction` ni SQL crudo** (`$queryRaw`, `$executeRaw`). Por qué:
  con `MEMBY_REMOTE_URL`, cada `prisma.<modelo>.<operación>()` viaja como un
  pedido HTTP aparte a `/api/memby/db` (`lib/memby/remote-prisma.ts`), y una
  transacción no puede abarcar varios pedidos HTTP; el cliente remoto tira
  error si se la pide. Lo que necesita "todo o nada" corre entero en Vercel
  (`/api/memby/execute`) o en la app (por ejemplo, pagar un pedido en
  `lib/compras/core.ts`).
- Cada cambio de estado tiene que ser **una sola operación** (por ejemplo,
  `updateMany` con el estado esperado en el `where`), así no queda a medias
  si se corta la red entre dos pedidos.
- Ante una falla de red, el cliente remoto reintenta una vez; un error de la
  base no se reintenta (una escritura que llegó no se repite).

## Probar sin tocar producción

- `npm run local` levanta el conector **contra la base local**: lee
  `.env.local`, que no tiene `MEMBY_REMOTE_URL`, así que `lib/prisma.ts` usa
  la base de `.local-db/`. Toda prueba de cambios en `worker/` se hace así,
  nunca con `memby.env`.
- **Cuidado: los dos conectores usan la misma sesión de WhatsApp.** `memby.env`
  apunta `BAILEYS_AUTH_DIR` a `E:\Desarrollos\ObrasFlow\.baileys-auth`, la misma
  carpeta que usa `npm run local`. Si los dos corren a la vez se pisan la
  sesión, y el de prueba puede responder mensajes reales (aunque registre en
  la base local). Mientras Memby de producción esté prendido, probá con
  `npm run local -- --sin-conector`, o pedile a Ignacio que lo apague un rato.
  Pendiente (backlog): una sesión de prueba aparte, vinculada a otro número.
