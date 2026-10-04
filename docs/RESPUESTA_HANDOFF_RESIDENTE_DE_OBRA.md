# Respuesta al handoff de Residente de Obra

> Para el equipo de Residente de Obra. Responde la sección 8 de su handoff
> (`HANDOFF_RESIDENTE_DE_OBRA.md`, 2026-10-03) y propone cómo seguimos.
> Fecha: 2026-10-03.

## 0. Cómo leímos su handoff

Lo tomamos como está: **hoy no hay API pública, ni claves, ni webhooks**. Lo
de las secciones 5 (tabla), 6.2, 6.3, 6.7 y 7 lo tratamos como **propuesta**.
Propiedad de datos y modelo comercial quedan como **dependencias externas**
(lo deciden Matias y el equipo con Ignacio). Nuestro plan avanza igual sin su
API: modelo propio, emparejamiento por `codigo` y un receptor de webhooks que
se prueba con datos simulados.

## 1. Cómo modelamos una obra y un registro diario

### Obra → `Project`

| Campo | Tipo | Nota |
| --- | --- | --- |
| `id` | `cuid` (string) | Lo genera el servidor. Estable. |
| `name` | string | Nombre de la obra. |
| `reference` | string, opcional | Referencia corta ("Sucursal Norte", "Lote 3"). **No es único.** |
| `type` / `customType` | enum | Rubro (civil, eléctrico, …). |
| `status` | enum | planificado / en curso / … |
| `manager` | string | Responsable. |
| `city`, `department`, `coordinates` | string | Ubicación. |
| `start`, `end` | date | Plazo. |
| `budget`, `spent`, `progress` | decimal / int | Presupuesto, gastado, avance %. |
| `sitioId` | opcional | Agrupa varios "frentes" de un mismo lugar. |

**Hoy no tenemos un `codigo` único por obra.** Lo vamos a agregar como campo
nuevo (`code`, único, opcional al principio para no romper lo existente) y lo
usamos como clave natural para emparejar con `obra.codigo` de ustedes. Es un
cambio aditivo, que es lo único que permite nuestro despliegue.

### Registro diario → `ProjectItem` con `kind = "daily_log"`

Los módulos secundarios de la obra (parte diario, fotos, hitos, documentos,
partidas de presupuesto, actividad, ledger de movimientos) comparten una tabla
genérica:

```
ProjectItem { id cuid, projectId, kind, title, status, data Json, createdAt, updatedAt }
  └─ Attachment { id, filename, mimeType, size, data bytea }   (hasta 4 MB, en la base)
```

El parte diario (`daily_log`) guarda en `data`: `fecha`, `tipo` (Dato / Aviso /
Alerta / Pendiente / Relevante), `clima`, `personal`, `notas`. Es mucho más
simple que el `parte_diario` de ustedes (no tiene avance por ítem, dotación de
subcontratistas ni notas de voz). Eso es justamente lo que queremos **dejar de
construir nosotros** y traer de Residente de Obra.

Para la integración vamos a agregar a `ProjectItem` una columna `externalId`
(uuid de ustedes) + `externalSource` ("residente-de-obra"), con índice único
sobre la pareja, así los reintentos de un webhook no duplican nada.

## 2. Webhooks o polling

**Podemos recibir webhooks.** ObrasFlow corre en Vercel con URL pública HTTPS
(`https://obrasflow-app.vercel.app`) y ya tenemos un receptor de webhooks
firmados (el de WhatsApp Cloud API, con `x-hub-signature-256` HMAC-SHA256).
Haríamos lo mismo para ustedes:

```
POST https://obrasflow-app.vercel.app/api/integraciones/residente-de-obra/webhook
Headers: X-Signature: sha256=<HMAC del cuerpo>
```

- Verificamos la firma sobre el cuerpo crudo, respondemos 2xx rápido y
  procesamos.
- Para ignorar repetidos usamos el `id` del evento, que viene **dentro del
  cuerpo firmado**. Un header tipo `X-Delivery-Id` no lo usamos: no va
  firmado, así que cualquiera podría inventarlo. Si lo mandan, se ignora.
