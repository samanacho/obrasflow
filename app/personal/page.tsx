"use client";

import { CCard, CCardBody } from "@coreui/react";
import AppShell from "@/components/AppShell";

/**
 * Módulo "Personal" — a propósito sin funcionalidad todavía. El usuario
 * pidió dejarlo accesible desde el menú y esperar a que dé el contexto/
 * requerimientos (legajos, asistencia, liquidaciones, etc.) antes de
 * construir nada, para no adivinar y tener que rehacerlo.
 */
export default function PersonalPage() {
  return (
    <AppShell crumbs={[{ label: "Personal" }]}>
      <h1 className="of-page-title">🪪 Personal</h1>
      <p className="module-desc mb-4">
        Este módulo todavía no tiene funcionalidad — está reservado a la espera de la definición de qué tiene que
        manejar (legajos, asistencia, liquidaciones de jornales, etc.).
      </p>
      <CCard>
        <CCardBody>
          <p className="empty-col">Esperando el contexto para desarrollarlo.</p>
        </CCardBody>
      </CCard>
    </AppShell>
  );
}
