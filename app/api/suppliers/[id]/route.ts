import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeSupplier } from "@/lib/serialize";
import { PARAGUAY_DEPARTMENTS } from "@/lib/departments";

export const dynamic = "force-dynamic";

const CATEGORIES = ["materiales", "servicios"];
const STATUSES = ["activo", "inactivo"];

interface Params {
  params: { id: string };
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });

    const categories = Array.isArray(body.categories) ? body.categories.filter((c) => CATEGORIES.includes(String(c))) : [];
    if (categories.length === 0) {
      return NextResponse.json({ error: "Elegí al menos una categoría (materiales y/o servicios)." }, { status: 400 });
    }
    const status = STATUSES.includes(String(body.status)) ? String(body.status) : "activo";

    const departmentRaw = String(body.department ?? "").trim();
    if (departmentRaw && !(PARAGUAY_DEPARTMENTS as readonly string[]).includes(departmentRaw)) {
      return NextResponse.json({ error: `Departamento inválido: "${departmentRaw}".` }, { status: 400 });
    }

    const updated = await prisma.supplier.update({
      where: { id: params.id },
      data: {
        name,
        ruc: body.ruc ? String(body.ruc) : null,
        contactName: body.contactName ? String(body.contactName) : null,
        phone: body.phone ? String(body.phone) : null,
        email: body.email ? String(body.email) : null,
        city: body.city ? String(body.city) : null,
        department: departmentRaw || null,
        categories: categories as any,
        status: status as any,
        notes: body.notes ? String(body.notes) : null,
      },
    });
    return NextResponse.json(serializeSupplier(updated));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo actualizar el proveedor." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await prisma.supplier.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Proveedor no encontrado." }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "No se pudo eliminar el proveedor." }, { status: 500 });
  }
}
