# Reorganización del setup de Claude en ObrasFlow

> **Para Ignacio:** copiá este archivo en el repo como `docs/reorganizacion-claude.md`
> y decile a Claude: *"Leé docs/reorganizacion-claude.md entero y aplicalo fase por fase."*
> Claude te va a ir pidiendo las cosas que solo vos podés hacer (Vercel, Neon, GitHub)
> y te va a avisar al terminar cada fase. No hace falta hacerlo todo el mismo día.

---

## Para Claude: cómo usar este documento

Este archivo es un plan para reordenar cómo trabajás en este repo. Salió de comparar
el setup actual con el de un equipo que trabaja con Claude Code a diario. El objetivo no
es complicar el flujo de Ignacio, sino que **producción deje de ser el lugar donde se
prueba** y que **lo que Ignacio decide quede escrito**.

Reglas para aplicarlo:

1. **Leelo entero antes de tocar nada.** Después presentale a Ignacio el plan en 5 o 6
   líneas, sin jerga, y arrancá por la Fase 0.
2. **Una fase por vez.** Cada fase termina cuando pasan sus verificaciones y le contaste
   a Ignacio qué cambió y qué tiene que probar. No arranques la siguiente sin su OK.
3. **Verificá antes de suponer.** Este documento se escribió sin acceso al repo. Si un
   archivo, un script o un nombre no coincide con lo que dice acá, manda el repo:
   adaptá el paso y decíselo a Ignacio.
4. **Lo que solo Ignacio puede hacer** (paneles de Vercel, Neon o GitHub, iniciar sesión
   en herramientas), guialo paso a paso: dónde hacer clic y qué tiene que ver. Nunca le
   pidas que pegue en el chat una clave ni una URL de base de datos.
5. **Nada de datos reales de producción** en ninguna prueba de este plan.
6. Cuando termines todas las fases, mové este archivo a `docs/historial/`. Su contenido
   ya va a vivir en los archivos nuevos y no tiene que quedar como instrucción vigente.

---

## Fase 0 — Protección inmediata (no cambia la forma de trabajar)

### 0.1 Sacar `--accept-data-loss` del build

**Qué pasa hoy:** el deploy corre `prisma db push --accept-data-loss` contra la base de
producción. Si un cambio de esquema borra o renombra una columna, Prisma **borra esos
datos** y el deploy sale en verde. Nadie se entera.

**Qué hacer:**
- Buscá el comando en los tres lugares donde puede estar: el script `build` de
  `package.json`, `buildCommand` en `vercel.json` y el *Build Command* del panel de
  Vercel (Project → Settings → Build & Deployment). Pedile a Ignacio que se fije en el
  panel si hay un comando sobreescrito.
- Sacá solo el flag `--accept-data-loss`. `prisma db push` queda.

**Qué gana Ignacio:** si un cambio fuera a perder datos, el deploy **falla** y producción
sigue con la versión anterior funcionando. Un deploy fallido se arregla; datos borrados, no.

**Verificación:** el comando ya no tiene el flag en ningún lado (`grep -r "accept-data-loss"`
no devuelve nada fuera de este documento).

### 0.2 Crear `.claude/settings.json` del proyecto (commiteado)

