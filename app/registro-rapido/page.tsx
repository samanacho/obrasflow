"use client";

import { useEffect, useMemo, useState } from "react";
import { CCard, CCardBody, CBadge, CButton, CFormSelect } from "@coreui/react";
import { CheckCircle, Lightning, Paperclip, Trash } from "@phosphor-icons/react";
import Icon from "@/components/ui/Icon";
import AppShell from "@/components/AppShell";
import { confirmarAccion, notificar } from "@/lib/ui/alerts";
import ItemFormModal from "@/components/ItemFormModal";
import GeneralMovementFormModal from "@/components/GeneralMovementFormModal";
import { notifyQuickExpensesChanged, QUICK_EXPENSES_CHANGED } from "@/components/QuickExpenseButton";
import type { QuickExpenseDTO, ProjectDTO, ProjectItemDTO, GeneralMovementDTO } from "@/lib/types";

function fmtMoney(n: number) {
  return "Gs. " + Number(n || 0).toLocaleString("es-PY");
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "hace 1 día";
  return `hace ${days} días`;
}

/**
 * Bandeja de capturas rápidas (ver components/QuickExpenseButton.tsx y
 * model QuickExpense) — pedido puntual del usuario: anota el pago en el
 * momento (monto/medioPago/fecha/nota) sin frenar a elegir obra, y acá,
 * con calma, lo convierte en el movimiento real (de una obra, o un gasto
 * general). Una vez clasificado sirve además como comprobante de que ese
 * monto/fecha/medioPago cargado tarde coincide con lo que efectivamente
 * pagó — ya no hay que confiar en la memoria.
 */
