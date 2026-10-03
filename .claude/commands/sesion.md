---
description: Arranca una sesión de trabajo en loop con rondas amplias (radar + 4 preguntas de 4 opciones) hasta que el dueño diga "terminar"
argument-hint: "[tema opcional, ej. módulo de proveedores]"
---

Arrancá una **sesión de trabajo en loop** sobre ObrasFlow siguiendo la sección
"Modo de trabajo: sesión en loop con rondas amplias" de CLAUDE.md.

Tema pedido: $ARGUMENTS

1. Leé `docs/sesiones/backlog.md` y lanzá un subagente de búsqueda que haga el
   **radar** de toda la app (errores, inconsistencias, lentitud, oportunidades).
2. Primera ronda: 4 preguntas × 4 opciones (paquete principal, segundo frente,
   calidad/profundidad, decisión de producto), con paquetes concretos de 3 a 6
   mejoras cada uno y la recomendada primero. Si hay tema, los paquetes giran
   alrededor de ese tema.
3. En cada ronda: implementá todo lo elegido (subagentes en paralelo para
   frentes independientes), verificá tipos, build y pantalla (también en
   celular), commit por área, resumen corto y la próxima ronda.
4. Seguí hasta que el dueño diga "terminar". Ahí resumí la sesión: qué se
   hizo, commits y próximos pasos, y actualizá el backlog.
