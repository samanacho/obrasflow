# ObrasFlow — instrucciones para Claude

Gestión de obras de una constructora de Paraguay (Next.js 14 App Router +
Prisma + Postgres), con un asistente de WhatsApp, **Memby** (Baileys + Claude).

## Con quién trabajás

Ignacio, el dueño, no es programador: dirige, prueba y decide; el código lo
escribís vos. Hablale en español de Paraguay, con voseo, claro y sin jerga; si
usás un término técnico, explicalo en pocas palabras. Cerrá cada respuesta con
"Qué necesito de vos" y "Próximos pasos recomendados".

## Dónde está cada cosa (leé el que corresponda antes de tocar esa parte)

- Correr la app, producción, previews, CI y login → `docs/entorno.md`
- Memby / conector de WhatsApp / compras por el grupo → `worker/CLAUDE.md`
- Interfaz: diseño y librerías permitidas → `docs/interfaz.md`
- Decisiones de producto ya tomadas → `docs/decisiones.md`
- Pendientes e ideas → `docs/sesiones/backlog.md`
- Sesión en loop → `/sesion`

## Cómo entra un cambio a producción

1. Rama nueva desde `main`. Nunca commits ni push directo a `main`.
2. Commits chicos, en español; el mensaje dice por qué y termina con la
   línea Co-Authored-By de Claude.
3. Push y PR (`gh pr create --base main`): qué cambió y qué tiene que probar
   Ignacio en el preview.
4. CI en verde (`gh pr checks`).
5. Ignacio prueba en el preview de Vercel (el link está en el PR).
6. Merge (`gh pr merge <n> --merge --delete-branch`) solo cuando Ignacio lo
   pide en la conversación. Avisar que está listo no es permiso para mergear.

Por qué: `main` se despliega solo a producción e Ignacio no puede leer el
código; el preview (con su propia copia de la base) es donde él prueba sin
riesgo, y el PR deja escrito qué entró.

## Reglas

- **Cambios de esquema, solo aditivos**: agregar tablas o columnas opcionales;
  nunca renombrar ni borrar en un solo paso. Por qué: el deploy corre
  `prisma db push` contra la base de producción. Sin `--accept-data-loss`, un
  cambio destructivo hace fallar el deploy. Nunca vuelvas a agregar ese flag.
- **Nunca pidas ni escribas secretos en el chat** (tokens, claves, URL de la
  base). Van en `.env.local` o en la pantalla local. Por qué: lo que se
  escribe en el chat queda en el historial.
- **No toques datos reales de producción para probar.** Memby escribe en
  producción desde la PC: antes de probar cambios en `worker/`, seguí
  `worker/CLAUDE.md`.
- **Antes de agregar una librería, mirá `docs/interfaz.md`**: casi siempre hay
  una que ya lo resuelve. Por qué: cada librería nueva es un patrón más que
  Ignacio y los usuarios tienen que reaprender.
- **Una ruta nueva que anote historial usa `appSource()`**. Por qué: el
  historial muestra quién hizo cada cambio.
- Toda regla nueva que agregues a este archivo lleva su "Por qué": qué pasó o
  qué se evita. Si no lo sabés, preguntale a Ignacio antes de escribirla.
