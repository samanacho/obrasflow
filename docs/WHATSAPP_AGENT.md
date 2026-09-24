# Agente de WhatsApp de ObrasFlow

Asistente de operaciones por WhatsApp: consulta obras, presupuestos y gastos en
tiempo real, lee fotos/PDF de comprobantes, y prepara registros de plata
(gastos de obra, ingresos/egresos generales, capturas de Registro rápido) que
**solo se guardan cuando el usuario toca "Confirmar"**.

## Cómo funciona

```
WhatsApp ──► Meta (WhatsApp Cloud API) ──► POST /api/whatsapp/webhook
                                              │ 1. verifica la firma de Meta (X-Hub-Signature-256)
                                              │ 2. responde 200 al instante (waitUntil)
                                              ▼
                                    lib/whatsapp/handle.ts
   ¿número autorizado? ── no ──► se ignora en silencio
   ¿mensaje repetido?  ── sí ──► se descarta (waMessageId único)
   ¿botón Confirmar/Cancelar? ─► se resuelve en código, sin IA
                                 (un Confirmar con más de 10 min de atraso no se ejecuta)
   texto/foto ─► espera su turno: un mensaje por número a la vez, en orden (WhatsAppLock)
   "sí"/"no" suelto después de una tarjeta ─► "tocá el botón" (un "sí" escrito NUNCA registra)
   foto/PDF ─► se descarga (imagen ≤ 3,7 MB, PDF ≤ 4 MB y ≤ 20 páginas) y se guarda como InboundMedia
                                              ▼
                              lib/agent/run.ts — Claude + herramientas
          consultas: buscar_obras, ver_obra, ver_sitio, resumen_general,
                     listar_movimientos, buscar_proveedores, ver_comprobante, ...
          propuestas: proponer_movimiento_obra / _general / registro_rapido
                      └─► validan todo contra la base y crean una
                          WhatsAppPendingAction (NO escriben movimientos)
                                              ▼
              respuesta en WhatsApp + resumen con botones ✅ Confirmar / ❌ Cancelar
                                              ▼
              Confirmar ─► lib/agent/actions.ts executePendingAction
                           (transición atómica: un doble toque nunca registra dos veces)
```

Garantías de precisión:

- **El modelo de IA no puede escribir movimientos.** Solo tiene herramientas de
  lectura y de *propuesta*. El registro real lo dispara **solo el botón
  Confirmar** de la tarjeta: un "sí" escrito puede estar contestando otra cosa
  ("¿no será repetido?", una pregunta anterior), así que nunca confirma.
- Cada propuesta se valida en el servidor: la obra existe, el proveedor existe
  y aplica a ese tipo de insumo, monto entero > 0, fecha real, medio de pago y
  estado válidos, un ingreso general tiene responsable (con el nombre completo
  ya cargado: "hugo" → "Hugo Rotela"; si es ambiguo, pregunta). Un rubro que ya
  existe se guarda con su nombre exacto, para no partir el grupo en la ficha.
- Avisos automáticos arriba del resumen (nunca se recortan): **posible
  duplicado** (mismo monto ±3 días en la misma obra / mismo tipo, o una captura
  de Registro rápido sin clasificar), fecha futura o de hace más de 2 meses,
  monto muy alto, rubro o responsable nuevo, obra finalizada, otra propuesta
  pendiente igual.
- **Registro rápido → obra:** si el usuario dice por WhatsApp a qué obra iba una
  captura, el movimiento se vincula a esa captura y al confirmar ambas cosas
  pasan juntas (se crea el movimiento y la captura queda clasificada), así el
  pago no se carga dos veces. Si la captura ya se había clasificado desde la
  app, no se registra nada.
- Una corrección (`reemplazaA`) solo reemplaza propuestas pendientes: si la
  anterior ya quedó registrada, el agente avisa que se corrige desde la app en
  vez de sumar otro movimiento.
- Registrar un movimiento de obra es todo o nada (movimiento + feed de actividad
  + Ejecutado recalculado + captura clasificada, en una sola transacción).
- Si el agente duda (obras con el mismo nombre, dato faltante), pregunta antes
  de proponer.
- Lo escrito dentro de fotos, PDFs o mensajes reenviados se trata como dato,
  nunca como instrucción.
- El reparto de beneficios de **Personal** no se expone por WhatsApp (en la app
  está detrás de un PIN).

Todo lo que registra el agente queda con `Procesado por: WhatsApp · <nombre>`
y, si vino con comprobante, con la foto/PDF adjunta (en la ficha de la obra, o
con un link "Ver" en Movimientos / Registro rápido).

## Puesta en marcha

### 1. Meta (WhatsApp Business Platform)

1. Crear una app en <https://developers.facebook.com> (tipo *Business*) y
   agregarle el producto **WhatsApp**.
2. Registrar el número de WhatsApp Business que va a usar el agente (no puede
   ser un número que ya use la app común de WhatsApp o WhatsApp Business).
3. Crear un **System User** en el Business Manager con permisos
   `whatsapp_business_messaging` y `whatsapp_business_management`, y generar un
   **token permanente** (el token temporal de la consola vence en 24 h).
4. Anotar: *Phone Number ID*, el token, y el **App Secret** (Configuración de
   la app → Básica).
5. En WhatsApp → Configuración → Webhook:
   - URL de callback: `https://obrasflow-app.vercel.app/api/whatsapp/webhook`
   - Token de verificación: el mismo valor que pongas en `WHATSAPP_VERIFY_TOKEN`.
   - Suscribirse al campo **messages**.
   - (Las variables de Vercel del paso 2 tienen que estar cargadas y desplegadas
     antes de guardar el webhook: Meta lo verifica en ese momento.)

