# Backlog

## En curso
- PR #6 (revisión: urgentes y errores), #7 (reimportar presupuesto + montos
  con puntos) y #8 (lista de mantenimiento) apilados: se mergean en ese orden.

## Esperando a Ignacio
- Borrar el proyecto abandonado `obrasflow` en Vercel (sin repo, sin base,
  un solo deploy fallido del 24/08). Settings → General → Delete Project.
- Decisiones de la revisión del 04/10 (numeración de la respuesta de ese día):
  - #1 clave de Memby con acceso a toda la base (incluye usuarios);
  - #2 borrar obra = borrar todo en cascada (¿archivar?);
  - #3 sesiones que no se pueden cortar;
  - #4 sin roles;
  - #5 `AUTH_SECRET` propio en producción;
  - #6 gasto "Pendiente" suma al Ejecutado;
  - #7 pedido aprobado editable sin volver a aprobar;
  - #8 reparto de beneficios con obras planificadas y pérdidas;
  - #11 historial y galería de la obra (mostrar o borrar);
  - #12 ciudad 3D y Gantt del Inicio;
  - #13 PIN de Personal visible en el código;
  - #14 proteger `main` en GitHub;
  - #15 actualizar Next 14 / Prisma 5;
  - #16 Memby a `claude-sonnet-5-5`;
  - #17 facturas y cancelaciones de Memby en Vercel;
  - #18 Residente: parte sin fecha pisa al que tiene fecha;
  - #19 borrar herramienta borra su egreso, borrar lote borra ensayos ANDE;
  - #20 renglones ambiguos de WhatsApp van a notas.

## Ideas del radar (sin decidir)
- **Prioritario — sesión de WhatsApp de prueba para Memby**: hoy Memby de
  producción y `npm run local` usan la misma carpeta `.baileys-auth/`; si
  corren juntos se pisan y el de prueba puede responder mensajes reales.
  Una carpeta aparte (`BAILEYS_AUTH_DIR`) vinculada a otro número permite
  probar `worker/` sin apagar Memby. Gana: probar cambios de Memby sin riesgo.
- Memby de producción corre desde el worktree `ObrasFlow-versiones\A`, fijado
  en una versión vieja (`1ea3fac`): pasarlo a `origin/main` (ver
  `worker/CLAUDE.md`) cuando Ignacio quiera los cambios nuevos en WhatsApp.
  Gana: Memby al día con lo mergeado.
- Arranque con Windows: el acceso de la carpeta Inicio ya lanza
  `scripts/start-local.cmd` (más la app principal y Memby; revisado el
  04/10). El viejo `scripts/start-conector.cmd` → `scripts/local-stack.mjs`
  ya no lo lanza nada (solo lo nombra el respaldo `….vbs.anterior` de la
  carpeta Inicio): se pueden borrar con el OK de Ignacio. Gana: un camino
  menos para arrancar un conector que pise la sesión de Memby.

## Hecho
### 2026-10-04 — revisión completa del repo (PR #6, #7, #8)
- #6: urgentes y errores (login, app local, gastos duplicados, montos,
  facturas, Memby, fechas, Residente, pantallas) + tests de 5 a 96.
- #7: reimportar presupuesto preguntando cada coincidencia; montos con puntos
  de miles (`MontoInput`).
- #8: freno de login en la base, links y adjuntos seguros, transacciones,
  consultas livianas, backup por partes, topes de pago e IVA, propuestas de
  Memby colgadas, reconexión con espera, sin consultas con la pestaña oculta,
  emojis → Phosphor, modo oscuro sin destello, menú que se recuerda, código
  muerto y `legacy/` borrados, README y scripts al día.

### 2026-10-04 — reorganización del setup (PR #1 a #5)
- Fase 0: deploy sin `--accept-data-loss`; permisos con comandos bloqueados;
  sonidos solo para "terminé", "te necesito" y "pido permiso".
- Fase 1: previews con su propia copia de la base (integración de Neon).
  Borrado el proyecto abandonado `obrasflow2`.
- Fase 2: ramas y PR, CI en GitHub, 5 tests de los cálculos de plata.
- Fase 3: CLAUDE.md corto + `worker/CLAUDE.md`, `docs/entorno.md`,
  `docs/interfaz.md`; push a `main` bloqueado.
- Fase 5: `react-plotly.js` desinstalado (no se usaba); TanStack y Plotly
  documentados como excepciones; agente UX recortado (15 KB → 10 KB) y
  apuntando a `docs/interfaz.md`; `docs/decisiones.md` creado.
- Íconos: los 26 de CoreUI pasan a Phosphor en 15 pantallas (PR #4).
- Fase 4: `/sesion` pasa a skill (`.claude/skills/sesion/`) con plantillas de
  backlog y decisiones; preguntas "hasta 4" en vez de "siempre 4×4"; cada
  ronda en una rama con su PR. Plan movido a `docs/historial/`.
- Sonidos de peon-ping: no andaban nunca porque Windows bloqueaba los scripts
  de PowerShell; el usuario de Windows pasó a `RemoteSigned`.
