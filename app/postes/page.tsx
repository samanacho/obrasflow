"use client";

import { CCard, CCardBody, CCardHeader } from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilCheckCircle } from "@coreui/icons";
import AppShell from "@/components/AppShell";

const PLANEADO = [
  "Lotes de producción, con fecha de colado y desmolde",
  "Especificaciones técnicas por tipo de poste (largo, clase de resistencia, armadura) según norma ANDE",
  "Control de calidad y ensayos por lote (ruptura, curado, verificación dimensional)",
  "Estado de aprobación ANDE de cada lote",
  "Stock de postes terminados, listos para despacho",
];

/**
 * Todavía no es un módulo funcional — el usuario pidió reservar el lugar
 * ("eventualmente será un módulo para controlar la producción...") antes
 * de que definamos los campos y el flujo real con él. Página propia
 * (no una pestaña más del listado de proyectos) porque conceptualmente
 * es otra cosa: control de producción de fábrica, no gestión de obras —
 * mismo criterio que Contratistas, que también vive aparte.
 */
export default function PostesPage() {
  return (
    <AppShell crumbs={[{ label: "Fábrica de Postes" }]}>
      <h1 className="of-page-title">🏭 Fábrica de Postes</h1>
      <p className="module-desc mb-4">
        Control de producción de postes de hormigón bajo especificaciones técnicas de la ANDE.
      </p>

      <CCard>
        <CCardHeader className="fw-semibold">Próximamente</CCardHeader>
        <CCardBody>
          <p className="mb-3">
            Este módulo todavía no está construido — por ahora es solo el lugar reservado en el menú.
            Cuando quieras armarlo, lo diseñamos juntos a partir de cómo funciona realmente la producción
            en tu fábrica y qué pide la ANDE en cada lote.
          </p>
          <p className="module-desc mb-2">Algunas cosas que probablemente va a incluir:</p>
          <ul className="item-list">
            {PLANEADO.map((item) => (
              <li key={item} className="item-row-sub mb-2 d-flex align-items-start gap-2">
                <CIcon icon={cilCheckCircle} className="mt-1 flex-shrink-0" size="sm" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CCardBody>
      </CCard>
    </AppShell>
  );
}
