# Respuesta a la propuesta de conexión — ObrasFlow

4 de octubre de 2026 · Ignacio Samaniego (ObrasFlow) para Rodrigo y Matias (Residente de Obra)

Gracias por la propuesta. **La aceptamos tal cual**: empezamos con el export por obra y dejamos el acceso de solo lectura para cuando el export nos quede corto. De nuestro lado ya está casi todo listo para recibirlo.

## Lo que ya tenemos hecho

| Lo que nos pidieron | Estado |
| --- | --- |
| `code` del proyecto en ObrasFlow, que coincide con su `codigo` de obra | Hecho. Es único y se carga en el formulario de la obra. |
| Guardar su id con índice único | Hecho. Si importamos dos veces el mismo parte, se actualiza en vez de duplicarse. |
| Import en ObrasFlow | En construcción. En la ficha de la obra hay un botón "Importar de Residente de Obra": se sube el CSV o JSON, se ve una vista previa (nuevos, actualizados, sin cambios) y se confirma. |
| Quedarse con el parte más nuevo | Incluido en el import: solo pisamos un parte si su "última modificación" es más nueva que la que tenemos. |
| Un parte por obra, día y persona | Incluido: cada parte es un registro aparte, con su autor. |
| Avance de la obra | En las obras conectadas, el % de ObrasFlow pasa a ser el de ustedes, y no se edita a mano. |
| Fotos | Guardamos los links y avisamos que se abren en Residente de Obra con el usuario de cada uno. |
| **Login antes de cargar datos reales** | En marcha. Va a haber usuario y contraseña por persona, y no vamos a cargar datos reales hasta que esté publicado. |
| Clave del acceso de solo lectura | Cuando exista, va solo en las variables del servidor (Vercel), nunca en el navegador ni en el repositorio. |

## Una propuesta para cerrar el formato

Para no adivinar los nombres de los campos, armamos dos archivos de ejemplo con datos inventados:

- `docs/ejemplos/residente-export-ejemplo.json`
- `docs/ejemplos/residente-export-ejemplo.csv`

No hace falta que los copien. Nuestro import reconoce variantes de los nombres de columna, pero si les sirve como punto de partida, mejor. Lo que más nos ayuda es que el export traiga, por cada parte:

- **id del parte** (que no cambie cuando el parte se edita);
- **código de la obra**;
- **fecha** del parte;
- **autor**;
- **última modificación**, con zona horaria (ej. `2026-10-03T21:40:00-03:00`);
- **observaciones**;
- **dotación**;
- **avance por ítem**: ítem, cantidad y unidad;
- **links de fotos**.

Y, una vez por archivo, el **% de avance de la obra** con la fecha a la que corresponde.

## Lo que les pedimos

1. **Un archivo de ejemplo real** apenas tengan el export, aunque sea de una obra de prueba con datos inventados. Con eso ajustamos el import en un día.
2. Confirmar que el **id de un parte no cambia** cuando se edita (de eso depende que no se dupliquen).
3. Contarnos si el **% de avance** viene por obra completa o también por etapa o ítem, y si el CSV usa `;` o `,`.
4. Avisarnos cuándo cierran el piloto, para coordinar el alta.

## Lo que mandamos nosotros

- **La lista de obras que vamos a cargar**, con su código y quiénes cargan en cada una (en preparación, se la mandamos aparte).
- Nuestras observaciones sobre los datos a medida que los usemos.

Quedamos atentos.