export default function RegistroRapidoPage() {
  const [items, setItems] = useState<QuickExpenseDTO[]>([]);
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const [obraPickerFor, setObraPickerFor] = useState<string | null>(null);
  const [obraPickerValue, setObraPickerValue] = useState("");
  const [obraFormFor, setObraFormFor] = useState<{ quickExpense: QuickExpenseDTO; projectId: string } | null>(null);
  const [generalFormFor, setGeneralFormFor] = useState<QuickExpenseDTO | null>(null);

  // Si la API falla se muestra el error (no "al día"): una lista vacía por
  // error haría creer que no queda nada por clasificar.
  function load() {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch("/api/quick-expenses").then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch("/api/projects").then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([q, p]) => { setItems(q); setProjects(p); })
      .catch(() => setError("No se pudieron cargar las capturas. Revisá la conexión y probá de nuevo."))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  // Si se anota una captura nueva con el botón del header estando parado acá,
  // que aparezca en Pendientes sin tener que recargar.
  useEffect(() => {
    const onChange = () => {
      fetch("/api/quick-expenses").then((r) => (r.ok ? r.json() : [])).then(setItems).catch(() => {});
    };
    window.addEventListener(QUICK_EXPENSES_CHANGED, onChange);
    return () => window.removeEventListener(QUICK_EXPENSES_CHANGED, onChange);
  }, []);

  const pendientes = useMemo(
    () => items.filter((i) => !i.resuelto).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [items]
  );
  const resueltos = useMemo(
    () => items.filter((i) => i.resuelto).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items]
  );
  const projectOptions = useMemo(() => projects.slice().sort((a, b) => a.name.localeCompare(b.name)), [projects]);

  async function markResolved(id: string) {
    try {
      const res = await fetch(`/api/quick-expenses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resuelto: true }),
      });
      // Sin esto, un 401/500 la mostraba "Clasificado" igual y al recargar volvía a pendientes.
      if (!res.ok) throw new Error();
      setItems((cur) => cur.map((i) => (i.id === id ? { ...i, resuelto: true } : i)));
      notifyQuickExpensesChanged();
    } catch {
      notificar("Se cargó el movimiento, pero no se pudo marcar esta captura como resuelta — hacelo a mano si querés.", "error");
    }
  }

  /**
   * La captura pudo haberse clasificado mientras esta pantalla estaba abierta
   * (por ejemplo, por WhatsApp): se revisa antes de abrir el formulario para
   * no cargar el mismo pago dos veces.
   */
  async function stillPending(item: QuickExpenseDTO): Promise<boolean> {
    try {
      const fresh: QuickExpenseDTO[] = await fetch("/api/quick-expenses").then((r) => (r.ok ? r.json() : Promise.reject()));
      const cur = fresh.find((i) => i.id === item.id);
      if (cur && !cur.resuelto) return true;
      setItems(fresh);
      notificar(cur ? "Esta captura ya se clasificó (quizás por WhatsApp) — no hace falta cargarla de nuevo." : "Esta captura ya no existe.", "info");
      return false;
    } catch {
      return true; // sin conexión con el servidor, el guardado igual va a avisar si falla
    }
  }

  function handleObraSaved(saved: ProjectItemDTO) {
    // Si la captura llegó con comprobante por WhatsApp, pasa al movimiento nuevo
    // — salvo que el usuario haya subido su propio archivo en el formulario.
    const mediaId = obraFormFor?.quickExpense.comprobanteMediaId;
    if (mediaId && !saved.attachment) {
      fetch(`/api/items/${saved.id}/attachment-from-media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId }),
      })
        .then((r) => { if (!r.ok) throw new Error(); })
        .catch(() => notificar("El movimiento se cargó, pero no se pudo adjuntar el comprobante — subilo desde la ficha de la obra.", "error"));
    }
    if (obraFormFor) markResolved(obraFormFor.quickExpense.id);
    setObraFormFor(null);
    setObraPickerFor(null);
    setObraPickerValue("");
    notificar("Movimiento cargado en la obra ✓", "success");
  }

  function handleGeneralSaved(_saved: GeneralMovementDTO) {
    if (generalFormFor) markResolved(generalFormFor.id);
    setGeneralFormFor(null);
    notificar("Gasto general cargado ✓", "success");
  }

  async function handleDelete(item: QuickExpenseDTO) {
    const ok = await confirmarAccion({
      titulo: "Descartar registro",
      texto: `¿Descartar la captura de ${fmtMoney(item.monto)}? No se puede deshacer.`,
      confirmar: "Eliminar",
      peligro: true,
      accion: async () => {
        try {
          const res = await fetch(`/api/quick-expenses/${item.id}`, { method: "DELETE" });
          if (!res.ok && res.status !== 204) throw new Error();
        } catch {
          throw new Error("No se pudo descartar el registro.");
        }
      },
    });
    if (!ok) return;
    setItems((cur) => cur.filter((i) => i.id !== item.id));
    notifyQuickExpensesChanged();
  }

  function renderCard(item: QuickExpenseDTO) {
    const pickingObra = obraPickerFor === item.id;
    return (
      <CCard key={item.id} className={item.resuelto ? "opacity-75" : ""}>
        <CCardBody className="d-flex flex-column gap-2">
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <div className="fs-5 fw-bold mono">{fmtMoney(item.monto)}</div>
              <div className="text-body-secondary small">
                {fmtDate(item.fecha)} · <CBadge color="secondary">{item.medioPago}</CBadge>
                {" · "}
                {daysAgo(item.createdAt)}
              </div>
              {item.nota && <div className="mt-1">{item.nota}</div>}
              {item.comprobanteMediaId && (
                <a href={`/api/inbound-media/${item.comprobanteMediaId}`} target="_blank" rel="noopener noreferrer" className="small d-inline-block mt-1">
                  <Icon icon={Paperclip} size={14} className="me-1" />Ver comprobante
                </a>
              )}
            </div>
            {item.resuelto && (
              <CBadge color="success"><Icon icon={CheckCircle} size={14} className="me-1" />Clasificado</CBadge>
            )}
          </div>

          {!item.resuelto && (
            <div className="d-flex flex-column gap-2 mt-1">
              {pickingObra ? (
                <div className="d-flex gap-2 align-items-end flex-wrap">
                  <div style={{ minWidth: 240 }}>
                    <CFormSelect size="sm" value={obraPickerValue} onChange={(e) => setObraPickerValue(e.target.value)}>
                      <option value="">Seleccioná la obra…</option>
                      {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.reference ? ` (${p.reference})` : ""}</option>)}
                    </CFormSelect>
                  </div>
                  <CButton
                    size="sm" color="primary"
                    disabled={!obraPickerValue}
                    onClick={async () => {
                      const projectId = obraPickerValue;
                      if (await stillPending(item)) setObraFormFor({ quickExpense: item, projectId });
                      else { setObraPickerFor(null); setObraPickerValue(""); }
                    }}
                  >
                    Continuar
                  </CButton>
                  <CButton size="sm" color="secondary" variant="ghost" onClick={() => { setObraPickerFor(null); setObraPickerValue(""); }}>
                    Cancelar
                  </CButton>
                </div>
              ) : (
                <div className="d-flex gap-2 flex-wrap">
                  <CButton size="sm" color="primary" variant="outline" onClick={() => { setObraPickerFor(item.id); setObraPickerValue(""); }}>
                    Cargar en una obra
                  </CButton>
                  <CButton size="sm" color="secondary" variant="outline" onClick={async () => { if (await stillPending(item)) setGeneralFormFor(item); }}>
                    Cargar como gasto general
                  </CButton>
                  <CButton size="sm" color="danger" variant="ghost" onClick={() => handleDelete(item)}>
                    <Icon icon={Trash} size={16} label="Eliminar" />
                  </CButton>
                </div>
              )}
            </div>
          )}
        </CCardBody>
      </CCard>
    );
  }

  return (
    <AppShell crumbs={[{ label: "Registro rápido" }]}>
      <h1 className="of-page-title d-flex align-items-center gap-2"><Icon icon={Lightning} size={30} /> Registro rápido</h1>
      <p className="module-desc mb-4">
        Todo lo que fuiste anotando al momento (con el botón &quot;Registro rápido&quot; de arriba), esperando a que lo
        clasifiques. Cada captura ya tiene el monto, la fecha y el medio de pago tal cual pasó — al cargarlo acá como
        movimiento de obra o gasto general, esos datos quedan prellenados, así no tenés que confiar en la memoria para
        que coincida con lo que realmente pagaste.
      </p>

      {loading && <p className="state-message">Cargando…</p>}
      {!loading && error && (
        <div className="of-empty">
          <p className="of-empty-title">{error}</p>
          <CButton color="primary" variant="outline" size="sm" onClick={load}>Reintentar</CButton>
        </div>
      )}

      {!loading && !error && (
        <>
          <h2 className="h5 fw-semibold mb-3">
            Pendientes {pendientes.length > 0 && <CBadge color="warning">{pendientes.length}</CBadge>}
          </h2>
          {pendientes.length === 0 ? (
            <p className="empty-col mb-4">No tenés capturas sin clasificar: estás al día.</p>
          ) : (
            <div className="d-flex flex-column gap-3 mb-4">
              {pendientes.map(renderCard)}
            </div>
          )}

          <button type="button" className="btn btn-sm btn-link px-0 mb-2" onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? "Ocultar" : "Ver"} las {resueltos.length} ya clasificadas
          </button>
          {showResolved && (
            <div className="d-flex flex-column gap-3">
              {resueltos.map(renderCard)}
            </div>
          )}
        </>
      )}

      {obraFormFor && (
        <ItemFormModal
          projectId={obraFormFor.projectId}
          kind="change_order"
          existing={null}
          // La captura ya es un pago hecho (efectivo/transferencia), no algo a pagar.
          initialStatus="Pagado"
          contextLabel={(() => {
            const p = projects.find((x) => x.id === obraFormFor.projectId);
            return p ? `${p.name}${p.reference ? ` (${p.reference})` : ""}` : undefined;
          })()}
          initialData={{
            monto: obraFormFor.quickExpense.monto,
            fecha: obraFormFor.quickExpense.fecha,
            medioPago: obraFormFor.quickExpense.medioPago,
            notas: obraFormFor.quickExpense.nota ?? "",
          }}
          showToast={(m) => notificar(m, "error")}
          onClose={() => setObraFormFor(null)}
          onSaved={handleObraSaved}
        />
      )}

      {generalFormFor && (
        <GeneralMovementFormModal
          editing={null}
          existingResponsables={[]}
          initialData={{
            tipo: "egreso",
            estado: "Pagado",
            fecha: generalFormFor.fecha,
            monto: generalFormFor.monto,
            medioPago: generalFormFor.medioPago,
            notas: generalFormFor.nota ?? "",
            comprobanteMediaId: generalFormFor.comprobanteMediaId,
          }}
          onClose={() => setGeneralFormFor(null)}
          onSaved={handleGeneralSaved}
        />
      )}
    </AppShell>
  );
}
