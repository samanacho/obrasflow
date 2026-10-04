# ObrasFlow — instrucciones para Claude

Sistema de gestión de obras de una constructora de Paraguay (Next.js 14 App
Router + Prisma + Postgres), con un asistente de WhatsApp llamado **Memby**
(Baileys + Claude). Pantalla: /agente-whatsapp (atajo /memby).
El dueño (Ignacio) no es técnico: explicá en español de Paraguay, con voseo,
claro y sin jerga.

## Modo de trabajo: sesión en loop con rondas amplias

Es la práctica habitual en este repositorio (en la app de Claude y en el CLI
`claude`). Se activa con `/sesion` o cuando el dueño pide trabajar "en loop".
El dueño quiere que **cada ronda abarque mucho**: varias áreas, varias
mejoras, preguntas que abran decisiones reales. Nada de rondas de una sola cosa.

### Cada ronda tiene 4 partes

1. **Radar** (antes de preguntar): revisá la app de punta a punta (código y
   pantalla) buscando errores, inconsistencias, pantallas lentas o feas,
   datos que faltan y oportunidades. Usá un subagente de búsqueda en paralelo
   mientras trabajás. Los arreglos chicos y seguros se hacen sin preguntar y
   se informan; lo demás alimenta las opciones.
2. **Preguntas** (AskUserQuestion): siempre **4 preguntas con 4 opciones**
   concretas, cubriendo dimensiones distintas:
   - **Paquete principal** (selección múltiple): 4 paquetes de 3 a 6 mejoras
     cada uno, con nombre y la lista de lo que incluye en la descripción.
   - **Segundo frente** (selección múltiple): otra pantalla o módulo para
     avanzar en paralelo en la misma ronda.
   - **Calidad / profundidad** (selección múltiple): visual, velocidad,
     celular, datos y reportes, seguridad, pruebas automáticas, accesibilidad.
   - **Decisión de producto**: una decisión real con consecuencias (cómo debe
     funcionar algo del negocio, prioridades, reglas), o el próximo horizonte.

   Reglas: la recomendada va primera con "(Recomendado)"; cada opción dice
   QUÉ cambia, DÓNDE y QUÉ gana el dueño; prohibidas las opciones vagas
   ("Ajustar algo", "Otra pantalla"). Cuando la decisión es visual, usá
   `preview` con un boceto (texto/ASCII) de cómo quedaría cada opción. No
   preguntes lo que se deduce del código.
3. **Ejecución**: implementá TODO lo elegido en la ronda (subagentes en
   paralelo para frentes independientes), verificá (tipos, build, pantalla,
   celular) y hacé un commit por área.
4. **Resumen corto**: qué quedó hecho (por paquete), qué probaste, qué tiene
   que probar el dueño; y seguí con la ronda siguiente.

Mantené `docs/sesiones/backlog.md` al día: ideas del radar, pendientes y lo
hecho por ronda. Las rondas sacan opciones de ahí.

Seguí hasta que el dueño diga que termina ("terminar", "fin de sesión",
"cortamos"). Nunca cierres la sesión por tu cuenta. Al terminar: resumen de
la sesión, commits y próximos pasos recomendados. Aunque no haya loop activo,
cerrá cada respuesta con "Qué necesito de vos" y "Próximos pasos recomendados".

## Entorno

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
- **Memby registra en producción** (desde 26/09/2026): el conector de la PC
  corre con `MEMBY_REMOTE_URL=https://obrasflow-app.vercel.app` y
  `MEMBY_CONNECTOR_KEY` (misma clave en Vercel). Así `lib/prisma.ts` usa el
  cliente remoto (`lib/memby/remote-prisma.ts` → `/api/memby/db`) y confirmar
  una propuesta corre entero en Vercel (`/api/memby/execute`, usa transacción).
  El conector no puede usar `$transaction` ni SQL crudo. Lo arranca
  `E:\Desarrollos\ObrasFlow-versiones\iniciar-memby.cmd` (config en
  `memby.env`, fuera del repo; log en `logs/memby.log`). El QR se ve en la app
  local: http://localhost/agente-whatsapp.
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
- Producción: https://obrasflow-app.vercel.app (base Neon, se despliega con
  cada push a `main`). El build corre `prisma db push --accept-data-loss`:
  los cambios de esquema tienen que ser aditivos.
- Interfaz: dirección visual "Plano técnico" (tokens en `app/globals.css`:
  paleta cálida apagada, acento azul acero, superficies planas sin sombras,
  cuadrícula de plano solo en la barra superior; contraste AA en claro y oscuro).
  Antes de agregar una librería, revisá si alguna de estas ya lo resuelve:
  - Bootstrap 5 + CoreUI (componentes y estilos). Botón con relleno = acción
    principal de la pantalla; contorno = secundaria.
  - Íconos: SOLO `components/ui/Icon.tsx` con Phosphor
    (`<Icon icon={Buildings} />`, duotono por defecto). Nada de emojis como íconos.
  - Diálogos y avisos: SOLO `lib/ui/alerts.ts` (SweetAlert2): `confirmar`,
    `confirmarAccion` (confirma y ejecuta con "Un momento…" y el error adentro),
    `avisar`, `notificar`. Nada de window.alert/confirm ni modales propios.
  - Selects con buscador: `components/ui/Select2.tsx` (Select2 + tema Bootstrap 5),
    solo en listas largas (obras, proveedores, contratistas, ciudades).
  - Tablas largas: `components/ui/DataTable.tsx` (DataTables 3, sin jQuery, en español).
  - Fotos y comprobantes: `components/ui/ImageViewer.tsx` (visor con zoom).
  - Gráficos y mapas: Chart.js, Leaflet, dhtmlx-gantt.
  - Fechas: Day.js vía `lib/dayjs.ts` (español, hora de Paraguay: `fmtFecha`, `haceCuanto`…).
  - Animate.css está cargado, pero movimiento solo donde informa algo (y
    siempre respetando `prefers-reduced-motion`).
  - jQuery 4: SOLO con `lib/ui/useJQuery.ts` sobre contenedores que React no dibuja
    (plugins). Nunca para modificar elementos de React.
- Login (`middleware.ts`, `lib/auth/`): usuario y contraseña por persona, sin
  roles. Cookie firmada de 12 h que se renueva hasta 30 días ("Recordarme")
  si el usuario sigue activo. Quedan afuera del login: `/api/memby/*`,
  `/api/backup`, los webhooks de WhatsApp y de Residente, `/privacidad`,
  `/terminos` y `/ingresar`. La app local (`OBRASFLOW_LOCAL=1`) no pide login.
  Usuarios nuevos: pantalla Usuarios → "Invitar a alguien" (link de un solo
  uso). El primero: `node --env-file=..\ObrasFlow-versiones\memby.env
  scripts/invitar-usuario.mjs "Nombre"`. El historial guarda el nombre de
  quien hizo el cambio (`appSource()`); una ruta nueva que anote historial
  tiene que usarlo. `AUTH_SECRET` (opcional) cambia la firma y cierra todas
  las sesiones.

## Reglas

- Nunca pidas ni escribas secretos en el chat (tokens, claves, URL de la
  base). Van en `.env.local` (ignorado por git) o en la pantalla local.
- No toques datos reales de producción para pruebas.
- Commits: mensaje en español, terminando con la línea Co-Authored-By de
  Claude. Push a `main` solo con el trabajo verificado (tipos + build).
