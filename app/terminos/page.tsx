import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { ContactLine } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Términos de uso · ObrasFlow" };

export default function TerminosPage() {
  return (
    <LegalPage title="Términos de uso" updated="24 de septiembre de 2026">
      <p>
        ObrasFlow y su asistente de WhatsApp son herramientas internas de la empresa para gestionar sus obras. Al
        usarlos aceptás estos términos.
      </p>

      <h2 className="h5 mt-4">Quién puede usarlo</h2>
      <p>
        Solo las personas autorizadas por la empresa. El acceso es personal: no compartas tu acceso ni el número del
        asistente con terceros.
      </p>

      <h2 className="h5 mt-4">El asistente usa inteligencia artificial</h2>
      <p>
        El asistente interpreta tus mensajes y comprobantes con un modelo de inteligencia artificial y puede
        equivocarse. Por eso <strong>nada se registra hasta que tocás el botón Confirmar</strong> de la propuesta:
        revisá siempre el monto, la obra y la fecha antes de confirmar. Las consultas se responden con los datos
        cargados en ObrasFlow al momento de la pregunta.
      </p>

      <h2 className="h5 mt-4">Uso correcto</h2>
      <ul>
        <li>Usalo solo para la gestión de las obras y la administración de la empresa.</li>
        <li>No envíes información de terceros que no sea necesaria para esa gestión.</li>
        <li>No intentes acceder a datos o funciones para las que no tenés autorización.</li>
      </ul>

      <h2 className="h5 mt-4">Disponibilidad</h2>
      <p>
        El servicio se ofrece tal como está y puede interrumpirse o modificarse, por ejemplo por mantenimiento o por
        cambios en WhatsApp o en los proveedores de inteligencia artificial. Si el asistente no está disponible, los
        registros se pueden cargar directamente en la aplicación web.
      </p>

      <h2 className="h5 mt-4">Datos personales</h2>
      <p>
        El tratamiento de tus datos se explica en la <Link href="/privacidad">política de privacidad</Link>.
      </p>

      <h2 className="h5 mt-4">Contacto</h2>
      <p>
        Por dudas sobre estos términos o para hablar con una persona, podés hacerlo <ContactLine />.
      </p>
    </LegalPage>
  );
}
