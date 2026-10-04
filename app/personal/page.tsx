import { notFound } from "next/navigation";
import { sesionVePersonal } from "@/lib/auth/personalServer";
import PersonalCliente from "./PersonalCliente";

// El permiso se mira en cada pedido (depende de quién ingresó), nunca se cachea.
export const dynamic = "force-dynamic";

/**
 * Personal (reparto de beneficios): solo para los usuarios de
 * lib/auth/personal.ts. El servidor decide antes de mandar nada; para los
 * demás la pantalla "no existe" (404), ni siquiera ven que hay algo bloqueado.
 */
export default async function PersonalPage() {
  if (!(await sesionVePersonal())) notFound();
  return <PersonalCliente />;
}
