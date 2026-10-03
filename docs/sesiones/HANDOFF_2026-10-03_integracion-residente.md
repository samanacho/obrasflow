# Resumen para continuar — Integración con Residente de Obra (2026-10-03)

> Para retomar en una sesión nueva de Claude Code (VS Code). Pegá esto como
> primer mensaje: "Leé docs/sesiones/HANDOFF_2026-10-03_integracion-residente.md
> y seguimos desde ahí."

## Contexto en 4 líneas

- Un amigo (Matias) tiene una empresa de software que hace **Residente de Obra**:
  una app para el residente de obra (parte diario, fotos, avance, cronograma,
  certificados, libro de obra…). Funciona sin señal y separa los datos de cada empresa.
- Idea: **usar su app para el trabajo en obra y conectarla con ObrasFlow**
  (que queda para la gestión de la empresa).
- Ellos **todavía no tienen API pública, ni claves, ni webhooks**. Lo propusieron.
- Prueba acordada: **partes diarios de una sola obra, en un solo sentido**
  (su app → ObrasFlow), emparejando la obra por un código.

## Documentos (todos en `docs/`, ya commiteados)

| Archivo | Qué tiene |
| --- | --- |
| `IDEA_INTEGRACION_APP_RESIDENTES.md` | La idea, la charla grabada (pedidos de compra por WhatsApp), las respuestas resumidas y la lista de pasos |
| `HANDOFF_RESIDENTE_DE_OBRA.md` | El documento que mandó el equipo de ellos (qué existe y qué es propuesta) |
| `RESPUESTA_HANDOFF_RESIDENTE_DE_OBRA.md` | Nuestra respuesta: modelo de datos, stack, superposición de módulos, **formato del webhook** y plan por semanas. **Pendiente de enviar** |
| `transcripciones/2026-10-03-grabacion-35.txt` | Transcripción de la charla |

## Decisiones del dueño (Ignacio)

1. Se manda la respuesta al equipo de Residente de Obra.
2. Reparto: **parte diario, fotos de avance, cronograma, hitos y documentos
   vienen de Residente de Obra**; no se construyen en ObrasFlow.
   **Compras / control de gastos y certificados** quedan en ObrasFlow (ellos no hacen pedidos de material).
3. Se construye nuestra parte de la integración sin esperarlos (hecho, ver abajo).
4. Sin decidir (lo hablan Ignacio y Matias): dueño de los datos, cuál sistema manda en cada dato y el modelo comercial.

## Lo que se construyó (probado en local, SIN commit ni deploy)

| Pieza | Dónde |
| --- | --- |
| `Project.code` (único, opcional) + campo "Código de obra" en el formulario | `prisma/schema.prisma`, `lib/validate.ts`, `lib/types.ts`, `lib/serialize.ts`, `components/NewProjectWizard.tsx` |
| `ProjectItem.externalSource/externalId` (índice único: no duplica) | `prisma/schema.prisma`, `lib/items.ts` |
| Modelo `IntegrationEvent` (guarda cada aviso, deduplica, deja pendientes) | `prisma/schema.prisma` |
| Firma HMAC, formato del evento, cliente de su API (apagado), procesamiento | `lib/integraciones/residente/{signature,types,client,process}.ts` |
| Receptor del webhook | `app/api/integraciones/residente-de-obra/webhook/route.ts` |
| Ver eventos / reprocesar pendientes | `app/api/integraciones/residente-de-obra/eventos/route.ts` (GET / POST) |
| Al cargar un código en una obra se aplican los partes que esperaban | `app/api/projects/route.ts`, `app/api/projects/[id]/route.ts` (también responde 409 si el código ya existe) |
| Partes externos no se editan ni borran | `app/api/items/[itemId]/route.ts` |
| Etiqueta "Residente de Obra" + enlace, sin botones de editar | `app/project/[id]/page.tsx` (`ItemRow`) |
| Origen en el historial ("Residente de Obra") | `lib/history.ts` (`sourceFromData`) |
| Simulador de partes firmados | `scripts/simular-webhook-residente.mjs` |
| Variables documentadas | `.env.example` (`RESIDENTE_WEBHOOK_SECRET`, `RESIDENTE_API_URL`, `RESIDENTE_API_KEY`) |

Pruebas hechas (todas OK): firma falsa → 401; obra sin código → queda
"sin_obra" y se aplica sola al cargar el código; mismo parte dos veces → no
duplica; editar/borrar parte externo → 400; código repetido → 409; la ficha
muestra los partes con etiqueta y enlace. Datos de prueba ya borrados de la base local.

Cómo probar:

```bash
npm run local -- --sin-conector
node --env-file=.env.local scripts/simular-webhook-residente.mjs --obra <CODIGO>
```

(Antes cargale ese código a una obra en su formulario. `.env.local` ya tiene
un `RESIDENTE_WEBHOOK_SECRET` de prueba.)

## ⚠️ Por qué no está commiteado

El repo tiene **muchos cambios pendientes del dueño sin commitear** (historial
de cambios `lib/history.ts`, rediseño, `components/project/`, `server/`,
`scripts/local.mjs`…). La integración se apoya en ellos (ej. `lib/items.ts`
importa `lib/history.ts`, que no está en git). Commitear solo lo nuevo rompe el build.

Notas técnicas:
- `prisma db push` pide `--accept-data-loss` por los índices únicos nuevos
  (columnas nuevas y vacías: no se pierde nada). El build de Vercel ya usa ese flag.
- Subir a `main` = deploy a producción (https://obrasflow-app.vercel.app). **Confirmar con el dueño antes.**

## Pendientes, en orden

1. **Pedirle OK al dueño** y commitear todo lo pendiente en commits por área
   (historial, rediseño, entorno local, integración) → push a `main`.
2. Que el dueño cargue `RESIDENTE_WEBHOOK_SECRET` en Vercel (no pedirlo por el chat).
3. Ponerle código a la obra de la prueba y pasárselo a ellos.
4. Esperar de ellos: cuerpo final del evento, firma, secreto, URL del sandbox.
5. Cuando exista su API: cron de respaldo que consulte `GET /api/v1/obras/{codigo}/partes?desde=`.
6. Después: fotos (por URL firmada) → avance (`Project.progress`) → certificados.
7. **En paralelo (lo más urgente para el dueño): módulo de Compras / control de gastos.**
   Pedido de compra por un grupo de WhatsApp exclusivo leído por Memby (formato
   fijo: "Pedido de compra" + fecha + detalle) → aprobación → pago → factura que
   llega después, cruzado contra el presupuesto por ítem (cantidad y precio).
   Ver la sección de la grabación en `IDEA_INTEGRACION_APP_RESIDENTES.md`.

## Cómo trabajar con el dueño

Leé `CLAUDE.md`: español de Paraguay con voseo, claro y sin jerga; cerrar
siempre con "Qué necesito de vos" y "Próximos pasos recomendados"; confirmar
antes de subir a producción o tocar datos reales; nunca pedir claves por el chat.