Hoy no hay permisos de proyecto. Crealo con esto como punto de partida:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run build)",
      "Bash(npm run lint*)",
      "Bash(npm test*)",
      "Bash(npx tsc *)",
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git log*)",
      "Bash(git branch*)",
      "Bash(git checkout -b *)",
      "Bash(git add *)",
      "Bash(gh pr view*)",
      "Bash(gh pr list*)",
      "Bash(gh pr checks*)",
      "Bash(gh pr diff*)"
    ],
    "deny": [
      "Bash(git push --force*)",
      "Bash(git push -f*)",
      "Bash(*accept-data-loss*)",
      "Bash(*prisma migrate reset*)",
      "Bash(*prisma db execute*)",
      "Bash(vercel --prod*)"
    ]
  }
}
```

- `deny` frena el comando aunque se pida en un modo permisivo. Es más simple y más
  confiable que un hook que bloquea.
- Después de crearlo, abrí `/permissions` y verificá que las reglas aparezcan. La
  sintaxis con `*` en el medio depende de la versión de Claude Code: si alguna regla no
  aparece, ajustala.
- Más adelante, `/fewer-permission-prompts` arma la allowlist a partir de lo que de
  verdad se usa.
- El bloqueo de `git push` a `main` entra en la Fase 2, cuando exista el flujo con ramas.

### 0.3 Hooks: sacar el sonido de cada tool call

En el `settings.json` global (`%USERPROFILE%\.claude\settings.json`), el hook de
peon-ping en `PreToolUse` con matcher vacío abre PowerShell **antes de cada acción**. En
una ronda larga son cientos de arranques.

- Preguntale a Ignacio antes de tocarlo: es su configuración personal.
- Recomendado: sacar las entradas de `PreToolUse` y `UserPromptSubmit`. Dejar `Stop`,
  `Notification` y `PermissionRequest`, que avisan cuando de verdad lo necesitás a él.

### 0.4 Arreglar `.claude/launch.json`

Hoy apunta a `npm run dev` en el puerto 3010. El flujo real es `npm run local` en el
puerto 3000. Corregilo.

**Cierre de la Fase 0:** commit (todavía directo a `main`, como hasta ahora) y resumen
para Ignacio.

---

## Fase 1 — Una base separada para los previews

**Esta fase va antes de empezar a usar ramas, y el orden importa.** Vercel arma un
*preview* de cada rama que se sube, y lo hace corriendo el mismo build, que incluye
`prisma db push`. Si la variable `DATABASE_URL` del entorno Preview es la misma que la
de producción, **una rama sin mergear cambia el esquema de producción.**

Pasos (los hace Ignacio y vos lo guiás):

1. **Neon** → el proyecto de ObrasFlow → *Branches* → crear una branch `preview` a partir
   de la principal.
2. Copiar su connection string. Si `prisma/schema.prisma` usa `directUrl`, también la
   versión sin pooler. Revisá el schema y decile cuáles necesita.
3. **Vercel** → Project → Settings → Environment Variables → `DATABASE_URL` (y
   `DIRECT_URL` si aplica): que el valor actual quede solo para **Production**, y
   agregar el valor nuevo solo para **Preview**.
4. Revisá con Ignacio **solo por nombre** el resto de las variables que tienen marcado
   Preview, y decidan juntos si alguna apunta a algo de producción que un preview podría
   modificar.

Alternativa: si Neon está conectado por la integración de Vercel Marketplace, se puede
activar que cree una branch automática por cada preview. Es más limpio pero tiene más
piezas. Para empezar, una branch fija `preview` alcanza.

**Verificación:** en la Fase 2, cuando se suba la primera rama, Ignacio abre los logs del
build del preview en Vercel y compara el host de la base (la parte `ep-…`) con el de la
branch `preview` de Neon. Esa parte del host no es secreta; la contraseña sí.

**Mantenimiento:** la branch `preview` acumula los cambios de esquema de ramas que tal vez
nunca se mergean. Cada tanto: Neon → branch `preview` → *Reset from parent*. Anotalo en
`docs/entorno.md` (Fase 3).

---

## Fase 2 — Ramas, PR y CI

### 2.1 Requisitos

- `gh auth status`. Si `gh` no está instalado: `winget install GitHub.cli`, y después
  Ignacio corre `gh auth login` (abre el navegador).
- Las Fases 0 y 1 tienen que estar terminadas.

### 2.2 El flujo nuevo (va al CLAUDE.md en la Fase 3; aplicalo desde ya)

1. **Rama nueva** desde `main` actualizado. Nunca commits ni push directo a `main`.
2. **Commits** en la rama: en español, chicos, y el mensaje explica el porqué.
3. **Push y PR**: `git push -u origin <rama>` y después `gh pr create --base main`. El
   cuerpo del PR dice qué cambió, qué tiene que probar Ignacio y dónde.
4. **CI en verde** (`gh pr checks`).
5. **Ignacio prueba en el preview.** El link lo publica Vercel en el PR (comentario del
   bot o en `gh pr checks`).
6. **Merge solo cuando Ignacio lo pide** en la conversación ("mergeá", "subilo"):
   `gh pr merge <n> --merge --delete-branch`. Abrir el PR y avisar que está listo **no**
   es permiso para mergear.

Para Ignacio cambia una sola cosa: en vez de probar en producción, prueba en el link del
preview y dice "mergeá".

### 2.3 Bloquear el push a `main`

Agregá a `deny` en `.claude/settings.json`:

```json
"Bash(git push origin main*)",
"Bash(git push origin HEAD:main*)"
```

### 2.4 CI mínimo en GitHub Actions

Creá `.github/workflows/ci.yml`. Punto de partida:

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  verificar:
    runs-on: ubuntu-latest
    env:
      # Falsa a propósito: el CI nunca se conecta a Neon.
      DATABASE_URL: postgresql://ci:ci@127.0.0.1:5432/ci
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20   # igualala a la versión que usa Vercel en este proyecto
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
      # NO `npm run build`: ese script corre `prisma db push`.
      - run: npx next build
      - run: npm test --if-present
```

