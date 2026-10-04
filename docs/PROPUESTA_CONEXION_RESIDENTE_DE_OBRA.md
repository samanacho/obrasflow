# Residente de Obra y ObrasFlow: propuesta de conexión

> Documento que mandó el equipo de Residente de Obra (Rodrigo), 3 de octubre
> de 2026, en respuesta a `RESPUESTA_HANDOFF_RESIDENTE_DE_OBRA.md`. Copiado
> tal cual. Cambia el plan: no hay webhooks por ahora; primero un export por
> obra (CSV o JSON) y, después, un acceso de solo lectura.

Oct 3, 2026 · @Rodrigo

Te proponemos que uses Residente de Obra en tus obras y que puedas llevarte esos datos a ObrasFlow. Empezamos simple: primero un export por obra, y después, si te hace falta, un acceso de solo lectura para que ObrasFlow los traiga solo.

## Cómo funciona

Los datos de obra se cargan en Residente de Obra y viajan en un solo sentido, hacia ObrasFlow. No hace falta tocar nada de ObrasFlow para el primer paso.

1. **Cargás tus obras en Residente de Obra**, con tu propia cuenta de constructora: partes diarios, fotos y avance.
2. **Exportás por obra.** Desde la obra bajás un archivo (CSV o JSON) con los partes y el avance hasta la fecha.
3. **Lo importás en ObrasFlow**, a mano o con un script tuyo.
4. **Opcional, si el paso 3 te queda corto:** te damos un acceso de solo lectura para que ObrasFlow pida los mismos datos solo, sin bajar archivos.

Las obras se emparejan por el código de obra: el `codigo` de nuestra obra tiene que coincidir con el `code` del proyecto en ObrasFlow.

## Qué datos salen

El export y el acceso de solo lectura devuelven lo mismo. Los nombres exactos de los campos los cerramos cuando lo construyamos.

| Dato | Qué trae | A tener en cuenta |
| --- | --- | --- |
| Partes diarios | Fecha, autor, dotación, observaciones y avance por ítem | Hay un parte por obra, día y persona, no uno por día |
| Última modificación | Fecha y hora de la última edición de cada parte | Un parte se puede editar hasta las 06:00 del día siguiente, y uno cargado sin señal puede llegar días después. Si ya lo tenés, quedáte con el más nuevo |
| Avance de la obra | % de la obra, calculado por nosotros | Sale de ponderar los ítems, no de sumar cantidades |
| Fotos | Un link por foto | El link abre la foto dentro de Residente de Obra, con tu usuario |

Cada registro lleva su id nuestro. Conviene guardarlo en ObrasFlow con índice único, así un dato importado dos veces se actualiza en vez de duplicarse.

## Lo que hacemos nosotros

- [ ] Darte de alta como constructora, con tu usuario y tus obras.
- [ ] Construir el export por obra con los datos de la tabla de arriba.
- [ ] Si lo necesitás después de usar el export: el acceso de solo lectura, limitado a tus obras y con una clave que te pasamos por un canal privado.
- [ ] Acompañarte en las primeras semanas de carga y ajustar lo que no te cierre.

## Lo que necesitamos de vos

- [ ] La lista de obras que vas a cargar, con su código y quiénes cargan en cada una.
- [ ] Agregar en ObrasFlow el `code` del proyecto y los campos para guardar nuestro id con índice único.
- [ ] Armar el import en ObrasFlow, a mano o con un script.
- [ ] **Antes de cargar datos reales en ObrasFlow, ponerle login.** Hoy cualquiera con la URL podría ver los partes y las fotos de tus obras.
- [ ] Si usamos el acceso de solo lectura, guardar la clave solo del lado del servidor, nunca en el navegador ni en el repo.
- [ ] Contarnos qué te falta o te sobra en los datos a medida que los uses.

## Lo que queda afuera y cuándo arrancamos

Es una solución de arranque, pensada para que uses la app ya. Una conexión más completa la diseñamos después, con lo que aprendamos de esta.

- **Afuera por ahora:** avisos automáticos cuando se guarda un parte (webhooks), sincronización en los dos sentidos y que ObrasFlow escriba en Residente de Obra.
- **Cuándo:** arrancamos cuando cerremos la versión piloto en la que estamos ahora. Te avisamos para coordinar el alta.
