# Handoff — Residente de Obra (para la integración con ObrasFlow)

> Para el equipo de ObrasFlow y su asistente. Responde las 7 preguntas de
> `docs/IDEA_INTEGRACION_APP_RESIDENTES.md` y explica cómo está construida la
> app. Fecha: 2026-10-03.

## 0. Para el asistente que planifique con este documento

No tenés acceso al código de Residente de Obra. Leé este documento con estas
reglas:

- **Lo que existe hoy:** las secciones 1 a 4 y la sección 5 hasta la tabla
  "Lo que falta construir".
- **Lo que es propuesta y no existe:** la tabla de la sección 5, las
  respuestas 2, 3 y 7 de la sección 6, y toda la sección 7. **No hay ningún
  endpoint `/api/v1`, ninguna clave de API ni ningún webhook.** Los nombres de
  rutas y eventos son tentativos.
- **Lo que no está decidido:** quién es dueño de qué dato, cuál es la fuente
  de verdad de cada entidad y el modelo comercial (preguntas 5 y 6).
- Si tu plan depende de algo de las dos últimas categorías, marcalo como
  **dependencia externa** y no lo des por resuelto. Las preguntas que
  necesites hacernos van como lista al final del plan.
- El plan de ObrasFlow tiene que poder avanzar sin nuestra API: modelo de
  datos propio, emparejamiento de obras por `codigo` y un receptor de webhooks
  que se pueda probar con datos simulados.

## 1. Qué es

**Residente de Obra** es una app web *mobile-first* para el residente de obra:
la persona que está todos los días en la obra y hoy registra todo en papel,
WhatsApp y Excel. Está en piloto con constructoras reales.

Dos cosas guían todas las decisiones:

- **Funciona sin señal.** Se instala como app (PWA), abre en modo avión, guarda
  todo en el celular y sincroniza cuando vuelve la conexión.
- **Es multi-empresa desde la base.** Cada constructora (*tenant*) está aislada
  por Row Level Security en Postgres, no solo por filtros en el código.

El reparto que propone el documento de ObrasFlow coincide con cómo la
pensamos: **nosotros cubrimos el trabajo en la obra y ObrasFlow la gestión de
la empresa.**

## 2. Funciones (lo que ya está construido)

| Módulo | Qué hace |
| --- | --- |
| **Parte diario** | Personal, clima, trabajo del día, dotación de subcontratistas, avance por ítem. Una vez cerrado, el parte queda bloqueado. |
| **Dictado y notas de voz** | Se dicta en lugar de tipear. La nota de voz se adjunta al parte. |
| **Fotos** | Se comprimen en el celular y se suben en cola. Llevan un sello con la obra, la fecha y la ubicación (barrio, ciudad), y la IA las etiqueta para buscarlas en lenguaje natural ("columnas del 2º piso"). |
| **Cronograma** | Se importa desde el Excel de la oferta, con un mapeo de columnas que se recuerda por constructora. Tiene plan semanal y sectores. |
| **Padrón de elementos** | Los elementos físicos por ítem (columnas, losas, casetones…), para declarar el avance contándolos. |
| **Avance** | Lo planificado contra lo declarado, curva S y tablero. |
| **Contratos y certificados** | Contratos con ítems, ajustes, retenciones y fiscalización. El certificado de avance por período se exporta en PDF, Excel, acta y resumen. |
| **Informe semanal** | Resumen ejecutivo que redacta la IA con los datos de la semana. Lo genera un cron los viernes. |
| **Libro de obra** | Notas de pedido y órdenes numeradas, con fecha del servidor y firma. Las entradas no se editan: se corrigen con otra entrada. |
| **Agenda** | Hitos que salen del cronograma, eventos cargados a mano y rotura de probetas por hormigonado. |
| **Clima diario** | Clima por obra y por día (Open-Meteo), como respaldo para pedir ampliación de plazo por lluvia. |
| **Archivo de la obra** | Carpetas, documentos con revisiones y versiones (planos, pliego, estudios), comentarios y @menciones con aviso por mail. |
| **Consultas al pliego** | Preguntas en lenguaje natural sobre el pliego. La respuesta cita el pasaje y la página. |
| **Resumen diario por mail** | Eventos del día, vencimientos y obras que quedaron sin parte. |
| **Auditoría** | Un trigger en la base registra qué cambió, en qué fila, quién y cuándo. |