Cosas a verificar al armarlo:
- Si `next build` pide otras variables de entorno para compilar, agregá valores falsos en
  `env`. Nunca reales.
- Si alguna página consulta la base durante el build (prerender estático), el build va a
  fallar contra la URL falsa. Contale a Ignacio qué página es: casi siempre se resuelve
  haciéndola dinámica.
- Si `npm run lint` existe y pasa limpio, sumalo. Si tiene muchos errores viejos, dejalo
  afuera y anotalo en el backlog.

### 2.5 Tests de la plata (pocos, a propósito)

Hoy la verificación es tipos + build + mirar la pantalla. Eso no detecta un cálculo mal
hecho. Sumá **entre 3 y 5 tests** sobre el flujo donde un error cuesta guaraníes:
**pedido de compra → aprobado → pagado → gasto creado en Ejecución**, y los totales del
presupuesto.

- Vitest como dev-dependency. Es una librería nueva justificada: no hay ninguna de tests.
- Solo funciones puras, sin base de datos. Si la lógica está mezclada con Prisma adentro
  de una ruta, extraé la parte de cálculo o de cambio de estado a una función y testeá
  esa. No refactorices de más.
- El objetivo no es la cobertura: es que el flujo de plata no se rompa sin que nadie se
  entere.

**Cierre de la Fase 2:** esta es la primera fase que entra por PR. El PR mismo sirve para
probar el flujo entero: rama, CI, preview contra la base `preview` (verificación de la
Fase 1) y merge cuando Ignacio lo pide.

---

## Fase 3 — Partir el CLAUDE.md

**El problema:** un solo archivo de 7.5 KB mezcla el modo loop, el entorno, el catálogo
de librerías y las reglas. Se carga entero en cada sesión, aunque la tarea sea un botón.
Y las reglas casi nunca dicen por qué existen, así que no sirven para decidir los casos
que no cubren.

**La estructura nueva:**

```
CLAUDE.md                     ← corto: con quién trabajás, reglas con su porqué, índice
worker/CLAUDE.md              ← Memby (se carga solo cuando trabajás en worker/)
docs/entorno.md               ← cómo correr la app, producción, Vercel, Neon, previews
docs/interfaz.md              ← diseño "Plano técnico" + catálogo de librerías
docs/decisiones.md            ← decisiones de producto de Ignacio (Fase 4)
docs/sesiones/backlog.md      ← pendientes (Fase 4)
.claude/skills/sesion/        ← el modo loop (Fase 4)
```

