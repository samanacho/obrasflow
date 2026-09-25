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

## Conexión por QR (Baileys) — modo por defecto

El agente se conecta a una cuenta de WhatsApp (por ejemplo la de WhatsApp
Business del número del agente) como **dispositivo vinculado**, igual que
WhatsApp Web, con la librería [Baileys](https://github.com/WhiskeySockets/Baileys).
Es gratis (sin cobro por mensaje de Meta) y la app del teléfono sigue
funcionando. Todo se maneja desde la pantalla **Agente WhatsApp**
(`/agente-whatsapp`): estado de la conexión, QR para vincular y pasos.

- **Conector** (`worker/whatsapp-baileys.mts`, `npm run wa:conector`): tiene
  que correr en una PC o servidor **siempre encendido** (Vercel no puede
  mantener la conexión abierta). Lee `.env.local`: base de datos de producción
  (`POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`), `ANTHROPIC_API_KEY`,
  `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT`, `WHATSAPP_ALLOWED_NUMBERS` y
  `APP_BASE_URL`. Guarda la sesión vinculada en `.baileys-auth/` (ignorada por
  git; es una credencial) y el estado/QR en la tabla `WhatsAppSession`.
- **Pantalla**: muestra si el conector está corriendo (latido cada 15 s), el
  QR (solo con `WHATSAPP_PANEL_KEY`, cargada en Vercel) y permite reiniciar o
  desvincular.
- **Confirmación**: sin botones, cada propuesta trae un código: `OK 4821`
  registra esa propuesta y `NO 4821` la descarta. Un "sí" suelto nunca
  registra nada.
- **Riesgo**: no es la API oficial; WhatsApp puede bloquear cuentas que la usan
  de forma automatizada. El agente solo responde a los números autorizados y
  nunca inicia conversaciones. Si hiciera falta, la API oficial de Meta sigue
  disponible (`WHATSAPP_PROVIDER=cloud`, guía más abajo).

## Puesta en marcha (API oficial de Meta, alternativa)

**La forma más fácil: el módulo "Agente WhatsApp" de la app** (`/agente-whatsapp`,
en el menú de la izquierda). Muestra cada paso con su estado (se marca solo
cuando el sistema detecta que quedó bien), genera el verify token y el PIN,
tiene las URLs listas para copiar y, con la clave del panel (el verify token,
o `WHATSAPP_PANEL_KEY` si se carga en Vercel), hace el diagnóstico en vivo
contra Meta y Claude, muestra la actividad y permite suscribir la app,
registrar el número, probar la IA y mandar un mensaje de prueba a un número
autorizado. Nunca muestra el valor de un secreto.

Todo se hace con herramientas **oficiales y gratuitas** de Meta (App Dashboard,
WhatsApp Manager, Graph API Explorer) y con el script del repo
`npm run wa -- <comando>` (`scripts/whatsapp-setup.mjs`, sin dependencias):
`secretos` genera el verify token y el PIN, `revisar` chequea todo y dice qué
falta, `numeros`, `registrar`, `suscribir` y `probar-envio` hacen cada paso con
la Graph API. Los comandos que cambian algo en Meta piden `--si`.

Guardá en un gestor de contraseñas: verify token, PIN de 6 dígitos, App Secret,
token del System User y clave de Anthropic. **Nunca** en el repo ni en un chat.
El script lee sus variables de `.env.local` (git lo ignora).

### 0. Antes de empezar

- **El número:** tiene que ser una línea móvil (recomendado) que reciba SMS y
  llamadas, incluso internacionales, porque de ahí llega el código de Meta.
  **No** puede ser el WhatsApp personal de uno de los dueños (ellos le escriben
  al agente desde sus números). La línea tiene que seguir activa (con saldo)
  para no perder el número.
- **Si ese número ya tiene WhatsApp** (común o Business): hay que **borrar esa
  cuenta** desde el teléfono (Ajustes > Cuenta > Eliminar mi cuenta) y esperar
  unos 3 minutos. Es irreversible: se pierden chats, grupos y backup (exportá lo
  que sirva antes). Usar la app y la API a la vez con el mismo número
  ("coexistencia") solo se puede a través de un proveedor pago o siendo Tech
  Provider de Meta: no lo recomendamos. Si la cuenta se sigue usando,
  conseguí una SIM nueva para el agente. **No borres nada todavía**: primero se
  prueba todo con el número de prueba de Meta (pasos 1–5).
- **Business portfolio:** usá el portfolio definitivo de la empresa en
  <https://business.facebook.com>. Un número borrado de una cuenta de la
  plataforma no se puede reutilizar en otra.
- **Que no dependa de una sola persona:** activá la verificación en dos pasos
  en las cuentas de Facebook de los dos dueños y sumá al segundo como
  administrador del business portfolio, de la app de Meta (App roles) y de la
  organización de Claude. Si la cuenta de uno se bloquea, el otro mantiene el
  control del número.
- **No activar "Vercel Authentication"** (Deployment Protection) sobre el
  dominio de producción sin excluir `/api/whatsapp/webhook`, `/privacidad` y
  `/terminos`: Meta dejaría de llegar al webhook.

### 1. Claude (Anthropic)

1. En <https://platform.claude.com> creá la organización con un mail de la
   empresa y un **workspace** propio para el agente (el workspace "Default" no
   admite límites de gasto).
2. **Settings > API keys > Create key** en ese workspace. Para producción
   conviene una key de *service account* (una key personal deja de funcionar si
   esa persona sale de la organización).
3. **Billing:** la API es prepaga. Cargá crédito, activá **Auto-reload** (por
   ejemplo, recargar US$20 cuando el saldo baje de US$10) y fijá un **spend
   limit** mensual en el workspace como techo. Si el saldo o el límite se
   agotan, el agente contesta "está en pausa, avisale al administrador".

### 2. Meta: app, número de prueba y token permanente

1. <https://developers.facebook.com/apps> > **Create app** > caso de uso
   **"Connect with customers through WhatsApp"** > elegí el business portfolio.
2. En **WhatsApp > API Setup** Meta crea un **número de prueba** y una WABA de
   prueba. Anotá el *Phone Number ID* y el *WhatsApp Business Account ID* de
   prueba. El **App Secret** está en App settings > Basic.
3. En el campo **"To"** agregá los celulares de los 2 dueños como destinatarios
   de prueba: a cada uno le llega un código por WhatsApp que hay que cargar en
   el panel (tengan el celular a mano).
4. **Token permanente** (no uses el temporal de API Setup: vence en pocas horas
   y a mitad de una prueba parece una falla):
   <https://business.facebook.com/latest/settings> > Users > **System users** >
   Add, rol **Admin** (así ve también la WABA del número real que se crea
   después) > **Assign assets**: la app y la WABA, con control total >
   **Generate token** con la app, vencimiento **Nunca** y los permisos
   `business_management`, `whatsapp_business_management` y
   `whatsapp_business_messaging`.

### 3. Pasar la app a Live

App settings > **Basic**: nombre, correo de contacto, **Privacy Policy URL**
`https://obrasflow-app.vercel.app/privacidad`, **Terms of Service URL**
`https://obrasflow-app.vercel.app/terminos`, instrucciones de borrado de datos
`https://obrasflow-app.vercel.app/privacidad#borrado-de-datos`, ícono y
categoría. Después **App Mode: Live**. Como la app solo usa la WABA propia, no
pasa por App Review. Se hace antes de probar porque, en modo desarrollo, Meta
puede no mandar algunos webhooks.

### 4. Vercel: variables (apuntando al número de prueba)

Vercel > Project > Settings > Environment Variables (Production), después
**Redeploy** del último deployment:

| Variable | Qué es |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | El que generó `npm run wa -- secretos`; el mismo que en Meta. |
| `WHATSAPP_APP_SECRET` | App Secret de la app de Meta (firma los webhooks). |
| `WHATSAPP_ACCESS_TOKEN` | Token permanente del System User (paso 2.4). |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID (primero el de prueba; después el del número real). |
| `WHATSAPP_ALLOWED_NUMBERS` | Quiénes pueden hablarle, con su nombre: `595981111111:Ignacio Samaniego,595982222222:Hugo Rotela` (con código de país; `+`, espacios, `00` o el `0` de larga distancia se limpian solos). |
| `ANTHROPIC_API_KEY` | Clave de la API de Claude. |
| `ANTHROPIC_MODEL` | Recomendado dejarlo explícito. Default `claude-sonnet-5` (el más barato que cumple). Para máxima precisión: `claude-opus-5-5` (confirmá antes en platform.claude.com que esté disponible para la organización). |
| `ANTHROPIC_EFFORT` | Opcional. `low` / `medium` (default) / `high`. |
| `WHATSAPP_GRAPH_VERSION` | Opcional. Default `v25.0` (soportada hasta el 29/07/2028). |
| `APP_BASE_URL` | Opcional. Para los links que manda el agente (por defecto, el dominio de producción de Vercel). |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Opcional. Correo de contacto que muestran /privacidad y /terminos. |
| `WHATSAPP_PANEL_KEY` | Opcional. Clave del módulo Agente WhatsApp; si no está, se usa el verify token. |

Para verificar el webhook en Meta alcanza con `WHATSAPP_VERIFY_TOKEN`; sin las
demás, los mensajes responden 503 y no se procesan.

### 5. Webhook y prueba con el número de prueba

1. App Dashboard > **WhatsApp > Configuration > Webhook**: Callback URL
   `https://obrasflow-app.vercel.app/api/whatsapp/webhook`, el verify token,
   **Verify and save**, y suscribí los campos **messages** y
   **account_update** (este último solo queda en los logs).
2. Copiá las mismas variables a `.env.local` en tu compu y corré
   `npm run wa -- revisar`. Tiene que dar ✅ en webhook, firma, token, número y
   suscripción. Si la app no está suscripta a la WABA: `npm run wa -- suscribir --si`.
3. Un dueño le escribe al número de prueba: una consulta, una carga (tocando
   **Confirmar**) y una foto de comprobante.

### 6. Número real

1. Liberá la SIM si tenía WhatsApp (paso 0).
2. **WhatsApp Manager > Phone numbers > Add phone number** (o API Setup > Add
   phone number): nombre visible (el de la empresa o marca, coherente con su
   web o redes; no genérico ni con "oficial"), categoría y verificación por
   **SMS** (o **llamada** si el SMS no llega). Mientras Meta revisa el nombre,
   el número funciona con capacidad "LIMITED": no hace falta esperar la
   aprobación para registrarlo.
3. **Tarjeta:** cargá una tarjeta de crédito Visa o Mastercard en la cuenta de
   ese número (WhatsApp Manager > Configuración de pago) **antes del primer
   mensaje real**. Desde el 01/10/2026 las respuestas se cobran pasado el cupo
   gratis mensual, y sin tarjeta Meta puede dejar de entregarlas. Dentro del
   cupo no genera cargos.
4. `npm run wa -- numeros` muestra el nuevo `WHATSAPP_PHONE_NUMBER_ID`:
   cargalo en `.env.local`.
5. **Registrar** (obligatorio: agregar el número en el panel NO lo registra):
   `npm run wa -- registrar --pin <PIN de 6 dígitos> --si`. Meta permite **10
   intentos cada 72 h**; el script nunca reintenta solo. El PIN queda como
   verificación en dos pasos: guardalo (se necesita para mover o borrar el
   número).
6. `npm run wa -- suscribir --si` si `revisar` dice que la app no está suscripta
   a la WABA real.
7. Vercel: `WHATSAPP_PHONE_NUMBER_ID` = el real, **Redeploy**, y
   `npm run wa -- revisar` con todo en ✅.
8. Un dueño le escribe "hola" al número real (el agente nunca inicia la
   conversación) y repite las pruebas del paso 5.

### 7. Operación

- Logs: Vercel > Project > Logs, buscando "WhatsApp". Ahí aparecen el consumo
  de la IA por mensaje, las respuestas que Meta no pudo entregar (con su causa)
  y los mensajes que llegan a otro número. En el plan Hobby se guardan 1 hora.
- `npm run wa -- revisar` cuando algo no funcione.
- Una vez por mes: consumo en platform.claude.com > Usage, mensajes en
  WhatsApp Manager > Estadísticas, y el **tamaño de la base** en Vercel >
  Storage (cada foto o PDF de comprobante se guarda en la base; en un plan
  gratuito de Postgres el espacio es limitado).
- Caídas de Meta: <https://metastatus.com/whatsapp-business-api>.
- No desactivar la "contact book" del portfolio (Meta Business Suite > Business
  settings > Business info): hace que los dueños lleguen siempre con su número
  aunque activen un nombre de usuario de WhatsApp.

### Si algo falla

| Síntoma / código | Qué hacer |
|---|---|
| Webhook 503 | Falta `WHATSAPP_VERIFY_TOKEN` (o las demás variables) en Vercel, o falta el Redeploy. |
| "firma inválida" en los logs / 401 | `WHATSAPP_APP_SECRET` no es el de App settings > Basic. |
| No llega nada | `npm run wa -- revisar`: app suscripta a la WABA, URL del webhook, campo messages, app en Live, `WHATSAPP_PHONE_NUMBER_ID` correcto (los logs avisan si llegan mensajes para otro número). |
| 190 | El token venció: usar el del System User (vencimiento Nunca). |
| 10 / 200 | Al token le faltan permisos o la WABA no está asignada al System User. |
| 133010 | El número no está registrado: `registrar`. |
| 133005 | PIN incorrecto. |
| 133016 | Demasiados intentos de registro: esperar 72 h, no reintentar. |
| 131042 | Problema con el medio de pago en Meta. |
| 131047 | Pasaron más de 24 h desde el último mensaje de esa persona. |
| "mensaje sin número de teléfono (solo BSUID)" | Esa persona tiene nombre de usuario de WhatsApp y Meta no manda su número; suele resolverse solo cuando interactúa con el número del negocio. No mandarle plantillas (se cobran). |
| "la cuenta de la IA se quedó sin saldo" | Cargar crédito o subir el spend limit en platform.claude.com. |

## Costos (septiembre 2026)

- **Meta / WhatsApp:** la plataforma, el número y los webhooks no tienen cargo
  fijo, y los mensajes que los dueños le mandan al agente son gratis. Las
  **respuestas** del agente son gratis hasta el 30/09/2026; **desde el
  01/10/2026 Meta las cobra por mensaje** a la tarifa de Paraguay ("Rest of
  Latin America", ~US$0,0113 por mensaje), con un **cupo gratis de 1.000
  mensajes por mes por número** según la página de precios de Meta (actualizada
  el 10/09/2026). Con 2 usuarios lo normal es quedar dentro del cupo. Para
  gastar menos, cuando hay una propuesta la frase del agente va dentro de la
  misma tarjeta (un solo mensaje).
- **Claude (Anthropic):** no es gratis; es prepago por uso. Estimación para
  600–1.200 mensajes al mes (±50% hasta medir el consumo real, que queda en los
  logs): **Sonnet 5 ~US$17–51/mes** (default), Opus 5.5 ~US$31–97/mes. Las
  cuentas nuevas reciben un crédito inicial chico para probar.
- **Vercel:** el plan Hobby (gratis) es solo para uso personal no comercial; para
  una herramienta de empresa corresponde Pro (US$20/mes).
- **Impuestos:** en Paraguay, los pagos con tarjeta a servicios digitales del
  exterior (Anthropic, Vercel, Meta) llevan percepción de IVA (10%) y pueden
  tener recargo bancario por moneda extranjera. Consultá con el contador si ese
  IVA es crédito fiscal.

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
| `app/agente-whatsapp`, `app/api/whatsapp/panel`, `lib/whatsapp/setup.ts` | Módulo de configuración y diagnóstico dentro de la app. |
| `worker/whatsapp-baileys.mts`, `lib/whatsapp/transport.ts`, `app/api/whatsapp/session` | Conexión por QR (Baileys): conector, canal y estado para la pantalla. |
| `scripts/whatsapp-setup.mjs` | Configuración y diagnóstico del número (`npm run wa`). |
| `app/privacidad`, `app/terminos` | Páginas públicas que pide Meta para pasar la app a Live. |
| `lib/whatsapp/handle.ts` | Orquesta cada mensaje entrante. |
| `lib/agent/prompt.ts` | Prompt de sistema. |
| `lib/agent/tools.ts` | Herramientas que ve el modelo. |
| `lib/agent/queries.ts` | Consultas de solo lectura. |
| `lib/agent/actions.ts` | Propuestas, validación y ejecución confirmada. |
| `lib/agent/run.ts` | Turno del agente (Claude + tool runner). |
| `app/api/inbound-media/[id]` | Ver un comprobante recibido. |
| `prisma/schema.prisma` | `WhatsAppMessage`, `InboundMedia`, `WhatsAppPendingAction`, `WhatsAppLock`. |
