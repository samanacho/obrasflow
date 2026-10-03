# Idea: integrar ObrasFlow con la app de residentes de obra

**Fecha:** 2026-10-03
**Estado:** lluvia de ideas — sin decisiones ni acuerdos (comerciales ni técnicos)

## Contexto

- **ObrasFlow** es la app propia para gestionar la empresa constructora, desarrollada con Claude y en producción en Vercel.
- Un amigo tiene una **empresa de software** que está creando una **app para residentes de obra**, con muchas funciones que pueden servirnos.
- Esa app se está diseñando **bastante abierta**, pensada para conectarse con muchos otros sistemas.

## La idea

Adoptar la app del amigo para el trabajo de los residentes en obra y **conectar ObrasFlow con ella**, en vez de construir todo nosotros.

Posible reparto (a validar):

| Lado | Qué cubriría |
|---|---|
| App de residentes | Trabajo en campo: partes diarios, avance, fotos, pedidos de material, asistencia, incidentes… |
| ObrasFlow | Gestión de la empresa: obras, contratistas, ítems/presupuestos, pagos, facturación, agente de WhatsApp… |
| Integración | Sincronizar obras, ítems, avances y documentos entre ambas |

## Conversación con el amigo — grabación 35 (2026-10-03)

Fuente: audio de unos 6 minutos, transcripto automáticamente. El texto completo está en [transcripciones/2026-10-03-grabacion-35.txt](transcripciones/2026-10-03-grabacion-35.txt) y puede tener errores en nombres propios.

### Situación de la empresa (dicha por el dueño)

- La empresa son **dos personas**: el dueño y la contadora. El dueño hace todo y aprueba todos los pagos.
- Problema real: desde obra piden materiales **con urgencia**, el dueño transfiere a la casa de materiales y **la factura llega después** (o cuando se puede). No hay registro formal del pedido.
- Todavía **no hay certificados de avance**: la empresa recién arranca y está implementando todo.

### Cómo lo resolvieron en la empresa del amigo (GCA)

- No tienen departamento de compras, pero sí **una persona responsable de compras**.
- Crearon un **email exclusivo de compras**. Antes de comprar, el residente manda un mail con un código tipo **"Pedido de compra"** y el detalle de lo que va a comprar; recién después compra.
- Objetivo: tener un **registro limpio de todas las compras**.

### Lo que se acordó para nuestro caso

1. **Canal exclusivo para pedidos de compra.** Puede ser un email o, mejor para el dueño, **WhatsApp** (un grupo dedicado). Tiene que usarse **solo para eso**, para que un bot lo lea sin ruido.
2. **Formato fijo de cada mensaje:** "Pedido de compra" + fecha/hora + descripción de lo que se compra. La discusión de la compra va por chat privado, no en ese canal.
3. **Un bot conectado al canal** (Memby u otro agente dedicado a control de gastos; no hace falta otro número, alcanza con meterlo en el grupo) que registre y recupere los pedidos.
4. **Comparar contra el presupuesto:** con la lista de materiales y el precio de cada ítem cargados, el bot controla **cuánto se compra y a qué precio** contra lo presupuestado, y cuánto se lleva gastado en materiales por ítem.
5. **Mano de obra y certificados:** el mismo módulo debería contemplar los **certificados de avance**, que todavía no existen.

### Qué implica para ObrasFlow

- Nuevo módulo de **Compras / Control de gastos**: pedido de compra → aprobación del dueño → pago → factura que llega después (vinculada al pedido).
- Entrada principal por **grupo de WhatsApp leído por Memby** (el agente de WhatsApp ya existente), con un formato de mensaje estándar.
- Cruce **pedido ↔ ítem de presupuesto** para comparar cantidades y precios reales contra los presupuestados.
- Sumar **certificados de avance** (mano de obra) al alcance.
- Revisar si los pedidos de material los va a cubrir la app de residentes del amigo, para no duplicarlos.

## Respuestas del amigo — handoff (2026-10-03)

La app se llama **Residente de Obra** (PWA offline-first, multi-empresa con RLS, Next.js 16 + Drizzle + Neon + Clerk + Vercel Blob + Claude). Está en piloto con constructoras reales. El documento completo está en [HANDOFF_RESIDENTE_DE_OBRA.md](HANDOFF_RESIDENTE_DE_OBRA.md) y nuestra respuesta en [RESPUESTA_HANDOFF_RESIDENTE_DE_OBRA.md](RESPUESTA_HANDOFF_RESIDENTE_DE_OBRA.md).

| # | Pregunta | Respuesta resumida |
|---|---|---|
| 1 | Funciones | Parte diario, dictado, fotos con IA, cronograma, padrón de elementos, avance (curva S), contratos y **certificados**, informe semanal, libro de obra, agenda, clima, archivo, consultas al pliego, resumen por mail, auditoría. **Pedidos de material no lo construyen.** |
| 2 | Conexión | Proponen API REST + webhooks firmados (HMAC). **Hoy no existe ninguna de las dos.** |
| 3 | Autenticación | Clave de API por constructora (`Authorization: Bearer`); el tenant sale de la clave, nunca del JSON. |
| 4 | Modelo de datos | ~36 tablas con `id uuid` + `tenant_id`. **`obra.codigo` es único por constructora** → clave para emparejar con ObrasFlow. |
| 5 | Propiedad de datos | Técnicamente separados por RLS y Blob privado. Quién es fuente de verdad **no está decidido** (propuesta: la obra nace en ObrasFlow, lo de campo nace en su app). |
| 6 | Modelo comercial | **No definido.** Lo deciden Matias y su equipo con Ignacio. |
| 7 | Sandbox | Sí: branch de Neon + preview de Vercel + constructora de demo con su clave. |

Prueba chica propuesta por ellos (y aceptada): **obras y partes diarios de una sola obra, en un solo sentido** (de su app hacia ObrasFlow). Ellos construyen la clave, `GET /api/v1/obras`, `GET /api/v1/obras/{codigo}/partes?desde=` y el webhook `parte.cerrado`; nosotros el receptor.

## Mientras tanto, en ObrasFlow

- Antes de construir funciones de campo/residente, revisar si las va a cubrir Residente de Obra (ver tabla de superposición en la respuesta al handoff).
- Mantener IDs estables y endpoints limpios para que la integración sea fácil cuando llegue.
- **Compras / control de gastos y certificados** siguen siendo nuestros: ellos no hacen pedidos de material.

## Próximos pasos

- [x] Conseguir documentación de la app de residentes (handoff recibido 2026-10-03).
- [x] Mapear qué módulos se superponen con ObrasFlow (sección 4 de la respuesta).
- [x] Definir un piloto chico: obras y partes diarios de una sola obra, un solo sentido.
- [ ] Enviar la respuesta al equipo de Residente de Obra y acordar cuerpo del evento, firma y secreto.
- [ ] ObrasFlow: agregar `Project.code` (único) y `ProjectItem.externalId/externalSource`.
- [ ] ObrasFlow: receptor de webhook `/api/integraciones/residente-de-obra/webhook` + simulador con datos de prueba.
- [ ] ObrasFlow: pestaña de partes recibidos (solo lectura) en la ficha de obra.
- [ ] Crear el grupo de WhatsApp exclusivo de "Pedidos de compra" y acordar el formato del mensaje con obra.
- [ ] Diseñar el módulo de Compras en ObrasFlow: pedido → aprobación → pago → factura, vinculado a ítems del presupuesto.
- [ ] Cargar presupuestos con lista de materiales y precio por ítem, para poder comparar.
- [ ] Definir cómo se van a manejar los certificados de avance.
