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
