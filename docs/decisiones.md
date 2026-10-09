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

## 2026-10-09 — Contraseña olvidada: link de contraseña nueva
**Decisión:** cualquier usuario puede, desde Usuarios, crear un link para que otra persona elija una contraseña nueva (mismo usuario, un solo uso, 48 h). Si nadie puede entrar, el script `invitar-usuario.mjs --usuario <usuario>` desde la PC.
**Por qué:** Ignacio se olvidó su usuario y contraseña y no había forma de recuperarlos; la única salida era crear un usuario nuevo.
**Qué implica en el código:** `UserInvitation.userId`; `/api/auth/invitaciones` acepta `{ usuario }`. Sigue sin haber roles: cualquiera con usuario puede restablecer a otro (igual que hoy puede invitar o desactivar).
**Descartado:** no se discutieron alternativas (Ignacio aprobó la propuesta). Se dejaron de lado, sin que él las rechazara: que quien restablece escriba la contraseña del otro (la vería) y recuperación por mail (los usuarios no tienen mail cargado).

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