- Preferimos el patrón que proponen: **el webhook avisa, la API da el detalle**
  (`GET /api/v1/obras/{codigo}/partes?desde=`). Pero si en el cuerpo del
  evento ya viene el parte completo, mejor: nos ahorra una ida y vuelta y
  funciona aunque su API aún no esté.
- Como respaldo, un cron en Vercel puede consultar la API una vez por hora
  para traer lo que se haya perdido.

### Formato que ya acepta nuestro receptor (ya construido y probado)

Firma: `X-Signature: sha256=<hex>` = HMAC-SHA256 del cuerpo crudo con el
secreto compartido. Si el cuerpo trae `parte`, lo guardamos directo; si trae
solo `parte_id`, lo pedimos a su API.

```json
{
  "id": "evento-uuid",
  "event": "parte.cerrado",
  "created_at": "2026-10-03T19:00:00Z",
  "data": {
    "obra": { "codigo": "OF-2026-001" },
    "parte": {
      "id": "parte-uuid",
      "fecha": "2026-10-03",
      "clima": "Soleado, 31 °C",
      "personal": 12,
      "trabajo": "Hormigonado de losa del 2º piso, sector B.",
      "dotacion": [{ "subcontratista": "Electricidad Gómez", "cantidad": 3 }],
      "avance": [{ "item": "Losa 2º piso", "cantidad": 45, "unidad": "m²" }],
      "fotos": 8,
      "url": "https://<su-app>/partes/parte-uuid",
      "cerrado_por": "Nombre del residente"
    }
  }
}
```

Respuestas: `200 {"ok":true,"estado":"procesado"}`; `200` con `"estado":"sin_obra"`
si todavía no tenemos esa obra (lo guardamos y se aplica solo cuando le
cargamos el código); `200 {"duplicado":true}` si ya recibimos ese `id`;
`401` firma inválida; `400` cuerpo inválido. Reenviar el mismo `parte.id`
actualiza el parte, no lo duplica. Los campos que no conozcamos se guardan
igual (el parte crudo queda guardado).

## 3. Stack

| Capa | ObrasFlow |
| --- | --- |
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| Base | Postgres (Neon en producción, Postgres local en desarrollo) con **Prisma 5** |
| Hosting | Vercel; cada push a `main` despliega. El build corre `prisma db push`: los cambios de esquema tienen que ser **aditivos** |
| Archivos | Hoy en la base (bytea, máx. 4 MB). Para fotos de ustedes vamos a guardar la **URL firmada / referencia**, no el binario |
| IA / agente | **Memby**: agente de WhatsApp (Baileys + Claude) que registra gastos, movimientos y pedidos desde el chat |
| Usuarios | Todavía **sin login** (empresa de 2 personas). Guardamos "desde dónde" vino cada cambio, no quién |
| UI | Bootstrap 5 + CoreUI, dirección visual "Plano técnico" |

Un ejemplo de cliente en **TypeScript con `fetch`** (Node 20) nos sirve tal
cual.

## 4. Qué cubre ObrasFlow hoy vs. la sección 2 de ustedes

