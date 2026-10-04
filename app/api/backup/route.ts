import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { gzipSync } from "node:zlib";
import { Prisma } from "@prisma/client";
import { del, list, put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cuántos backups diarios se guardan; los más viejos se borran. */
const KEEP = 30;
const PREFIX = "backups/";
/** Filas por lectura en las tablas con archivos (ver más abajo). */
const BYTES_PAGE = 50;
/** Un string de JavaScript no puede pasar de ~500 millones de caracteres: se avisa bastante antes. */
const AVISO_JSON_CHARS = 200_000_000;

/**
 * Backup diario de TODA la base (una tabla por modelo de prisma/schema.prisma),
 * disparado por el cron de vercel.json. Se guarda comprimido en el Blob store
 * privado "obrasflow-backups" (solo accesible con el token del proyecto).
 * Protegido con CRON_SECRET: Vercel lo manda como "Authorization: Bearer ...".
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Backup no configurado." }, { status: 503 });
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const startedAt = Date.now();
    const tables: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const model of Prisma.dmmf.datamodel.models) {
      const delegate = (prisma as any)[model.name.charAt(0).toLowerCase() + model.name.slice(1)];
      const bytesFields = model.fields.filter((f) => f.type === "Bytes").map((f) => f.name);
      const idField = model.fields.find((f) => f.isId)?.name;
      let rows: Record<string, unknown>[];
      if (bytesFields.length && idField) {
        // Tablas con archivos (Attachment, InboundMedia): de a poco, y cada
        // archivo pasa a base64 apenas se lee. Antes JSON.stringify lo
        // convertía en un arreglo de números (≈10 veces su tamaño en
        // memoria) y con muchos archivos el backup se quedaba sin memoria.
        // El resultado en el JSON es exactamente el mismo: { $bytes: base64 }.
        rows = [];
        let cursor: unknown;
        for (;;) {
          const page: Record<string, unknown>[] = await delegate.findMany({
            take: BYTES_PAGE,
            orderBy: { [idField]: "asc" },
            ...(cursor === undefined ? {} : { cursor: { [idField]: cursor }, skip: 1 }),
          });
          for (const row of page) {
            for (const f of bytesFields) {
              const v = row[f];
              if (v instanceof Uint8Array) row[f] = { $bytes: Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64") };
            }
            rows.push(row);
          }
          if (page.length < BYTES_PAGE) break;
          cursor = page[page.length - 1][idField];
        }
      } else {
        rows = await delegate.findMany();
      }
      tables[model.name] = rows;
      counts[model.name] = rows.length;
    }

    const now = new Date();
    const json = JSON.stringify({ formato: "obrasflow-backup-v1", fecha: now.toISOString(), counts, tables }, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v instanceof Uint8Array) return { $bytes: Buffer.from(v).toString("base64") };
      // Bytes (archivos adjuntos): Buffer.toJSON ya corrió, así que llega como {type:"Buffer",data:[...]}.
      if (v && typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) {
        return { $bytes: Buffer.from(v.data).toString("base64") };
      }
      return v;
    });
    const gz = gzipSync(json);
    // Queda en los logs de Vercel cuánto pesa y cuánto tarda, para ver venir
    // el límite antes de que el backup empiece a fallar.
    const segundos = Math.round((Date.now() - startedAt) / 1000);
    console.log(`backup: ${Math.round(json.length / 1e6)} MB de JSON, ${Math.round(gz.length / 1e6)} MB comprimido, ${segundos} s`);
    if (json.length > AVISO_JSON_CHARS || segundos > maxDuration / 2) {
      console.warn("backup: se está acercando al límite de memoria o de tiempo de la función; hay que partirlo en varios archivos.");
    }
    const pathname = `${PREFIX}obrasflow-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json.gz`;
    await put(pathname, gz, { access: "private", contentType: "application/gzip", addRandomSuffix: false });

    // Retención: se quedan los últimos KEEP backups.
    const all = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: PREFIX, cursor });
      all.push(...page.blobs);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    all.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    const old = all.slice(KEEP).map((b) => b.url);
    if (old.length) await del(old);

    return NextResponse.json({ ok: true, pathname, bytes: gz.length, counts, borrados: old.length });
  } catch (err) {
    console.error("backup falló", err);
    return NextResponse.json({ error: "No se pudo hacer el backup." }, { status: 500 });
  }
}
