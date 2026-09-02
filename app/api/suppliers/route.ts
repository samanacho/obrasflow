import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeSupplier } from "@/lib/serialize";
import { PARAGUAY_DEPARTMENTS } from "@/lib/departments";

export const dynamic = "force-dynamic";

const CATEGORIES = ["materiales", "servicios"];
const STATUSES = ["activo", "inactivo"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const category = sp.get("category");
  const status = sp.get("status");
  const q = sp.get("q");
  const suppliers = await prisma.supplier.findMany({
    where: {
      ...(category ? { categories: { has: category as any } } : {}),
      ...(status ? { status: status as any } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { contactName: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(suppliers.map(serializeSupplier));
}

export async function POST(req: NextRequest) {
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

    const created = await prisma.supplier.create({
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
    return NextResponse.json(serializeSupplier(created), { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo crear el proveedor." }, { status: 500 });
  }
}