Mové el texto existente **tal cual** a su archivo nuevo, sin reescribirlo: el contenido
es bueno, lo que estaba mal es dónde vivía.

### 3.1 `CLAUDE.md` nuevo (borrador, adaptalo a lo que encuentres)

```markdown
# ObrasFlow — instrucciones para Claude

Sistema de gestión de obras de una constructora de Paraguay (Next.js 14 App Router +
Prisma + Postgres) con un asistente de WhatsApp, **Memby** (Baileys + Claude).

## Con quién trabajás

Ignacio, el dueño, no es programador: dirige, prueba y decide; el código lo escribís
vos. Hablale en español de Paraguay, con voseo, claro y sin jerga; si usás un término
técnico, explicalo en pocas palabras. Cerrá cada respuesta con "Qué necesito de vos" y
"Próximos pasos recomendados".

## Dónde está cada cosa (leé el que corresponda antes de tocar esa parte)

- Correr la app, entornos, producción y previews → `docs/entorno.md`
- Memby / conector de WhatsApp → `worker/CLAUDE.md`
- Interfaz: diseño y librerías permitidas → `docs/interfaz.md`
- Decisiones de producto ya tomadas → `docs/decisiones.md`
- Pendientes e ideas → `docs/sesiones/backlog.md`
- Sesión en loop → `/sesion`

## Cómo entra un cambio a producción

1. Rama nueva desde `main`. Nunca commits ni push directo a `main`.
2. Commits en la rama, en español, chicos; el mensaje dice por qué.
3. Push y PR (`gh pr create --base main`): qué cambió y qué tiene que probar Ignacio.
4. CI en verde.
5. Ignacio prueba en el preview de Vercel.
6. Merge (`gh pr merge <n> --merge --delete-branch`) solo cuando Ignacio lo pide en la
   conversación. Avisar que está listo no es permiso para mergear.

Por qué: `main` se despliega solo a producción, e Ignacio no puede leer el código para
darse cuenta de que algo se rompió. El preview es el único lugar donde él puede probar
sin riesgo, y el PR deja escrito qué entró.

## Reglas

- **Cambios de esquema, solo aditivos**: agregar tablas o columnas opcionales; nunca
  renombrar ni borrar en un solo paso. Por qué: el deploy corre `prisma db push` contra
  la base de producción. Sin `--accept-data-loss`, un cambio destructivo hace fallar el
  deploy. Nunca vuelvas a agregar ese flag.
- **Nunca pidas ni escribas secretos en el chat** (tokens, claves, URL de la base). Van
  en `.env.local` (ignorado por git) o en la pantalla local. Por qué: lo que se escribe
  en el chat queda guardado en el historial.
- **No toques datos reales de producción para probar.** Memby escribe en producción desde
  la PC: antes de probar cambios en `worker/`, seguí `worker/CLAUDE.md`.
- **Antes de agregar una librería, mirá `docs/interfaz.md`**: casi siempre hay una que
  ya lo resuelve. Por qué: cada librería nueva es un patrón más que Ignacio y los
  usuarios tienen que reaprender.
- **Cuando Ignacio toma una decisión de producto, anotala en `docs/decisiones.md`** en
  el mismo turno.
- Toda regla nueva que agregues a este archivo lleva su "Por qué": qué pasó o qué se
  evita. Si no lo sabés, preguntale a Ignacio antes de escribirla.
```

### 3.2 `worker/CLAUDE.md`

Mové acá, tal cual, del CLAUDE.md actual: "Memby registra en producción", "Memby
(conector, `worker/`)" y "Compras". Agregá dos secciones:

- **Restricciones del conector**: sin `$transaction` ni SQL crudo, con su porqué.
  Abrí `lib/memby/remote-prisma.ts` y escribí la razón real (lo esperable es que cada
  consulta viaje por HTTP a `/api/memby/db`, y una transacción no puede atravesar
  varios pedidos HTTP; confirmalo en el código antes de escribirlo).
