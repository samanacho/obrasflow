# Interfaz: diseño y librerías permitidas

Leelo antes de proponer o escribir código de interfaz. Si algo de un agente
o de otro documento lo contradice, manda este archivo.

- Interfaz: dirección visual "Plano técnico" (tokens en `app/globals.css`:
  paleta cálida apagada, acento azul acero, superficies planas sin sombras,
  cuadrícula de plano solo en la barra superior; contraste AA en claro y oscuro).
  Antes de agregar una librería, revisá si alguna de estas ya lo resuelve:
  - Bootstrap 5 + CoreUI (componentes y estilos). Botón con relleno = acción
    principal de la pantalla; contorno = secundaria.
  - Íconos: SOLO `components/ui/Icon.tsx` con Phosphor
    (`<Icon icon={Buildings} />`, duotono por defecto). Nada de emojis como íconos.
  - Diálogos y avisos: SOLO `lib/ui/alerts.ts` (SweetAlert2): `confirmar`,
    `confirmarAccion` (confirma y ejecuta con "Un momento…" y el error adentro),
    `avisar`, `notificar`. Nada de window.alert/confirm ni modales propios.
  - Selects con buscador: `components/ui/Select2.tsx` (Select2 + tema Bootstrap 5),
    solo en listas largas (obras, proveedores, contratistas, ciudades).
  - Tablas largas: `components/ui/DataTable.tsx` (DataTables 3, sin jQuery, en español).
  - Fotos y comprobantes: `components/ui/ImageViewer.tsx` (visor con zoom).
  - Gráficos y mapas: Chart.js, Leaflet, dhtmlx-gantt.
  - Fechas: Day.js vía `lib/dayjs.ts` (español, hora de Paraguay: `fmtFecha`, `haceCuanto`…).
  - Animate.css está cargado, pero movimiento solo donde informa algo (y
    siempre respetando `prefers-reduced-motion`).
  - jQuery 4: SOLO con `lib/ui/useJQuery.ts` sobre contenedores que React no dibuja
    (plugins). Nunca para modificar elementos de React.

Por qué: cada librería o patrón nuevo es algo más que Ignacio y los usuarios
tienen que reaprender, y una pantalla distinta a las demás parece un error.
