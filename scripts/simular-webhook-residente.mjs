#!/usr/bin/env node
// Simula un webhook "parte.cerrado" de Residente de Obra, firmado igual que lo
// mandarían ellos, para probar la integración sin su API.
//
// Uso:
//   node --env-file=.env.local scripts/simular-webhook-residente.mjs --obra OF-001
//   node --env-file=.env.local scripts/simular-webhook-residente.mjs --obra OF-001 --fecha 2026-10-02
//   node --env-file=.env.local scripts/simular-webhook-residente.mjs --obra OF-001 --parte <uuid>   (reenvía el mismo parte: no duplica)
//   ... --url https://<link-del-preview>.vercel.app   (por defecto http://localhost:3000)
//
// Necesita RESIDENTE_WEBHOOK_SECRET (el mismo que tiene la app).
//
// NUNCA contra producción (obrasflow-app.vercel.app): crea partes ficticios en
// las obras reales. Probá en la app local o en el preview de una rama (que
// tiene su propia copia de la base). Contra producción el script se niega a
// correr, salvo que se agregue --si-produccion a propósito.

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
let host = "";
try {
  host = new URL(base).hostname.toLowerCase();
} catch {
  console.error(`--url no es una dirección válida: ${base}`);
  process.exit(1);
}
if (host === "obrasflow-app.vercel.app" && !("si-produccion" in args)) {
  console.error("Esa es la app de producción: el parte simulado quedaría en las obras reales. No se mandó nada.");
  console.error("Probá en local (sin --url) o en el preview de una rama. Si de verdad querés producción, agregá --si-produccion.");
  process.exit(1);
}
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
