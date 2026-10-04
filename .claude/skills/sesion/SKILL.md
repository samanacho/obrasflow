---
name: sesion
description: Sesión de trabajo en loop con rondas amplias (radar, preguntas, ejecución en una rama con PR, resumen) hasta que Ignacio diga "terminar". Usala cuando Ignacio escribe /sesion o pide trabajar "en loop".
argument-hint: "[tema opcional, ej. proveedores]"
---

Sesión de trabajo en loop sobre ObrasFlow. Tema pedido: $ARGUMENTS

Ignacio quiere que **cada ronda abarque mucho**: varias áreas, varias mejoras,
preguntas que abran decisiones reales. Nada de rondas de una sola cosa.

## Arranque (una vez por sesión)

1. Leé `docs/sesiones/backlog.md`; si no existe, crealo con
   `plantilla-backlog.md` (en esta carpeta). Leé `docs/decisiones.md`; si no
   existe, crealo con `plantilla-decisiones.md`.
2. Mirá `git status` y `gh pr list`. Si quedó un PR abierto de otra sesión, lo
   primero es preguntarle a Ignacio si lo probó y si se mergea, o si se sigue
   sobre esa rama.
3. **Radar**: un subagente de búsqueda revisa la app de punta a punta (errores,
   inconsistencias, pantallas lentas o feas, datos que faltan, oportunidades).
   Si hay tema, el radar se concentra ahí. En las rondas siguientes no se
   repite entero: solo se revisa lo que cambió.

## Cada ronda

### 1. Preguntas (AskUserQuestion, **hasta 4**)

- **Paquete principal** (selección múltiple): paquetes de 3 a 6 mejoras, con
  nombre y la lista de lo que incluye.
- **Segundo frente** (selección múltiple): otra pantalla o módulo para avanzar
  en paralelo.
- **Calidad / profundidad** (selección múltiple): visual, velocidad, celular,
  datos y reportes, seguridad, pruebas automáticas, accesibilidad.
- **Decisión de producto**: solo si hay una decisión real con consecuencias.

Reglas: la recomendada va primera, con "(Recomendado)"; cada opción dice QUÉ
cambia, DÓNDE y QUÉ gana Ignacio; nada de opciones vagas; `preview` con un
boceto ASCII cuando la decisión es visual; no preguntes lo que se deduce del
código ni lo que ya está en `docs/decisiones.md`. **Si una dimensión no tiene
opciones buenas, poné menos opciones o sacá la pregunta: una opción de relleno
es peor que una pregunta menos.**

Cuando Ignacio responde la decisión de producto, anotala en
`docs/decisiones.md` antes de seguir, con lo que eligió **y lo que descartó**.

### 2. Ejecución

- Rama `ronda/AAAA-MM-DD-<tema>` desde `main` actualizado. Si el PR de la
  ronda anterior todavía no se mergeó, seguí en esa rama.
- Implementá todo lo elegido; usá subagentes en paralelo para los frentes
  independientes. Los arreglos chicos y seguros del radar entran en la misma
  rama y se informan.
- Un commit por área. Verificá tipos, tests, build, pantalla y celular.

### 3. Cierre de la ronda

- Push, y PR nuevo o actualizado. Esperá el CI.
- **Resumen corto**: qué quedó hecho (por paquete), qué probaste vos, y **qué
  tiene que probar Ignacio en el link del preview**.
- Backlog al día: lo hecho en la ronda, las ideas nuevas del radar y lo que
  queda esperando a Ignacio.
- Si Ignacio dice "mergeá", mergeás. Si no, la próxima ronda sigue en la misma
  rama.
- Después, la ronda siguiente.

## Fin

Seguí hasta que Ignacio diga "terminar", "fin de sesión" o "cortamos". Nunca
cierres la sesión por tu cuenta. Al terminar: resumen de la sesión, PRs
(mergeados y abiertos, con qué falta probar), backlog actualizado y próximos
pasos recomendados.
