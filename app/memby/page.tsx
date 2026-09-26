import { redirect } from "next/navigation";

// Atajo: /memby lleva a la pantalla del asistente.
export default function MembyRedirect() {
  redirect("/agente-whatsapp");
}
