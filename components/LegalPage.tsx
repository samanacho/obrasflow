import Link from "next/link";

// Marco simple (sin el menú de la app) para las páginas públicas que pide
// Meta al publicar la app de WhatsApp: /privacidad y /terminos.

/** Correo de contacto opcional (variable pública de Vercel); sin él se remite al administrador. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "";

export function ContactLine() {
  return CONTACT_EMAIL ? (
    <>
      escribiendo a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    </>
  ) : (
    <>contactando al administrador de ObrasFlow en la empresa</>
  );
}

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="container py-5" style={{ maxWidth: 760 }}>
      <p className="text-body-secondary small mb-1">ObrasFlow</p>
      <h1 className="h3 mb-1">{title}</h1>
      <p className="text-body-secondary small mb-4">Última actualización: {updated}</p>
      <div className="lh-lg">{children}</div>
      <hr className="my-4" />
      <p className="small text-body-secondary">
        <Link href="/privacidad">Política de privacidad</Link> · <Link href="/terminos">Términos de uso</Link>
      </p>
    </main>
  );
}
