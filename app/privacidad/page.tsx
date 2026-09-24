import type { Metadata } from "next";
import LegalPage, { ContactLine } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Política de privacidad · ObrasFlow" };

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de privacidad" updated="24 de septiembre de 2026">
      <p>
        ObrasFlow es el sistema interno de gestión de obras de la empresa. Esta política explica qué datos trata la
        aplicación web y su asistente de WhatsApp, para qué y con quién se comparten.
      </p>

      <h2 className="h5 mt-4">Quiénes pueden usar el asistente de WhatsApp</h2>
      <p>
        Solo las personas que la empresa autoriza expresamente, identificadas por su número de teléfono. Los mensajes
        que llegan desde cualquier otro número se descartan sin guardarse y sin respuesta.
      </p>

      <h2 className="h5 mt-4">Qué datos tratamos</h2>
      <ul>
        <li>Número de teléfono y nombre de las personas autorizadas.</li>
        <li>El contenido de los mensajes que envían al asistente: textos, fotos y PDF de comprobantes de pago.</li>
        <li>
          Los registros de gestión que resultan de esos mensajes (movimientos de obra, ingresos y egresos), que se
          guardan solo cuando la persona los confirma.
        </li>
      </ul>

      <h2 className="h5 mt-4">Para qué los usamos</h2>
      <p>
        Únicamente para responder consultas sobre las obras de la empresa y para preparar y registrar los movimientos
        que la persona autorizada confirma. No los usamos con fines publicitarios ni los vendemos.
      </p>

      <h2 className="h5 mt-4">Con quién se comparten</h2>
      <ul>
        <li>
          <strong>Meta Platforms (WhatsApp Business Platform)</strong>, que transmite los mensajes entre WhatsApp y
          ObrasFlow.
        </li>
        <li>
          <strong>Anthropic</strong> (modelo de inteligencia artificial Claude), que procesa el contenido de los
          mensajes y comprobantes únicamente para generar la respuesta del asistente, según sus condiciones comerciales
          de uso de la API.
        </li>
        <li>
          Los proveedores de infraestructura donde funciona ObrasFlow (alojamiento de la aplicación y base de datos).
        </li>
      </ul>

      <h2 className="h5 mt-4">Cuánto tiempo los conservamos</h2>
      <p>
        Los registros confirmados forman parte de la administración de las obras y se conservan mientras la empresa
        los necesite o la ley lo exija. Los mensajes y comprobantes recibidos se conservan mientras sean útiles para
        esa administración y se eliminan a pedido, según se indica abajo.
      </p>

      <h2 className="h5 mt-4">Seguridad</h2>
      <p>
        Cada mensaje que recibe ObrasFlow se verifica con la firma de Meta, el acceso está limitado a los números
        autorizados y nada se registra sin una confirmación explícita de la persona.
      </p>

      <h2 id="borrado-de-datos" className="h5 mt-4">
        Cómo pedir el borrado de tus datos
      </h2>
      <p>
        Podés pedir que se eliminen tus mensajes, comprobantes y datos de contacto <ContactLine />. Se eliminan dentro
        de los 30 días, salvo los registros que la empresa deba conservar por obligaciones legales o contables. También
        podés dejar de usar el asistente en cualquier momento.
      </p>

      <h2 className="h5 mt-4">Cambios</h2>
      <p>Si esta política cambia, la fecha de arriba se actualiza.</p>
    </LegalPage>
  );
}