## 3. Cómo está construida

| Capa | Tecnología |
| --- | --- |
| Frontend y backend | Next.js 16 (App Router) con React 19 y TypeScript estricto, Tailwind y shadcn/ui |
| Base de datos | Postgres en Neon, con schema y migraciones en Drizzle ORM |
| Aislamiento | RLS sobre `tenant_id` en cada tabla. La app se conecta con un rol sin `BYPASSRLS` |
| Login | Clerk. La constructora del usuario viaja en un claim del token de sesión (`tenantId`) |
| Offline | IndexedDB (Dexie) como fuente de verdad del cliente, una cola *outbox* y un service worker |
| Archivos | Vercel Blob, con un store **privado por constructora** |
| IA | Claude (Anthropic) para etiquetar fotos, redactar el informe y responder consultas al pliego |
| Mails | Resend |
| Hosting y tareas programadas | Vercel, con crons para el resumen diario (cada hora), el clima (cada hora) y el informe (viernes) |

### Tres decisiones que importan para integrar

1. **Los ids los genera el cliente** (UUID). Todas las escrituras son *upserts*
   idempotentes por id, así que reintentar el mismo envío no duplica nada. Es
   justo lo que necesita una sincronización con otro sistema.
2. **El servidor nunca acepta `tenant_id` ni el autor desde el cuerpo del
   pedido.** Los saca de la sesión verificada. Si un sistema externo escribe,
   el tenant tiene que salir de su credencial y no del JSON que manda.
3. **Cada ítem de un lote recibe su propia respuesta.** El endpoint de
   sincronización aplica cada ítem en un savepoint y contesta cuáles pasaron y
   cuáles no. Una API pública puede seguir el mismo contrato.

## 4. Modelo de datos (lo principal)

```
tenant (constructora)
 ├─ miembro                (personas de la constructora)
 └─ obra                   (codigo único por constructora, nombre, fecha_inicio, dirección)
     ├─ item_cronograma ─┬─ elemento_padron
     │                   └─ avance  ←── parte_diario (uno por obra y día)
     ├─ sector, plan_semana
     ├─ parte_diario ─┬─ dotacion_subcontratista
     │                ├─ foto
     │                └─ nota_de_voz
     ├─ clima_diario, evento
     ├─ contrato ─ contrato_item / ajuste / retencion / fiscalizacion
     │     └─ certificado ─ certificado_linea
     ├─ informe, libro_entrada
     ├─ carpeta ─ documento ─ documento_revision ─ documento_version
     │                         └─ archivo_comentario ─ archivo_mencion
     └─ pliego_texto ─ consulta_pliego
auditoria (todas las tablas auditadas)
```

Hay unas 36 tablas y 38 migraciones. Todas tienen `id uuid` y `tenant_id`.
**`obra.codigo` es único dentro de cada constructora**, y es la clave natural
para emparejar una obra nuestra con una de ObrasFlow.

## 5. Estado de la integración

**Hoy no hay una API pública.** Todos los endpoints (`/api/partes`,
`/api/fotos`, `/api/outbox`, `/api/certificado/...`) los usa la propia app y
se autentican con la sesión de Clerk de una persona. No hay claves de API para
otros sistemas ni webhooks de salida.

La arquitectura ya trae lo difícil de una integración: ids estables,
escrituras idempotentes, el tenant resuelto en el servidor, aislamiento por
RLS y auditoría. **Lo que falta construir es la puerta:**