- **Probar sin tocar producción**: revisá en `lib/prisma.ts` cómo se elige entre el
  cliente remoto y el local. Si el conector puede correr contra la base local (por
  ejemplo, sin `MEMBY_REMOTE_URL`), escribí exactamente cómo arrancarlo así y que **toda
  prueba de cambios en `worker/` se hace de ese modo**. Si hoy no se puede, no lo
  inventes: anotalo en el backlog como pendiente prioritario y explicale el riesgo a
  Ignacio.

### 3.3 `docs/entorno.md`

Mové acá la sección "Entorno" sin lo de Memby: modo local, `npm run local` y
`local:prod`, arranque con Windows y producción en Vercel + Neon. Agregá:
- La base `preview` de Neon (Fase 1) y cuándo hacerle *Reset from parent*.
- El flujo rama → PR → preview → merge.
- Qué corre el CI y qué no.

### 3.4 `docs/interfaz.md`

Mové acá "Interfaz" y el catálogo de librerías. En la Fase 5 se suma cómo quedaron
`@coreui/icons`, TanStack Table y Plotly.

**Verificación:** el CLAUDE.md nuevo pesa menos de un tercio del actual, y cada línea
del viejo tiene un lugar nuevo o una razón para haberse borrado.

---

## Fase 4 — El loop como skill, con backlog y decisiones

### 4.1 Por qué cambia

- **De command a skill:** la skill puede llevar archivos de apoyo (la plantilla del
  backlog) y deja de ocupar lugar en el CLAUDE.md cuando no hay loop.
- **"Siempre 4 × 4" genera relleno.** Cuando una dimensión no tiene cuatro opciones
  buenas, la forma fija obliga a inventarlas, y eso choca con la regla de "nada de
  opciones vagas".
- **El radar en cada ronda es caro** y desde la segunda ronda encuentra casi lo mismo.
- **Las decisiones de la pregunta de producto se pierden.** Dos semanas después, Claude
  le vuelve a proponer a Ignacio algo que él ya descartó.

### 4.2 Crear `.claude/skills/sesion/SKILL.md`

```markdown
---
name: sesion
description: Sesión de trabajo en loop con rondas amplias (radar, preguntas, ejecución en una rama, resumen) hasta que Ignacio diga "terminar". Usala cuando Ignacio escribe /sesion o pide trabajar "en loop".
argument-hint: "[tema opcional, ej. proveedores]"
---

Sesión de trabajo en loop sobre ObrasFlow. Tema pedido: $ARGUMENTS

Ignacio quiere que **cada ronda abarque mucho**: varias áreas, varias mejoras, preguntas
que abran decisiones reales. Nada de rondas de una sola cosa.

## Arranque (una vez por sesión)

1. Leé `docs/sesiones/backlog.md`; si no existe, crealo con `plantilla-backlog.md` (en
   esta carpeta). Leé `docs/decisiones.md`; si no existe, crealo con
   `plantilla-decisiones.md`.
2. Mirá `git status` y `gh pr list`. Si quedó un PR abierto de otra sesión, lo primero
   es preguntarle a Ignacio si lo probó y si se mergea, o si se sigue sobre esa rama.
3. **Radar**: un subagente de búsqueda revisa la app de punta a punta (errores,
   inconsistencias, pantallas lentas o feas, datos que faltan, oportunidades). Si hay
   tema, el radar se concentra ahí. En las rondas siguientes no se repite: solo se
   revisa lo que cambió.

## Cada ronda

### 1. Preguntas (AskUserQuestion, **hasta 4**)

- **Paquete principal** (selección múltiple): paquetes de 3 a 6 mejoras, con nombre y
  la lista de lo que incluye.
- **Segundo frente** (selección múltiple): otra pantalla o módulo para avanzar en
  paralelo.
- **Calidad / profundidad** (selección múltiple): visual, velocidad, celular, datos y
  reportes, seguridad, pruebas automáticas, accesibilidad.
- **Decisión de producto**: solo si hay una decisión real con consecuencias.

Reglas: la recomendada va primera, con "(Recomendado)"; cada opción dice QUÉ cambia,
DÓNDE y QUÉ gana Ignacio; nada de opciones vagas; `preview` con un boceto ASCII cuando
la decisión es visual; no preguntes lo que se deduce del código ni lo que ya está en
`docs/decisiones.md`. **Si una dimensión no tiene opciones buenas, poné menos opciones o
sacá la pregunta: una opción de relleno es peor que una pregunta menos.**

Cuando Ignacio responde la decisión de producto, anotala en `docs/decisiones.md` antes
de seguir, con lo que eligió **y lo que descartó**.

### 2. Ejecución

- Rama `ronda/AAAA-MM-DD-<tema>` desde `main` actualizado. Si el PR de la ronda anterior
  todavía no se mergeó, seguí en esa rama.
- Implementá todo lo elegido; usá subagentes en paralelo para los frentes independientes.
  Los arreglos chicos y seguros del radar entran en la misma rama y se informan.
- Un commit por área. Verificá tipos, build, pantalla y celular.

### 3. Cierre de la ronda

- Push, y PR nuevo o actualizado. Esperá el CI.
- **Resumen corto**: qué quedó hecho (por paquete), qué probaste vos, y **qué tiene que
  probar Ignacio en el link del preview**.
- Backlog al día: lo hecho en la ronda, las ideas nuevas del radar y lo que queda
  esperando a Ignacio.
- Si Ignacio dice "mergeá", mergeás. Si no, la próxima ronda sigue en la misma rama.
- Después, la ronda siguiente.

## Fin

Seguí hasta que Ignacio diga "terminar", "fin de sesión" o "cortamos". Nunca cierres la
sesión por tu cuenta. Al terminar: resumen de la sesión, PRs (mergeados y abiertos, con
qué falta probar), backlog actualizado y próximos pasos recomendados.
```

