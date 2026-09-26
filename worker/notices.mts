// Avisos automáticos de Memby al chat "Tú" del dueño. Corren en el conector
// (esta PC), cada 10 minutos mientras WhatsApp está conectado:
//  • Presupuesto: una obra en curso llega al 90 % o se pasa del 100 %.
//  • Propuestas sin confirmar: esperando hace más de 2 horas.
//  • Resumen del día: a las 19:00 (hora de Paraguay), lo registrado hoy.
// Cada aviso se manda una sola vez (tabla WhatsAppNotice). Se apagan con
// MEMBY_AVISOS=off en .env.local.

import { prisma } from "../lib/prisma";
import { fmtGs } from "../lib/agent/format";
import { listarMovimientos } from "../lib/agent/queries";
import { dayjs, TZ } from "../lib/dayjs";

const EVERY_MS = 10 * 60 * 1000;
const PENDING_AFTER_MS = 2 * 60 * 60 * 1000;
const DAILY_HOUR = Math.min(23, Math.max(0, Number(process.env.MEMBY_RESUMEN_HORA ?? 19) || 19));
const MAX_LIST = 5;

type Send = (text: string) => Promise<void>;

async function alreadySent(key: string) {
  return Boolean(await prisma.whatsAppNotice.findUnique({ where: { key } }));
}
async function markSent(keys: string[]) {
  if (keys.length) await prisma.whatsAppNotice.createMany({ data: keys.map((key) => ({ key })), skipDuplicates: true });
}

function listLines<T>(items: T[], line: (x: T) => string) {
  const shown = items.slice(0, MAX_LIST).map(line);
  if (items.length > MAX_LIST) shown.push(`…y ${items.length - MAX_LIST} más`);
  return shown.join("\n");
}

const obraName = (p: { name: string; reference: string | null }) => `${p.name}${p.reference ? ` (REF ${p.reference})` : ""}`;

/** Obras en curso que llegaron al 90 % o pasaron el 100 % del presupuesto. */
async function budgetNotice(): Promise<{ text: string; keys: string[] } | null> {
  const projects = await prisma.project.findMany({
    where: { status: { in: ["en_curso", "planificado", "pausado"] }, budget: { gt: 0 } },
    select: { id: true, name: true, reference: true, budget: true, spent: true },
  });
  const over: { p: (typeof projects)[number]; pct: number; key: string }[] = [];
  const near: typeof over = [];
  const reset: string[] = [];
  for (const p of projects) {
    const pct = Math.round((Number(p.spent) / Number(p.budget)) * 100);
    if (pct >= 100) {
      const key = `presu100:${p.id}`;
      if (!(await alreadySent(key))) over.push({ p, pct, key });
    } else if (pct >= 90) {
      const key = `presu90:${p.id}`;
      if (!(await alreadySent(key))) near.push({ p, pct, key });
    } else {
      // Volvió a estar bien (le subieron el presupuesto): si vuelve a pasar, se avisa de nuevo.
      reset.push(`presu100:${p.id}`, `presu90:${p.id}`);
    }
  }
  if (reset.length) await prisma.whatsAppNotice.deleteMany({ where: { key: { in: reset } } });
  if (!over.length && !near.length) return null;

  const parts: string[] = [];
  if (over.length) {
    parts.push(
      `🔴 *${over.length === 1 ? "Una obra pasó" : `${over.length} obras pasaron`} su presupuesto:*\n` +
        listLines(over, ({ p, pct }) => `• ${obraName(p)}: *${pct} %* (${fmtGs(Number(p.spent))} de ${fmtGs(Number(p.budget))})`)
    );
  }
  if (near.length) {
    parts.push(
      `🟡 *${near.length === 1 ? "Una obra está" : `${near.length} obras están`} cerca del tope:*\n` +
        listLines(near, ({ p, pct }) => `• ${obraName(p)}: *${pct} %* · quedan ${fmtGs(Number(p.budget) - Number(p.spent))}`)
    );
  }
  return { text: `⚠️ Aviso de presupuesto\n\n${parts.join("\n\n")}`, keys: [...over, ...near].map((x) => x.key) };
}

