import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkConnectorKey } from "@/lib/memby/auth";
import { decodeWire, encodeWire, REMOTE_OPS } from "@/lib/memby/wire";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODELS = new Set(Prisma.dmmf.datamodel.models.map((m) => m.name.charAt(0).toLowerCase() + m.name.slice(1)));

/**
 * Base de datos para el conector de Memby en la PC (ver lib/memby/remote-prisma.ts):
 * corre UNA operación de Prisma { model, op, args } contra la base de producción.
 */
export async function POST(req: NextRequest) {
  const denied = checkConnectorKey(req);
  if (denied) return denied;

  let body: { model?: string; op?: string; args?: unknown };
  try {
    body = decodeWire(await req.json(), { decimal: (s) => new Prisma.Decimal(s) });
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const { model, op, args } = body;
  if (!model || !MODELS.has(model) || !op || !REMOTE_OPS.has(op)) {
    return NextResponse.json({ error: `Operación no permitida: ${model}.${op}` }, { status: 400 });
  }

  try {
    const result = await (prisma as any)[model][op](args ?? {});
    return NextResponse.json({ result: encodeWire(result) });
  } catch (err) {
    const e = err as { message?: string; code?: string; meta?: unknown };
    const known = err instanceof Prisma.PrismaClientKnownRequestError || err instanceof Prisma.PrismaClientValidationError;
    if (!known) console.error("memby/db", model, op, err);
    return NextResponse.json({ error: e.message ?? "Error de base de datos.", code: e.code, meta: e.meta }, { status: known ? 422 : 500 });
  }
}
