---
description: Arranca una sesión de trabajo en loop con preguntas de opción múltiple hasta que el dueño diga "terminar"
argument-hint: "[tema opcional, ej. 'módulo de proveedores']"
---

Arrancá una **sesión de trabajo en loop** sobre ObrasFlow, siguiendo la sección
"Modo de trabajo: sesión en loop" de CLAUDE.md.

Tema pedido: $ARGUMENTS

1. Si no hay tema, empezá con una ronda de preguntas de opción múltiple para
   elegir en qué trabajar (módulos, mejoras, errores, el agente de WhatsApp…),
   con selección múltiple cuando corresponda.
2. En cada ronda: implementá lo elegido, verificá (tipos, build, pantalla) y
   mostrá el resultado. Después hacé la próxima ronda de preguntas (1 a 4
   preguntas, 2 a 4 opciones, la recomendada primero).
3. Seguí así hasta que el dueño diga "terminar". Ahí resumí la sesión: qué se
   hizo, commits y próximos pasos.
