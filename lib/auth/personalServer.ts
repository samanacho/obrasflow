import { prisma } from "../prisma";
import { getSession, isLocalApp } from "./server";
import { estaEnPersonal, usuariosPersonal } from "./personal";

// Permiso para la pantalla Personal, del lado del servidor (reglas en
// ./personal.ts). Servidor únicamente.

/** ¿Este usuario (ya leído de la base) puede ver Personal? */
export async function usuarioVePersonal(u: { id: string; username: string; active: boolean }): Promise<boolean> {
  if (!u.active) return false;
  const lista = usuariosPersonal(process.env.PERSONAL_USUARIOS);
  if (lista) return estaEnPersonal(u.username, lista);
  // Sin lista: solo el primer usuario creado que siga activo (Ignacio).
  const primero = await prisma.user.findFirst({
    where: { active: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return primero?.id === u.id;
}

/** ¿Quien hace este pedido puede ver Personal? En la app local, siempre (es la PC de Ignacio). */
export async function sesionVePersonal(): Promise<boolean> {
  if (isLocalApp()) return true;
  const s = await getSession();
  if (!s) return false;
  const u = await prisma.user.findUnique({ where: { id: s.uid }, select: { id: true, username: true, active: true } });
  return u ? usuarioVePersonal(u) : false;
}
