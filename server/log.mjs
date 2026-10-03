// Logs legibles con hora para el modo local (servidor web y orquestador).
// Formato de cada línea:  14:05:31 web       GET /api/projects → 200 (35 ms)
// Usa pino (ya instalado) con un formateador propio: no hace falta pino-pretty.

import pino from "pino";
import { Writable } from "node:stream";

const NIVEL = { 10: "TRACE ", 20: "DEBUG ", 30: "", 40: "AVISO ", 50: "ERROR ", 60: "FATAL " };
const HORA_AL_INICIO = /^\d\d:\d\d:\d\d /;

export const hora = (t = Date.now()) => new Date(t).toLocaleTimeString("es-PY", { hour12: false });
const columna = (origen) => String(origen).padEnd(9);

/** Logger pino con salida de una línea por evento, con hora y origen. */
export function crearLog(origen) {
  const salida = new Writable({
    write(chunk, _enc, cb) {
      for (const linea of chunk.toString().split("\n")) {
        if (!linea) continue;
        try {
          const { level, time, msg, origen: o, pid: _p, hostname: _h, err, ...resto } = JSON.parse(linea);
          const extra = Object.keys(resto).length ? " " + JSON.stringify(resto) : "";
          process.stdout.write(`${hora(time)} ${columna(o ?? origen)} ${NIVEL[level] ?? ""}${msg ?? ""}${extra}\n`);
          if (err?.stack) process.stdout.write(err.stack + "\n");
        } catch {
          process.stdout.write(linea + "\n");
        }
      }
      cb();
    },
  });
  return pino({ base: { origen }, level: process.env.LOG_LEVEL || "info" }, salida);
}

/**
 * Devuelve una función que recibe trozos de salida de un proceso hijo y los
 * escribe línea por línea con hora y origen (las que ya traen hora pasan tal cual).
 */
export function prefijador(origen, destino = process.stdout) {
  let pendiente = "";
  const escribir = (linea) => {
    const limpia = linea.replace(/\r$/, "");
    if (!limpia.trim()) return;
    destino.write(HORA_AL_INICIO.test(limpia) ? limpia + "\n" : `${hora()} ${columna(origen)} ${limpia}\n`);
  };
  const fn = (chunk) => {
    const partes = (pendiente + chunk.toString()).split("\n");
    pendiente = partes.pop() ?? "";
    partes.forEach(escribir);
  };
  fn.vaciar = () => {
    if (pendiente) escribir(pendiente);
    pendiente = "";
  };
  return fn;
}
