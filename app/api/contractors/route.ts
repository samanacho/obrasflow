import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeContractor } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const RUBROS = ["civil", "electrico", "vial", "otro"];
const STATUSES = ["activo", "inactivo"];

/** Lista contratistas, con filtros opcionales ?rubro=&ciudad=&status=&q= */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const rubro = sp.get("rubro");
  const ciudad = sp.get("ciudad");
  const status = sp.get("status");
  const q = sp.get("q");

  const contractors = await prisma.contractor.findMany({
    where: {
      ...(rubro ? { rubros: { has: rubro as any } } : {}),
      ...(ciudad ? { city: { contains: ciudad, mode: "insensitive" } } : {}),
      ...(status ? { status: status as any } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { contactName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { history: { select: { rating: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(contractors.map(serializeContractor));
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

    const rubros = Array.isArray(body.rubros) ? body.rubros.filter((r) => RUBROS.includes(String(r))) : [];
    const status = STATUSES.includes(String(body.status)) ? String(body.status) : "activo";

    const created = await prisma.contractor.create({
      data: {
        name,
        ruc: body.ruc ? String(body.ruc) : null,
        contactName: body.contactName ? String(body.contactName) : null,
        phone: body.phone ? String(body.phone) : null,
        email: body.email ? String(body.email) : null,
        city: body.city ? String(body.city) : null,
        province: body.province ? String(body.province) : null,
        rubros: rubros as any,
        status: status as any,
        notes: body.notes ? String(body.notes) : null,
      },
      include: { history: { select: { rating: true } } },
    });
    return NextResponse.json(serializeContractor(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo crear el contratista." }, { status: 500 });
  }
}
