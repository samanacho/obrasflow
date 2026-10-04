import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appSource } from "@/lib/auth/server";
import { APP_SOURCE } from "@/lib/history";
import { decodificar, leerExport } from "@/lib/integraciones/residente/importar";
import { applyObraAvance, importPartes, ultimoAvanceImportado } from "@/lib/integraciones/residente/process";
import { SOURCE } from "@/lib/integraciones/residente/types";

// Importa el archivo que exporta Residente de Obra para UNA obra (CSV o JSON).
// Ver docs/PROPUESTA_CONEXION_RESIDENTE_DE_OBRA.md y docs/ejemplos/.
//   POST multipart: file=<archivo> (máx. 4 MB), modo=preview|aplicar
//   preview → cuenta qué pasaría, sin escribir nada.
//   aplicar → guarda los partes (el más nuevo gana) y el avance de la obra.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

interface Params {
  params: { id: string };
}

interface Avance {
  antes: number;
  despues: number;
  /** La obra ya tenía el avance según Residente de Obra (si no, pasa a tenerlo). */
  yaEraDeResidente: boolean;
  /** Desde cuándo vale el avance del archivo (ISO). */
  at: string | null;
  /** false = se deja el avance actual (el del archivo es más viejo). */
  aplicado: boolean;
  motivo: string | null;
}

const mismoCodigo =(a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function POST(req: NextRequest, { params }: Params) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No llegó el archivo. Elegilo de nuevo y probá otra vez." }, { status: 400 });
  }
  const file = form.get("file") ?? form.get("archivo");
  const modo = String(form.get("modo") ?? "preview") === "aplicar" ? "aplicar" : "preview";
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Elegí el archivo que bajaste de Residente de Obra (CSV o JSON)." }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "El archivo es muy grande (máximo 4 MB). Exportá un rango de fechas más corto." }, { status: 413 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, code: true, progress: true, progressSource: true },
  });
  if (!project) return NextResponse.json({ error: "Obra no encontrada." }, { status: 404 });
  if (!project.code?.trim()) {
    return NextResponse.json({ error: "Primero cargale el código de obra de Residente (en Editar obra)." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const leido = leerExport(decodificar(bytes));

  const ajenos = leido.obraCodigos.filter((c) => !mismoCodigo(c, project.code!));
  if (ajenos.length) {
    return NextResponse.json(
      {
        error:
          `Este archivo es de la obra "${ajenos[0]}" y esta obra tiene el código "${project.code}". ` +
          "Revisá que estés importando en la obra correcta (o corregí el código en Editar obra).",
      },
      { status: 400 }
    );
  }
  if (!leido.partes.length && leido.avancePct === null) {
    return NextResponse.json(
      { error: "No encontramos partes ni avance de obra en el archivo.", avisos: leido.avisos },
      { status: 400 }
    );
  }

  const aplicar = modo === "aplicar";
  // Historial: "Residente de Obra · <autor> (subido por <quien ingresó>)". En la app local (sin login) va sin el "subido por".
  const quien = await appSource();
  const subidoPor = quien === APP_SOURCE ? undefined : quien;
  const resultados = await importPartes(project.id, leido.partes, { dryRun: !aplicar, subidoPor });
  const cuenta = (o: string) => resultados.filter((r) => r.outcome === o).length;
  const conteos = {
    total: leido.partes.length,
    nuevos: cuenta("nuevo"),
    actualizados: cuenta("actualizado"),
    sinCambios: cuenta("sin_cambios"),
    errores: cuenta("error") + leido.descartados,
  };

  // Avance de la obra: también gana el más nuevo. Si ya se importó un avance
  // con fecha posterior a la de este archivo, se deja el que está.
  let avance: Avance | null = null;
  if (leido.avancePct !== null) {
    const despues = Math.max(0, Math.min(100, Math.round(leido.avancePct)));
    avance = { antes: project.progress, despues, yaEraDeResidente: project.progressSource === SOURCE, at: leido.avanceAt, aplicado: true, motivo: null };
    const llega = leido.avanceAt ? Date.parse(leido.avanceAt) : NaN;
    const ultimo = project.progressSource === SOURCE ? await ultimoAvanceImportado(project.id) : null;
    if (ultimo !== null && Number.isFinite(llega) && llega <= ultimo && despues !== project.progress) {
      avance = {
        ...avance,
        despues: project.progress,
        aplicado: false,
        motivo: `El avance del archivo (${despues} %) es más viejo que el que ya está cargado (${project.progress} %): se deja el actual.`,
      };
    } else if (aplicar) {
      try {
        const r = await applyObraAvance(project.id, leido.avancePct, leido.avanceAt, subidoPor);
        avance = { ...avance, antes: r.antes, despues: r.despues };
      } catch (err) {
        console.error("Residente de Obra: no se pudo guardar el avance", err);
        leido.avisos.push("No se pudo guardar el avance de la obra. Probá importar de nuevo.");
        avance = { ...avance, despues: project.progress, aplicado: false, motivo: "No se pudo guardar el avance." };
        conteos.errores++;
      }
    }
  }

  const erroresDetalle = resultados
    .filter((r) => r.outcome === "error")
    .slice(0, 20)
    .map((r) => `Parte ${r.id} (${r.fecha}): no se pudo guardar${r.error ? ` (${r.error})` : ""}.`);

  if (aplicar) {
    // Registro del archivo importado. El mismo archivo dos veces queda una
    // sola vez (deliveryId = huella del archivo); volver a aplicarlo no
    // cambia nada igual, porque cada parte se compara con lo guardado.
    const deliveryId = createHash("sha256").update(bytes).digest("hex");
    try {
      await prisma.integrationEvent.create({
        data: {
          source: SOURCE,
          deliveryId,
          event: "import.archivo",
          payload: {
            archivo: file.name,
            tamano: file.size,
            formato: leido.formato,
            obraCodigo: leido.obraCodigo,
            conteos,
            avance,
            avisos: [...erroresDetalle, ...leido.avisos].slice(0, 60),
          } as Prisma.InputJsonValue,
          // Siempre "procesado": "error"/"sin_obra" son pendientes del webhook para reprocesar, y un archivo no se reprocesa.
          status: "procesado",
          error: conteos.errores ? `${conteos.errores} parte(s) con problemas` : null,
          projectId: project.id,
          processedAt: new Date(),
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
        console.error("Residente de Obra: no se pudo registrar el archivo importado", err);
      }
    }
  }

  return NextResponse.json({
    modo,
    formato: leido.formato,
    conteos,
    avance,
    avisos: [...erroresDetalle, ...leido.avisos],
    muestra: resultados.slice(0, 10).map(({ id, fecha, autor, resumen, outcome }) => ({ id, fecha, autor, resumen, outcome })),
  });
}