### 4.3 Plantillas (en la misma carpeta de la skill)

`.claude/skills/sesion/plantilla-backlog.md`:

```markdown
# Backlog

## En curso
<!-- lo elegido en la ronda actual -->

## Esperando a Ignacio
<!-- cosas para probar en un preview o decisiones pendientes -->

## Ideas del radar (sin decidir)
<!-- una línea cada una: qué, dónde, qué gana Ignacio -->

## Hecho
<!-- ### AAAA-MM-DD — ronda N (PR #n): lista corta -->
```

`.claude/skills/sesion/plantilla-decisiones.md`:

```markdown
# Decisiones de producto

Lo que Ignacio ya decidió. Antes de proponer algo, mirá acá: si está descartado, no lo
vuelvas a ofrecer salvo que él lo reabra.

<!--
## AAAA-MM-DD — <tema>
**Decisión:** qué eligió.
**Por qué:** en sus palabras.
**Qué implica en el código:** dónde se nota.
**Descartado:** las opciones que no eligió, para no volver a ofrecerlas.
-->
```

### 4.4 Limpieza

- Borrá `.claude/commands/sesion.md`: si quedan el command y la skill con el mismo
  nombre, chocan.
- Sacá del CLAUDE.md la sección "Modo de trabajo: sesión en loop" (en la Fase 3 ya
  debería haber salido).

**Verificación:** en una sesión nueva, `/sesion` arranca la skill, crea el backlog y las
decisiones si faltan, y la primera ronda trabaja en una rama.

---

## Fase 5 — El agente UX y las librerías que lo contradicen

### 5.1 Resolver el conflicto en el código, no solo en el prompt

El agente recomienda `@coreui/icons`, TanStack Table y Plotly; el CLAUDE.md dice "íconos
SOLO Phosphor" y "tablas largas: DataTables". Las cuatro están instaladas.

- Buscá dónde se usa cada una (`@coreui/icons`, `@tanstack/react-table`, `plotly`,
  `react-plotly.js`).
