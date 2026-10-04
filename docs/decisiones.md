# Decisiones de producto

Lo que Ignacio ya decidió. Antes de proponer algo, mirá acá: si está
descartado, no lo vuelvas a ofrecer salvo que él lo reabra.

<!--
## AAAA-MM-DD — <tema>
**Decisión:** qué eligió.
**Por qué:** en sus palabras.
**Qué implica en el código:** dónde se nota.
**Descartado:** las opciones que no eligió, para no volver a ofrecerlas.
-->

## 2026-10-04 — Un gasto "Pendiente" no suma al Ejecutado
**Decisión:** un movimiento de Ejecución en estado "Pendiente" no suma (ni resta) al Ejecutado hasta que figure como pagado ("Pagado" o "Conciliado"), y se ve resaltado. Los gastos que estaban en "Pendiente" al entrar el cambio pasaron todos a "Pagado" (migración única en el deploy), así el Ejecutado no se movió. Los gastos nuevos no tienen estado por defecto: hay que elegir Pagado o Pendiente.
**Por qué:** "el gasto pendiente no suma al ejecutado hasta figurar como pagado y debe estar resaltado". Muchos gastos viejos quedaron "Pendiente" solo porque era el estado por defecto.
**Qué implica en el código:** `cuentaEnEjecutado()` en `lib/movimientos.ts` (servidor, pantallas y Memby usan la misma regla); `scripts/migraciones/aplicar.mjs` (marca en la tabla `DataMigration`); sin `defaultStatus` en `change_order`.
**Descartado:** revisar los viejos uno por uno; dejarlos pendientes (bajaba el Ejecutado de golpe); "Pagado" o "Pendiente" por defecto en los nuevos.

## 2026-10-04 — Pedido de compra aprobado y editado: vuelve a pendiente
**Decisión:** si se editan cantidades, materiales u obra de un pedido ya aprobado, vuelve a "pendiente" y hay que aprobarlo de nuevo (nueva tarjeta Sí/No; el grupo se entera de que no compren todavía). Notas, fecha y proveedor no lo devuelven a pendiente.
**Por qué:** lo aprobado tiene que ser lo que se compra.
**Descartado:** seguir aprobado después de editarlo.

## 2026-10-04 — Personal: solo ciertos usuarios
**Decisión:** la pantalla Personal (reparto de beneficios) la ven solo los usuarios indicados en `PERSONAL_USUARIOS` (Vercel); si no está, solo el primer usuario creado. Lo controla el servidor con el usuario de ingreso; para los demás la pantalla no existe ni aparece en el menú. Sin PIN.
**Por qué:** el PIN estaba escrito en el código de la página y cualquiera podía leerlo.
**Descartado:** PIN controlado por el servidor; sacar la protección.

## 2026-10-04 — Volver a importar un presupuesto: la app pregunta cada coincidencia
**Decisión:** al importar una planilla en una obra que ya tiene presupuesto, la app compara con lo cargado y pregunta antes de guardar: si un ítem coincide (por código o, si no hay, por descripción) y cambió, se elige entre actualizarlo, agregarlo aparte o no cargarlo; si coincide con varios, hay que elegir cuál; los que ya no están en la planilla se conservan salvo que se marquen para borrar (los que tienen pedidos no se borran). Lo idéntico no se pregunta.
**Por qué:** "quiero que el sistema me haga las consultas necesarias para sacarse la duda de cómo debe registrarlo", usando la misma lógica para todos los casos.
**Qué implica en el código:** `lib/compras/reimportar.ts` (comparación y plan), `components/project/BudgetImportModal.tsx` (paso "revisar"), `POST /api/projects/[id]/presupuesto` con `{ agregar, actualizar, borrar }`.
**Descartado:** actualizar solo sin preguntar; saltear y avisar; bloquear el reemplazo si hay pedidos; la casilla "Reemplazar el presupuesto actual" (que duplicaba los ítems con pedidos).

## 2026-10-04 — Íconos: un solo estilo (Phosphor)
**Decisión:** todos los íconos de la app pasan a Phosphor (`components/ui/Icon.tsx`); se desinstala `@coreui/icons`.
**Por qué:** convivían dos estilos (Phosphor en 19 archivos, CoreUI en 15, incluido el inicio) y la app se veía despareja.
**Qué implica en el código:** ningún `CIcon` ni `cil...`; íconos nuevos solo con `<Icon icon={...} />`.
**Descartado:** permitir CoreUI donde ya estaba; pasar solo el inicio.

## 2026-10-04 — Tabla de obras del inicio: queda con TanStack
**Decisión:** la tabla de obras del inicio (`components/home/ProjectsTable.tsx`) sigue con TanStack Table y queda documentada como excepción en `docs/interfaz.md`.
**Por qué:** funciona, es una sola y es la pantalla principal: rehacerla tiene riesgo y poca ganancia.
**Qué implica en el código:** tablas nuevas, con `components/ui/DataTable.tsx`; no sumar otras con TanStack.
**Descartado:** pasarla a DataTables.

## 2026-10-04 — Proyectos de Vercel abandonados
**Decisión:** queda un solo proyecto, `obrasflow-app`. `obrasflow2` (nunca funcionó) se borró; `obrasflow` (un deploy fallido del 24/08) se borra.
**Por qué:** ensuciaban cada deploy con errores falsos.
**Descartado:** conservarlos desconectados.