| Módulo de Residente de Obra | En ObrasFlow | Qué haríamos |
| --- | --- | --- |
| Parte diario | `daily_log` muy básico (fecha, tipo, clima, personal, notas) | **Reemplazar** por el de ustedes; el nuestro queda como espejo de solo lectura |
| Dictado / notas de voz | Memby transcribe notas de voz de WhatsApp (Whisper local), pero para gastos, no para partes | No duplicar |
| Fotos | `photo` (archivo ≤ 4 MB o URL, etapa, fecha, comentario) | **Traer las de ustedes** por URL firmada; dejar de subir fotos de avance en ObrasFlow |
| Cronograma / plan semanal / sectores | `milestone` (hitos sueltos). No hay cronograma real | No construir; leer avance desde ustedes |
| Padrón de elementos | No existe | No construir |
| Avance (plan vs. declarado, curva S) | Solo `Project.progress` (% a mano) | **Alimentar `progress` desde su avance** |
| Contratos y certificados | `Contractor` (directorio global de contratistas con historial) y ledger de pagos en `change_order`. **No hay certificados** | Dependencia: ver sección 6 |
| Informe semanal | No existe | No construir |
| Libro de obra | `ProjectChange` (historial automático de cambios), no es libro de obra | No construir |
| Agenda | `activity` + `milestone` | No construir |
| Clima diario | Campo texto en `daily_log` | No construir |
| Archivo de la obra | `document` (adjunto ≤ 4 MB) | No construir |
| Consultas al pliego | No existe | No construir |
| Resumen diario por mail | Memby manda un resumen diario por WhatsApp a las 19 h | Podríamos incluir en ese resumen "obras sin parte hoy" si ustedes lo exponen |
| Auditoría | `ProjectChange` por obra | — |

**Lo que ObrasFlow sí hace y ustedes no** (y seguimos construyendo nosotros):
obras y sitios, contratistas y proveedores, presupuesto por partidas,
movimientos y pagos (ledger por obra + caja general), registro rápido de pagos,
inventario de herramientas, módulo de postes (producción), reparto de
beneficios, y **Memby** como entrada por WhatsApp. En camino: **módulo de
Compras / control de gastos** (pedido de compra por grupo de WhatsApp →
aprobación → pago → factura, cruzado contra el presupuesto por ítem) — que
ustedes confirmaron que **no construyen** (pedidos de material).

## 5. Qué construimos nosotros para la prueba chica

Sin depender de su API:

1. `Project.code` (único) y `ProjectItem.externalId/externalSource`.
2. Receptor `POST /api/integraciones/residente-de-obra/webhook` con
   verificación HMAC, deduplicación y cola de procesamiento.
3. Un **simulador** (`scripts/simular-webhook-residente.mjs`) que manda eventos
   `parte.cerrado` firmados con datos de prueba, para probar de punta a punta
   antes de que exista su API.
4. Vista de solo lectura en la ficha de obra: pestaña "Parte diario" mostrando
   lo que vino de Residente de Obra (con enlace a su app).
5. Cliente para `GET /api/v1/obras/{codigo}/partes?desde=` que se activa cuando
   ustedes lo tengan (hoy apunta al simulador).

Después: fotos (por URL firmada) → `Project.progress` desde avance →
certificados.

## 6. Lo que necesitamos que decidan ustedes (dependencias externas)

1. **Secreto compartido del webhook**: cómo lo entregan y rotan.
2. **Cuerpo del evento `parte.cerrado`**: ¿solo ids (y vamos a buscar el
   detalle) o el parte completo? Pedimos el completo si es posible.
3. **Fuente de verdad**: aceptamos su propuesta (la obra nace en ObrasFlow;
   lo de campo nace en Residente de Obra). ¿Cómo se crea la obra del lado de
   ustedes: la cargan a mano con nuestro `code`, o nos dan un
   `POST /api/v1/obras` más adelante?
4. **Fotos**: ¿URL firmada con qué vencimiento? ¿Podemos pedir una nueva URL
   por id de foto cuando venza?
5. **Modelo comercial y propiedad de datos**: lo conversan Matias e Ignacio;
   no bloquea la prueba técnica.
6. **Entorno de prueba**: cuando puedan, la URL del preview de Vercel, la
   constructora de demo y su clave.

## 7. Propuesta de orden

| Semana | Residente de Obra | ObrasFlow |
| --- | --- | --- |
| 1 | Definir cuerpo del evento y firma | `Project.code`, `externalId`, receptor + simulador |
| 2 | Clave de API + `GET /api/v1/obras` + `GET …/partes` | Vista de partes en la ficha de obra, cliente de la API |
| 3 | Webhook `parte.cerrado` en preview | Conectar al preview con una obra real de Ignacio |
| 4 | — | Evaluar fotos y avance |
