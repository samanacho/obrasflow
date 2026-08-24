import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeContractor } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const RUBROS = ["civil", "electrico", "vial"];
const STATUSES = ["activo", "inactivo"];

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const contractor = await prisma.contractor.findUnique({
    where: { id: params.id },
    include: { history: { orderBy: { fecha: "desc" } } },
  });
  if (!contractor) return NextResponse.json({ error: "Contratista no encontrado." }, { status: 404 });
  return NextResponse.json(serializeContractor(contractor));
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

    const rubros = Array.isArray(body.rubros) ? body.rubros.filter((r) => RUBROS.includes(String(r))) : [];
    const status = STATUSES.includes(String(body.status)) ? String(body.status) : "activo";

    const updated = await prisma.contractor.update({
      where: { id: params.id },
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
    return NextResponse.json(serializeContractor(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Contratista no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar el contratista." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.contractor.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Contratista no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar el contratista." }, { status: 500 });
  }
}