| Pieza | Qué es |
| --- | --- |
| Credenciales de máquina | Una clave de API por constructora, guardada como hash y revocable, que resuelve el `tenant_id` igual que hoy lo resuelve la sesión |
| API versionada `/api/v1/...` | De lectura primero: obras, partes, avance, fotos (por URL firmada) y certificados |
| Webhooks de salida | Eventos como `parte.cerrado`, `foto.subida`, `certificado.emitido` y `libro.entrada`, firmados con HMAC y con reintentos |
| Mapeo de ids | Una columna `id_externo` donde haga falta, o emparejar por `obra.codigo` |
| Contrato documentado | OpenAPI de la v1 |

## 6. Respuestas a las 7 preguntas

1. **Funciones.** Las de la sección 2. Con ObrasFlow se superponen
   seguramente en partes diarios, avance, fotos, asistencia (nuestra dotación
   de subcontratistas) e incidentes (nuestro libro de obra y los eventos de la
   agenda). **Pedidos de material no está construido** del lado nuestro.
2. **Forma de conexión.** Proponemos **las dos cosas: una API REST para
   consultar y webhooks para avisar.** ObrasFlow se suscribe a eventos (por
   ejemplo, "se cerró el parte del día") y trae el detalle por la API. Hoy no
   existe ninguna de las dos (ver sección 5).
3. **Autenticación.** Para los usuarios, Clerk. Para ObrasFlow, una clave de
   API por constructora, que se envía como `Authorization: Bearer`. La
   constructora sale de la clave, nunca del pedido. Los webhooks llegan
   firmados con HMAC. Si más adelante hace falta que cada empresa conecte su
   propia cuenta, se puede evaluar OAuth.
4. **Modelo de datos.** Ver sección 4. Para la prueba se usan `obra` (que se
   empareja por `codigo`) y `parte_diario`.
5. **Propiedad de los datos.** Técnicamente, los datos de cada constructora
   están separados por RLS, y sus fotos y archivos viven en un store propio
   que se puede entregar o borrar entero. Qué es de quién, quién es la fuente
   de verdad de cada entidad y qué pasa si se corta la integración **lo tienen
   que acordar Matias y el equipo con ustedes**. Nuestra propuesta inicial: la
   obra se da de alta en ObrasFlow (es gestión), y lo que se registra en la
   obra nace en Residente de Obra y se replica de ahí para afuera.
6. **Modelo comercial.** **Todavía no está definido.** Lo deciden Matias y el
   equipo.
7. **Entorno de pruebas.** Sí se puede armar. Neon permite crear una *branch*
   de la base aislada, cargarle datos de demo (`pnpm db:seed-demo`) y
   desplegarla en un *preview* de Vercel con su propia URL. Para la prueba les
   damos una constructora de demo y su clave de API.

## 7. Propuesta para la prueba chica

Es la que propone su documento, **obras y partes diarios de una sola obra**,
en un solo sentido:

1. Ustedes nos pasan el `codigo` de una obra de ObrasFlow, y la damos de alta
   con ese mismo código en una constructora de demo.
2. Nosotros construimos la clave de API, `GET /api/v1/obras`,
   `GET /api/v1/obras/{codigo}/partes?desde=AAAA-MM-DD` y el webhook
   `parte.cerrado`.
3. ObrasFlow recibe el webhook, pide el parte y lo guarda.
4. Si anda, se agregan fotos, avance y certificados, y recién después se
   evalúa escribir en el otro sentido.

## 8. Qué necesitamos de ObrasFlow

- Cómo modelan una obra (qué identificador usan) y un parte o registro diario.
- Si pueden recibir webhooks (una URL pública con HTTPS) o prefieren consultar
  la API cada cierto tiempo.
- Stack y lenguaje, para darles un ejemplo de cliente que les sirva.
- Qué funciones de ObrasFlow ya cubren algo de la sección 2, para no duplicar
  trabajo.
