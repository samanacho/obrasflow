import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const projects = [
  { name: "Puente Río Claro", type: "civil", manager: "Ana Torres", start: "2026-02-03", end: "2026-09-30", status: "en_curso", budget: 420000, spent: 231000, progress: 55 },
  { name: "Subestación Norte 34.5kV", type: "electrico", manager: "Marco Díaz", start: "2026-01-12", end: "2026-06-20", status: "en_curso", budget: 180000, spent: 150000, progress: 78 },
  { name: "Repavimentación Ruta 7", type: "vial", manager: "Lucía Fernández", start: "2025-11-01", end: "2026-03-15", status: "finalizado", budget: 260000, spent: 255000, progress: 100 },
  { name: "Colector pluvial Barrio Sur", type: "civil", manager: "Jorge Salas", start: "2026-05-01", end: "2026-11-01", status: "planificado", budget: 310000, spent: 12000, progress: 4 },
  { name: "Iluminación LED Av. Central", type: "electrico", manager: "Marco Díaz", start: "2026-03-10", end: "2026-05-30", status: "pausado", budget: 75000, spent: 40000, progress: 40 },
  { name: "Rotonda acceso norte", type: "vial", manager: "Lucía Fernández", start: "2026-04-01", end: "2026-08-15", status: "en_curso", budget: 190000, spent: 58000, progress: 30 },
] as const;

async function main() {
  await prisma.project.deleteMany();
  for (const p of projects) {
    await prisma.project.create({
      data: {
        name: p.name,
        type: p.type,
        manager: p.manager,
        start: new Date(p.start),
        end: new Date(p.end),
        status: p.status,
        budget: p.budget,
        spent: p.spent,
        progress: p.progress,
      },
    });
  }
  console.log(`Seed OK: ${projects.length} proyectos creados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
