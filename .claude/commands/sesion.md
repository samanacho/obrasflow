---
description: Arranca una sesión de trabajo en loop con rondas amplias (radar + 4 preguntas de 4 opciones) hasta que el dueño diga "terminar"
argument-hint: "[tema opcional, ej. módulo de proveedores]"
---

Arrancá una **sesión de trabajo en loop** sobre ObrasFlow siguiendo el modo de
trabajo de abajo.

Tema pedido: $ARGUMENTS

1. Leé `docs/sesiones/backlog.md` y lanzá un subagente de búsqueda que haga el
   **radar** de toda la app (errores, inconsistencias, lentitud, oportunidades).
2. Primera ronda: 4 preguntas × 4 opciones (paquete principal, segundo frente,
   calidad/profundidad, decisión de producto), con paquetes concretos de 3 a 6
   mejoras cada uno y la recomendada primero. Si hay tema, los paquetes giran
   alrededor de ese tema.
3. En cada ronda: implementá todo lo elegido (subagentes en paralelo para
   frentes independientes) en una rama con su PR (ver "Cómo entra un cambio a
   producción" en CLAUDE.md), verificá tipos, build y pantalla (también en
   celular), commit por área, resumen corto y la próxima ronda.
4. Seguí hasta que el dueño diga "terminar". Ahí resumí la sesión: qué se
   hizo, PRs y próximos pasos, y actualizá el backlog.

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
la sesión, commits y próximos pasos recomendados.