- **Si no se usa en ningún lado:** desinstalala en una rama, con su PR.
- **Si se usa:** mostrale a Ignacio en qué pantallas y recomendá una opción: migrar a lo
  estándar si son pocos lugares, o declararla permitida en `docs/interfaz.md` si son
  muchos. Anotá la decisión en `docs/decisiones.md`.

Mientras queden instaladas sin estar documentadas, cualquier Claude las va a encontrar y
las va a usar.

### 5.2 Recortar `.claude/agents/experto-ux-frontend.md`

- **`<contexto_del_proyecto>`:** dejá el párrafo sobre quién usa ObrasFlow y borrá el
  stack y las librerías. En su lugar: *"Antes de proponer o escribir código de interfaz,
  leé `docs/interfaz.md` (dirección visual y librerías permitidas) y `CLAUDE.md`. Si algo
  de este archivo los contradice, mandan ellos."* Así hay una sola fuente de verdad y el
  agente no se desactualiza.
- **`<principios_de_diseno>`:** una línea por principio, sin biografía. Ejemplo:
  *"Ley de Hick: menos opciones visibles y buenos valores por defecto."* Mantené el orden
  de prioridad para cuando chocan.
- **No toques** `<estandares_frontend>`, `<etica>`, `<como_trabajas>` ni
  `<formato_de_respuesta>`: son la parte que más rinde.
- Objetivo: de ~15 KB a ~5 KB, sin perder ninguna regla que cambie lo que el agente hace.

### 5.3 No sumar agentes nuevos

Lo que parecía faltar ya queda cubierto con este plan:
- Agente de Memby → `worker/CLAUDE.md`, que se carga solo.
- Verificador → el CI de la Fase 2.
- Revisor antes del push → `/code-review` (viene en los plugins `engineering`). Corrélo
  sobre el PR antes de pedirle a Ignacio que pruebe, cuando el cambio toca plata, permisos
  o el esquema de la base.
- Backend/Prisma → las reglas del CLAUDE.md y de `docs/entorno.md`.

---

## Fase 6 — Para más adelante (opcional, con OK explícito de Ignacio)

- **Pasar de `prisma db push` a migraciones versionadas** (`prisma migrate deploy`). Deja
  cada cambio de esquema escrito y revisable en el PR. Requiere un *baseline* contra
  producción: generar `prisma/migrations/0_init` desde el schema y marcarlo como aplicado
  con `prisma migrate resolve --applied 0_init`. Antes, confirmá con
  `prisma migrate diff` que producción y `schema.prisma` coinciden. Los flags cambiaron
  entre versiones de Prisma: mirá `npx prisma --version` y la documentación de esa
  versión. Ese paso escribe en la base de producción: lo corre Ignacio o se corre con su
  OK.
- **Autenticar el MCP de Vercel** (`/mcp` → vercel): permite ver los deploys y los logs
  sin abrir el panel. Para GitHub alcanza con `gh`.
- **Memoria persistente:** guardá ahí cómo le gusta trabajar a Ignacio (preferencias,
  correcciones que te hizo), cada una con su porqué. Las decisiones de producto van en
  `docs/decisiones.md`, que queda en el repo y se versiona.

---

## Checklist final

- [ ] Fase 0: sin `--accept-data-loss`; `.claude/settings.json` con `deny`; hooks livianos; `launch.json` corregido
- [ ] Fase 1: `DATABASE_URL` de Preview apunta a la branch `preview` de Neon (verificado en el log de un build)
- [ ] Fase 2: `gh` funcionando; push a `main` bloqueado; CI corriendo en PRs; 3 a 5 tests del flujo de plata
- [ ] Fase 3: CLAUDE.md corto + `worker/CLAUDE.md` + `docs/entorno.md` + `docs/interfaz.md`
- [ ] Fase 4: skill `sesion` con plantillas; command viejo borrado; backlog y decisiones creados
- [ ] Fase 5: librerías en conflicto resueltas; agente UX recortado y apuntando a `docs/interfaz.md`
- [ ] Este archivo movido a `docs/historial/`
