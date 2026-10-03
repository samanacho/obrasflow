#!/usr/bin/env node
// Simula un webhook "parte.cerrado" de Residente de Obra, firmado igual que lo
// mandarían ellos, para probar la integración sin su API.
//
// Uso:
//   node --env-file=.env.local scripts/simular-webhook-residente.mjs --obra OF-001
//   node --env-file=.env.local scripts/simular-webhook-residente.mjs --obra OF-001 --fecha 2026-10-02
//   node --env-file=.env.local scripts/simular-webhook-residente.mjs --obra OF-001 --parte <uuid>   (reenvía el mismo parte: no duplica)
//   ... --url https://obrasflow-app.vercel.app   (por defecto http://localhost:3000)
//
// Necesita RESIDENTE_WEBHOOK_SECRET (el mismo que tiene la app).

import { createHmac, randomUUID } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), [])
);
const secret = process.env.RESIDENTE_WEBHOOK_SECRET;
if (!secret) {
  console.error("Falta RESIDENTE_WEBHOOK_SECRET (usá --env-file=.env.local).");
  process.exit(1);
}
if (!args.obra) {
  console.error("Falta --obra <codigo de la obra en ObrasFlow>.");
  process.exit(1);
}

const base = (args.url || "http://localhost:3000").replace(/\/+$/, "");
const fecha = args.fecha || new Date().toISOString().slice(0, 10);
const parteId = args.parte || randomUUID();

const evento = {
  id: randomUUID(),
  event: "parte.cerrado",
  created_at: new Date().toISOString(),
  data: {
    obra: { codigo: args.obra },
    parte: {
      id: parteId,
      fecha,
      clima: "Soleado, 31 °C",
      personal: 12,
      trabajo: "Hormigonado de losa del 2º piso, sector B. Encofrado de columnas del 3º piso.",
      dotacion: [
        { subcontratista: "Electricidad Gómez", cantidad: 3 },
        { subcontratista: "Herrería del Este", cantidad: 2 },
      ],
      avance: [
        { item: "Losa 2º piso", cantidad: 45, unidad: "m²" },
        { item: "Columnas 3º piso", cantidad: 6, unidad: "u" },
      ],
      fotos: 8,
      url: "https://residente-de-obra.example/partes/" + parteId,
      cerrado_por: "Residente (simulado)",
    },
  },
};

const raw = JSON.stringify(evento);
const firma = "sha256=" + createHmac("sha256", secret).update(raw, "utf8").digest("hex");
const res = await fetch(`${base}/api/integraciones/residente-de-obra/webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Signature": firma, "X-Event": evento.event, "X-Delivery-Id": evento.id },
  body: raw,
});
console.log(`Parte ${parteId} (${fecha}) → ${res.status}`, await res.text());