/** Propuestas que esperan confirmación hace más de 2 horas (se avisa una vez por propuesta). */
async function pendingNotice(phone: string): Promise<{ text: string; keys: string[] } | null> {
  const rows = await prisma.whatsAppPendingAction.findMany({
    where: { phone, status: "pendiente", expiresAt: { gt: new Date() }, createdAt: { lt: new Date(Date.now() - PENDING_AFTER_MS) } },
    orderBy: { createdAt: "asc" },
    select: { id: true, summary: true, confirmCode: true, expiresAt: true },
  });
  const fresh = [];
  for (const r of rows) if (!(await alreadySent(`pend:${r.id}`))) fresh.push(r);
  if (!fresh.length) return null;
  // "Movimiento de obra · Gs. 500.000 · Puente Río Claro", sacado de la tarjeta.
  const short = (s: string) => {
    const plain = s.replace(/\*/g, "");
    const title = /📝\s*([^—\n]+)/.exec(plain)?.[1]?.trim() ?? "Propuesta";
    const monto = /Monto:\s*([^\n]+)/.exec(plain)?.[1]?.trim();
    const what = /(?:Obra|Concepto|Nota):\s*([^\n·]+)/.exec(plain)?.[1]?.trim();
    return [title, monto, what?.slice(0, 50)].filter(Boolean).join(" · ");
  };
  const text =
    `⏰ *${fresh.length === 1 ? "Tenés una propuesta" : `Tenés ${fresh.length} propuestas`} sin confirmar:*\n` +
    listLines(fresh, (r) => `• ${short(r.summary)}${r.confirmCode ? ` → *OK ${r.confirmCode}*` : ""} (vence ${dayjs(r.expiresAt).tz(TZ).fromNow()})`) +
    "\n\nSi no van, respondé NO y el código.";
  return { text, keys: fresh.map((r) => `pend:${r.id}`) };
}

/** Resumen del día, una vez por día a partir de la hora configurada. */
async function dailyNotice(phone: string): Promise<{ text: string; keys: string[] } | null> {
  const now = dayjs().tz(TZ);
  if (now.hour() < DAILY_HOUR) return null;
  const today = now.format("YYYY-MM-DD");
  const key = `diario:${today}`;
  if (await alreadySent(key)) return null;

  const [movs, pendientes, rapidos, confirmadasHoy] = await Promise.all([
    listarMovimientos({ desde: today, hasta: today, limite: 5, incluirGenerales: true }),
    prisma.whatsAppPendingAction.count({ where: { phone, status: "pendiente", expiresAt: { gt: new Date() } } }),
    prisma.quickExpense.count({ where: { resuelto: false } }),
    prisma.whatsAppPendingAction.count({ where: { phone, status: "confirmada", updatedAt: { gte: now.startOf("day").toDate() } } }),
  ]);
  const lines = [`📊 *Resumen de hoy, ${now.format("dddd D [de] MMMM")}*`, ""];
  if (movs.cantidad === 0) lines.push("• No se registraron movimientos hoy.");
  else {
    lines.push(`• ${movs.cantidad} movimiento${movs.cantidad === 1 ? "" : "s"} registrado${movs.cantidad === 1 ? "" : "s"}`);
    lines.push(`• Gasto neto en obras: *${fmtGs(movs.totales.gastoNetoDeObras)}*`);
    const t = movs.totales as { ingresosGenerales?: number; egresosGenerales?: number };
    if (t.ingresosGenerales) lines.push(`• Ingresos generales: ${fmtGs(t.ingresosGenerales)}`);
    if (t.egresosGenerales) lines.push(`• Egresos generales: ${fmtGs(t.egresosGenerales)}`);
  }
  if (confirmadasHoy) lines.push(`• ${confirmadasHoy} registrado${confirmadasHoy === 1 ? "" : "s"} por Memby`);
  if (pendientes) lines.push(`• ⏰ ${pendientes} propuesta${pendientes === 1 ? "" : "s"} esperando tu confirmación`);
  if (rapidos) lines.push(`• 📥 ${rapidos} registro${rapidos === 1 ? "" : "s"} rápido${rapidos === 1 ? "" : "s"} sin clasificar`);
  return { text: lines.join("\n"), keys: [key] };
}

export function avisosActivos() {
  return process.env.MEMBY_AVISOS?.trim().toLowerCase() !== "off";
}

/**
 * Arranca el ciclo de avisos. `ready()` dice si WhatsApp está conectado y
 * con qué número; `send` manda al chat "Tú" (y lo deja en el historial).
 */
export function startNotices(ready: () => string | null, send: Send) {
  let running = false;
  const tick = async () => {
    const phone = ready();
    if (running || !phone || !avisosActivos()) return;
    running = true;
    try {
      for (const build of [() => budgetNotice(), () => pendingNotice(phone), () => dailyNotice(phone)]) {
        const n = await build();
        if (!n) continue;
        // Se marca antes de mandar: ante un error se pierde un aviso, pero nunca se repite en loop.
        await markSent(n.keys);
        await send(n.text);
      }
    } catch (err) {
      console.error("Avisos:", (err as Error).message);
    } finally {
      running = false;
    }
  };
  // Primera revisión a los 2 minutos de arrancar (da tiempo a conectar).
  setTimeout(tick, 2 * 60 * 1000);
  setInterval(tick, EVERY_MS);
}
