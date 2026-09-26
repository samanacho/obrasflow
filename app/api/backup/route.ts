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
    const tables: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const model of Prisma.dmmf.datamodel.models) {
      const delegate = (prisma as any)[model.name.charAt(0).toLowerCase() + model.name.slice(1)];
      const rows: unknown[] = await delegate.findMany();
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