### 2. Vercel — variables de entorno (Production)

| Variable | Qué es |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Cualquier texto largo inventado; el mismo que en Meta. |
| `WHATSAPP_APP_SECRET` | App Secret de la app de Meta (firma los webhooks). |
| `WHATSAPP_ACCESS_TOKEN` | Token permanente del System User. |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID del número del agente. |
| `WHATSAPP_ALLOWED_NUMBERS` | Quiénes pueden hablarle, con su nombre: `595981111111:Ignacio Samaniego,595982222222:Hugo Rotela` (con código de país; `+`, espacios, `00` o el `0` de larga distancia se limpian solos). |
| `ANTHROPIC_API_KEY` | Clave de la API de Claude (<https://console.anthropic.com>). |
| `WHATSAPP_GRAPH_VERSION` | Opcional. Versión de la Graph API (default `v23.0`). |
| `ANTHROPIC_MODEL` | Opcional. Default `claude-opus-5`. |
| `ANTHROPIC_EFFORT` | Opcional. `low` / `medium` (default) / `high`. |
| `APP_BASE_URL` | Opcional. Para los links que manda el agente (por defecto usa el dominio de producción de Vercel). |

Después de cargarlas: **Redeploy** para que tomen efecto. Sin estas variables
el webhook responde 503 y no procesa nada.

### 3. Probar

1. Desde un número autorizado, escribirle al número del agente:
   *"¿cuánto llevamos gastado en Congreso?"*
2. Probar una carga: *"le transferí 500 mil a San Blas para el pedestal de la
   estación de M.I.C."* → el agente puede preguntar lo que falte → llega un
   resumen con botones → **Confirmar** → aparece en la ficha de la obra.
3. Mandar la foto de un comprobante de transferencia con un texto como
   *"esto es de la obra de Congreso"*.

Los logs quedan en Vercel → Project → Logs (buscar "WhatsApp").

Si el bot no le contesta a una persona autorizada y en los logs aparece
*"mensaje sin número de teléfono (solo BSUID)"*: esa persona tiene activado el
**nombre de usuario** de WhatsApp y Meta no está mandando su número. Mandale un
primer mensaje desde el número del negocio (por ejemplo la plantilla
`hello_world` desde WhatsApp Manager); desde ahí Meta la guarda en la libreta
de contactos del negocio y siempre manda su número. No desactivar la "Contact
Book" en Meta Business Suite.

## Costos (orientativos)

- **WhatsApp:** las conversaciones que inicia el usuario ("service") no tienen
  costo de Meta dentro de la ventana de 24 h; este agente solo responde, nunca
  inicia conversaciones.
- **Claude:** cada mensaje es una o más llamadas a la API (más si usa varias
  herramientas o lee una foto). `ANTHROPIC_EFFORT=low` baja costo y demora; el
  prompt de sistema se cachea entre mensajes y, dentro de un mismo mensaje, las
  vueltas con herramientas releen la foto/PDF de caché. PDFs de más de 20
  páginas se rechazan antes de llamar a la IA.

## Limitaciones conocidas / próximos pasos

- **Notas de voz:** todavía no se transcriben (el agente pide que se escriba).
- **Tiempo por mensaje:** la función de Vercel vive 60 s. Si se juntan varios
  mensajes seguidos, cada uno espera su turno; si no alcanza el tiempo, el
  agente pide que se repita el último.
- **Mensajes retenidos:** si WhatsApp entrega mensajes con más de 15 minutos de
  atraso (por ejemplo, después de una caída del webhook), no se procesan uno
  por uno: el agente manda un solo aviso para que se repita lo pendiente.
- **Identificación de quién editó / permisos por usuario:** hoy la lista de
  números autorizados es fija por variable de entorno; queda para cuando el
  sistema tenga usuarios y niveles de permiso.
- **Proveedor alternativo (Evolution API / Baileys):** no se usa porque no es la
  API oficial (riesgo de bloqueo del número por los términos de WhatsApp) y
  necesita un servidor encendido todo el tiempo, que no encaja con Vercel. Si
  alguna vez hace falta, solo hay que reescribir `lib/whatsapp/parse.ts` y
  `lib/whatsapp/client.ts`.

## Mapa de archivos

| Archivo | Rol |
|---|---|
| `app/api/whatsapp/webhook/route.ts` | Webhook (verificación GET + mensajes POST). |
| `lib/whatsapp/config.ts` | Variables de entorno y números autorizados. |
| `lib/whatsapp/signature.ts` | Verificación de la firma de Meta. |
| `lib/whatsapp/parse.ts` | Payload de Meta → mensajes internos. |
| `lib/whatsapp/client.ts` | Envío de texto/botones, descarga de archivos. |
| `lib/whatsapp/confirm.ts` | Reconocimiento de "sí"/"no" y de los botones. |
| `lib/whatsapp/lock.ts` | Un turno por número a la vez. |
| `lib/whatsapp/handle.ts` | Orquesta cada mensaje entrante. |
| `lib/agent/prompt.ts` | Prompt de sistema. |
| `lib/agent/tools.ts` | Herramientas que ve el modelo. |
| `lib/agent/queries.ts` | Consultas de solo lectura. |
| `lib/agent/actions.ts` | Propuestas, validación y ejecución confirmada. |
| `lib/agent/run.ts` | Turno del agente (Claude + tool runner). |
| `app/api/inbound-media/[id]` | Ver un comprobante recibido. |
| `prisma/schema.prisma` | `WhatsAppMessage`, `InboundMedia`, `WhatsAppPendingAction`, `WhatsAppLock`. |
