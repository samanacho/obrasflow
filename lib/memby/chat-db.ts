import { prisma } from "../prisma";
import { createRemotePrisma } from "./remote-prisma";

/**
 * Base para las tablas de Memby (sesión, mensajes, propuestas, comprobantes)
 * que muestra la pantalla /agente-whatsapp de la app LOCAL. Como el conector
 * registra en producción, esa pantalla las lee de Vercel si en .env.local
 * están MEMBY_CHAT_URL y MEMBY_CHAT_KEY (la clave del conector). En Vercel, o
 * sin esas variables, es la base de siempre.
 */
const url = process.env.VERCEL ? "" : process.env.MEMBY_CHAT_URL?.trim();
const key = process.env.MEMBY_CHAT_KEY?.trim();

export const membyDb = url && key ? createRemotePrisma(url, key) : prisma;
