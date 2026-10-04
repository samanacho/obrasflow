# Backlog

## En curso
- Reorganización del setup de Claude (`docs/reorganizacion-claude.md`):
  Fases 0 a 3 hechas; Fase 5 en PR (agente UX, librerías, íconos a Phosphor);
  falta la 4 (loop como skill, con plantillas de backlog y decisiones).

## Esperando a Ignacio
- Borrar el proyecto abandonado `obrasflow` en Vercel (sin repo, sin base,
  un solo deploy fallido del 24/08). Settings → General → Delete Project.

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
- Arranque con Windows: el acceso de la carpeta Inicio sigue lanzando el viejo
  `scripts/start-conector.cmd`; pasarlo a `scripts/start-local.cmd`.

## Hecho
### 2026-10-04 — reorganización del setup (PR #1 a #3)
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
