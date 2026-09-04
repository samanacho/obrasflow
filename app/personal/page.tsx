"use client";

import { CCard, CCardBody } from "@coreui/react";
import AppShell from "@/components/AppShell";
import PinGate from "@/components/PinGate";

/**
 * Módulo "Personal" — a propósito sin funcionalidad todavía. El usuario
 * pidió dejarlo accesible desde el menú y esperar a que dé el contexto/
 * requerimientos (legajos, asistencia, liquidaciones, etc.) antes de
 * construir nada, para no adivinar y tener que rehacerlo. Tapado con
 * PinGate (PIN "9061") a pedido — ver componente para las limitaciones
 * reales de esto (no es autenticación de verdad).
 */
export default function PersonalPage() {
  return (
    <AppShell crumbs={[{ label: "Personal" }]}>
      <PinGate pin="9061" storageKey="obrasflow-personal-unlocked" title="Módulo Personal">
        <h1 className="of-page-title">👤 Personal</h1>
        <p className="module-desc mb-4">
          Este módulo todavía no tiene funcionalidad — está reservado a la espera de la definición de qué tiene que
          manejar (legajos, asistencia, liquidaciones de jornales, etc.).
        </p>
        <CCard>
          <CCardBody>
            <p className="empty-col">Esperando el contexto para desarrollarlo.</p>
          </CCardBody>
        </CCard>
      </PinGate>
    </AppShell>
  );
}
