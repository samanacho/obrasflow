# ObrasFlow — instrucciones para Claude

Sistema de gestión de obras de una constructora de Paraguay (Next.js 14 App
Router + Prisma + Postgres), con un agente de WhatsApp (Baileys + Claude).
El dueño (Ignacio) no es técnico: explicá en español de Paraguay, con voseo,
claro y sin jerga.

## Modo de trabajo: sesión en loop con preguntas de opción múltiple

Es la práctica habitual en este repositorio (en la app de Claude y en el CLI
`claude`). Se activa con `/sesion` o cuando el dueño pide trabajar "en loop".

1. **Cada respuesta termina con preguntas de opción múltiple** usando la
   herramienta de preguntas (AskUserQuestion): de 1 a 4 preguntas por ronda,
   de 2 a 4 opciones cada una, con una descripción corta de qué implica cada
   opción. La recomendada va primera y dice "(Recomendado)". Usá selección
   múltiple cuando las opciones no se excluyen (por ejemplo, "qué módulos
   mejorar"). Siempre existe la opción de escribir otra cosa.
2. **Trabajá entre rondas**: con las respuestas, implementá, probá y mostrá el
   resultado (captura o link local) antes de la próxima ronda. No hagas
   preguntas cuya respuesta se puede deducir del código.
3. **Seguí hasta que el dueño diga que termina** ("terminar", "fin de
   sesión", "cortamos"). Nunca cierres la sesión por tu cuenta.
4. **Al terminar**: resumen de lo hecho en la sesión, commits hechos y
   próximos pasos recomendados.
5. Aunque no haya loop activo, cerrá cada respuesta con "Qué necesito de vos"
   y "Próximos pasos recomendados".

## Entorno

- Modo local completo (`npm run local`, arranca solo con Windows): Postgres
  local en `.local-db/`, app en http://localhost:3000, conector de WhatsApp.
  Pantalla del agente: http://localhost:3000/agente-whatsapp
- Producción: https://obrasflow-app.vercel.app (base Neon, se despliega con
  cada push a `main`). El build corre `prisma db push --accept-data-loss`:
  los cambios de esquema tienen que ser aditivos.
- Librerías de interfaz disponibles: Bootstrap 5 + CoreUI (componentes y
  estilos), @coreui/icons, Chart.js, Plotly, Leaflet, dhtmlx-gantt, three.
  Antes de agregar otra, revisá si alguna de estas ya lo resuelve.

## Reglas

- Nunca pidas ni escribas secretos en el chat (tokens, claves, URL de la
  base). Van en `.env.local` (ignorado por git) o en la pantalla local.
- No toques datos reales de producción para pruebas.
- Commits: mensaje en español, terminando con la línea Co-Authored-By de
  Claude. Push a `main` solo con el trabajo verificado (tipos + build).
