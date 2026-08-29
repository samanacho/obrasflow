"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CCard, CCardBody, CCardHeader, CButton, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea, CBadge, CAlert, CListGroup, CListGroupItem, CRow, CCol,
  CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilPlus, cilPencil, cilTrash } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import { LOT_STATUS_ORDER, LOT_STATUS_LABEL, LOT_STATUS_COLOR, TEST_TIPOS, TEST_RESULTADOS, TEST_RESULTADO_COLOR } from "@/lib/poleFields";
import { fmtGs } from "@/lib/currency";
import { fechaFiscalizacionEstimada } from "@/lib/factoryCapacity";
import type { PoleLotDTO, PoleLotInput, PoleLotStatus, PoleSpecDTO, PoleQualityTestInput } from "@/lib/types";

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const EMPTY_TEST: PoleQualityTestInput = { tipo: "", resultado: "Pendiente", fecha: new Date().toISOString().slice(0, 10), valorMedido: "", responsable: "", observaciones: "" };

export default function PoleLotDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [lot, setLot] = useState<PoleLotDTO | null>(null);
  const [specs, setSpecs] = useState<PoleSpecDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  // Edición del lote
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<PoleLotInput | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Ensayos
  const [testForm, setTestForm] = useState<PoleQualityTestInput>(EMPTY_TEST);
  const [showTestForm, setShowTestForm] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [savingTest, setSavingTest] = useState(false);
  const [confirmTestId, setConfirmTestId] = useState<string | null>(null);
  const [deletingTest, setDeletingTest] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [lotRes, specsRes] = await Promise.all([fetch(`/api/postes/lots/${id}`), fetch("/api/postes/specs")]);
      if (!lotRes.ok) throw new Error(`HTTP ${lotRes.status}`);
      setLot(await lotRes.json());
      setSpecs(specsRes.ok ? await specsRes.json() : []);
    } catch {
      setError("No se pudo cargar el lote.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [id]);

  function openEdit() {
    if (!lot) return;
    setEditError(null);
    setEditForm({
      specId: lot.specId, codigo: lot.codigo, cantidad: lot.cantidad, cantidadParaEnsayo: lot.cantidadParaEnsayo,
      cantidadDespachada: lot.cantidadDespachada,
      fechaColado: lot.fechaColado, fechaDesmolde: lot.fechaDesmolde ?? "", estado: lot.estado,
      responsable: lot.responsable ?? "", ciudadDestino: lot.ciudadDestino ?? "",
      andeAprobado: lot.andeAprobado, andeFecha: lot.andeFecha ?? "",
      andeActa: lot.andeActa ?? "", andeInspector: lot.andeInspector ?? "", numeracionAnde: lot.numeracionAnde ?? "",
      notas: lot.notas ?? "",
    });
    setEditOpen(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm) return;
    if (!editForm.specId) { setEditError("Elegí una especificación."); return; }
    if (!editForm.codigo.trim()) { setEditError("Cargá el código del lote."); return; }
    if (!editForm.cantidad || editForm.cantidad <= 0) { setEditError("La cantidad tiene que ser mayor a 0."); return; }
    if (!editForm.fechaColado) { setEditError("Cargá la fecha de colado."); return; }
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/postes/lots/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setLot(await res.json());
      setEditOpen(false);
    } catch (err: any) {
      setEditError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/postes/lots/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      router.push("/postes?tab=lotes");
    } catch {
      setDeleting(false);
      setDeleteError("No se pudo eliminar el lote. Probá de nuevo.");
    }
  }

  async function handleTestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!testForm.tipo) { setTestError("Elegí el tipo de ensayo."); return; }
    if (!testForm.fecha) { setTestError("Cargá la fecha."); return; }
    setSavingTest(true);
    setTestError(null);
    try {
      const res = await fetch(`/api/postes/lots/${id}/tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setShowTestForm(false);
      setTestForm(EMPTY_TEST);
      load();
    } catch (err: any) {
      setTestError(err.message || "No se pudo guardar el ensayo.");
    } finally {
      setSavingTest(false);
    }
  }

  async function performDeleteTest(testId: string) {
    setDeletingTest(true);
    try {
      const res = await fetch(`/api/postes/tests/${testId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setConfirmTestId(null);
      load();
    } catch {
      showToast("No se pudo eliminar el ensayo.");
    } finally {
      setDeletingTest(false);
    }
  }

  if (loading) return <AppShell crumbs={[{ label: "Fábrica de Postes", href: "/postes" }]}><p className="state-message">Cargando…</p></AppShell>;
  if (error || !lot) return <AppShell crumbs={[{ label: "Fábrica de Postes", href: "/postes" }]}><p className="state-message form-error">{error || "Lote no encontrado."}</p></AppShell>;

  const disponible = Math.max(0, lot.cantidad - lot.cantidadParaEnsayo - lot.cantidadDespachada);

  return (
    <AppShell
      crumbs={[{ label: "Fábrica de Postes", href: "/postes" }, { label: lot.codigo }]}
      headerActions={
        <>
          <CButton color="secondary" variant="outline" size="sm" onClick={openEdit}>
            <CIcon icon={cilPencil} className="me-1" /> Editar
          </CButton>
          <CButton color="danger" variant="outline" size="sm" onClick={() => { setDeleteError(null); setConfirmDeleteOpen(true); }} disabled={deleting}>
            <CIcon icon={cilTrash} className="me-1" /> {deleting ? "Eliminando…" : "Eliminar"}
          </CButton>
        </>
      }
    >
      <div className="project-hero">
        <div>
          <h1 className="of-page-title mb-2">{lot.codigo}</h1>
          <div className="project-hero-meta">
            <CBadge color={LOT_STATUS_COLOR[lot.estado]}>{LOT_STATUS_LABEL[lot.estado]}</CBadge>
            {lot.andeAprobado && <CBadge color="success">ANDE aprobado</CBadge>}
            <span>{lot.specNombre}</span>
          </div>
          <div className="text-body-secondary small mono mt-1">ID: {lot.id}</div>
        </div>
        <div className="project-hero-kpis">
          <CCard><CCardBody><div className="label">Cantidad</div><div className="value mono">{lot.cantidad}</div><div className="sub">postes en el lote</div></CCardBody></CCard>
          <CCard><CCardBody><div className="label">Despachados</div><div className="value mono">{lot.cantidadDespachada}</div><div className="sub">ya entregados</div></CCardBody></CCard>
          <CCard><CCardBody><div className="label">Disponible</div><div className="value mono">{disponible}</div><div className="sub">listos para despacho</div></CCardBody></CCard>
          <CCard><CCardBody><div className="label">Para ensayo</div><div className="value mono">{lot.cantidadParaEnsayo}</div><div className="sub">reservados (destructivo)</div></CCardBody></CCard>
        </div>
      </div>

      <CRow className="g-3 mb-4">
        <CCol md={6}>
          <CCard className="h-100">
            <CCardHeader className="fw-semibold">Producción</CCardHeader>
            <CCardBody>
              <CRow className="g-3">
                <CCol xs={6}><span className="module-desc">Fecha de colado</span><div>{fmtDate(lot.fechaColado)}</div></CCol>
                <CCol xs={6}><span className="module-desc">Fecha de desmolde</span><div>{fmtDate(lot.fechaDesmolde)}</div></CCol>
                <CCol xs={6}><span className="module-desc">Responsable</span><div>{lot.responsable || "—"}</div></CCol>
                <CCol xs={6}><span className="module-desc">Ciudad de destino</span><div>{lot.ciudadDestino || "—"}</div></CCol>
                {lot.notas && <CCol xs={12}><span className="module-desc">Notas</span><div className="item-row-notes">{lot.notas}</div></CCol>}
              </CRow>
            </CCardBody>
          </CCard>
        </CCol>
        <CCol md={6}>
          <CCard className="h-100">
            <CCardHeader className="fw-semibold">Aprobación ANDE</CCardHeader>
            <CCardBody>
              {!lot.andeAprobado && (() => {
                const estimada = fechaFiscalizacionEstimada(lot.fechaColado);
                const hoy = new Date();
                const msPorDia = 86400000;
                const diffDias = Math.ceil((estimada.getTime() - hoy.getTime()) / msPorDia);
                const yaPaso = diffDias <= 0;
                return (
                  <div>
                    {yaPaso ? (
                      <>
                        <CBadge color="success">Lista para fiscalizar</CBadge>
                        <div className="mt-2">Fiscalización estimada: {fmtDate(estimada.toISOString().slice(0, 10))} ({Math.abs(diffDias) === 0 ? "hoy" : `hace ${Math.abs(diffDias)} día${Math.abs(diffDias) === 1 ? "" : "s"}`})</div>
                      </>
                    ) : (
                      <>
                        <CBadge color="info">Faltan {diffDias} día{diffDias === 1 ? "" : "s"}</CBadge>
                        <div className="mt-2">Fiscalización estimada: {fmtDate(estimada.toISOString().slice(0, 10))}</div>
                      </>
                    )}
                    <p className="empty-col mt-2 mb-0 small">Todavía sin aprobación ANDE cargada. Esto es una estimación, no la aprobación real.</p>
                  </div>
                );
              })()}
              {lot.andeAprobado && (
                <CRow className="g-3">
                  <CCol xs={6}><span className="module-desc">Fecha</span><div>{fmtDate(lot.andeFecha)}</div></CCol>
                  <CCol xs={6}><span className="module-desc">N° de acta</span><div>{lot.andeActa || "—"}</div></CCol>
                  <CCol xs={12}><span className="module-desc">Inspector</span><div>{lot.andeInspector || "—"}</div></CCol>
                  <CCol xs={12}><span className="module-desc">Numeración ANDE asignada</span><div>{lot.numeracionAnde || "—"}</div></CCol>
                </CRow>
              )}
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      <CCard className="mb-4">
        <CCardHeader className="module-panel-head">
          <div>
            <span className="fw-semibold fs-5">Consumo de materia prima</span>
            <p className="module-desc mb-0">Calculado automáticamente a partir de la receta de la especificación al momento de crear este lote — el costo queda congelado aunque el precio de mercado cambie después.</p>
          </div>
        </CCardHeader>
        <CCardBody>
          {lot.materialConsumptions.length === 0 && (
            <p className="empty-col">Este lote no tiene consumo de materia prima registrado (la especificación no tenía receta cargada al momento de crear el lote).</p>
          )}
          {lot.materialConsumptions.length > 0 && (
            <>
              <div className="table-wrap">
                <CTable hover responsive>
                  <CTableHead>
                    <CTableRow>
                      <CTableHeaderCell>Material</CTableHeaderCell>
                      <CTableHeaderCell>Unidad</CTableHeaderCell>
                      <CTableHeaderCell>Cantidad por poste</CTableHeaderCell>
                      <CTableHeaderCell>Cantidad total</CTableHeaderCell>
                      <CTableHeaderCell>Costo unitario (Gs)</CTableHeaderCell>
                      <CTableHeaderCell>Costo total (Gs)</CTableHeaderCell>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {lot.materialConsumptions.map((c) => (
                      <CTableRow key={c.id}>
                        <CTableDataCell className="fw-semibold">{c.materialNombre}</CTableDataCell>
                        <CTableDataCell>{c.unidad}</CTableDataCell>
                        <CTableDataCell className="mono">{c.cantidadPorPoste}</CTableDataCell>
                        <CTableDataCell className="mono">{c.cantidadTotal}</CTableDataCell>
                        <CTableDataCell className="mono">{fmtGs(c.costoUnitarioGs)}</CTableDataCell>
                        <CTableDataCell className="mono">{fmtGs(c.costoTotalGs)}</CTableDataCell>
                      </CTableRow>
                    ))}
                  </CTableBody>
                </CTable>
              </div>
              <p className="fw-semibold fs-5 mt-3 mb-0">Costo total de materia prima: {fmtGs(lot.costoMaterialTotalGs)}</p>
            </>
          )}
        </CCardBody>
      </CCard>

      <CCard>
        <CCardHeader className="module-panel-head">
          <div>
            <span className="fw-semibold fs-5">Ensayos de calidad</span>
            <p className="module-desc mb-0">Ruptura/flexión, verificación dimensional, curado — un registro por ensayo hecho sobre este lote.</p>
          </div>
          <CButton color="primary" size="sm" onClick={() => { setTestError(null); setTestForm(EMPTY_TEST); setShowTestForm(true); }}>
            <CIcon icon={cilPlus} className="me-1" /> Agregar ensayo
          </CButton>
        </CCardHeader>
        <CCardBody>
          {lot.tests.length === 0 && <p className="empty-col">Sin ensayos todavía.</p>}
          <CListGroup>
            {lot.tests.map((t) => (
              <CListGroupItem key={t.id} className="item-row border-0 border-bottom rounded-0 px-0">
                <div className="item-row-main">
                  <span className="item-title">{t.tipo}</span>
                  <CBadge color={TEST_RESULTADO_COLOR[t.resultado] ?? "secondary"}>{t.resultado}</CBadge>
                </div>
                <div className="item-row-sub">
                  {fmtDate(t.fecha)}{t.valorMedido ? ` · ${t.valorMedido}` : ""}{t.responsable ? ` · ${t.responsable}` : ""}
                </div>
                {t.observaciones && <div className="item-row-notes">{t.observaciones}</div>}
                <div className="item-row-actions">
                  <CButton size="sm" color="danger" variant="outline" onClick={() => setConfirmTestId(t.id)}><CIcon icon={cilTrash} size="sm" /></CButton>
                </div>
              </CListGroupItem>
            ))}
          </CListGroup>
        </CCardBody>
      </CCard>

      {showTestForm && (
        <CModal visible onClose={() => setShowTestForm(false)} alignment="center">
          <CModalHeader><CModalTitle>Nuevo ensayo</CModalTitle></CModalHeader>
          <CForm onSubmit={handleTestSubmit}>
            <CModalBody>
              {testError && <CAlert color="danger">{testError}</CAlert>}
              <div className="mb-3">
                <CFormLabel>Tipo de ensayo</CFormLabel>
                <CFormSelect value={testForm.tipo} onChange={(e) => setTestForm({ ...testForm, tipo: e.target.value })} required>
                  <option value="">Seleccioná…</option>
                  {TEST_TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                </CFormSelect>
              </div>
              <CRow className="mb-3 g-2">
                <CCol>
                  <CFormLabel>Resultado</CFormLabel>
                  <CFormSelect value={testForm.resultado} onChange={(e) => setTestForm({ ...testForm, resultado: e.target.value })}>
                    {TEST_RESULTADOS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </CFormSelect>
                </CCol>
                <CCol>
                  <CFormLabel>Fecha</CFormLabel>
                  <CFormInput type="date" value={testForm.fecha} onChange={(e) => setTestForm({ ...testForm, fecha: e.target.value })} required />
                </CCol>
              </CRow>
              <CRow className="mb-3 g-2">
                <CCol>
                  <CFormLabel>Valor medido (opcional)</CFormLabel>
                  <CFormInput placeholder="Ej. 520 kgf" value={testForm.valorMedido ?? ""} onChange={(e) => setTestForm({ ...testForm, valorMedido: e.target.value })} />
                </CCol>
                <CCol>
                  <CFormLabel>Responsable</CFormLabel>
                  <CFormInput value={testForm.responsable ?? ""} onChange={(e) => setTestForm({ ...testForm, responsable: e.target.value })} />
                </CCol>
              </CRow>
              <div className="mb-1">
                <CFormLabel>Observaciones</CFormLabel>
                <CFormTextarea rows={2} value={testForm.observaciones ?? ""} onChange={(e) => setTestForm({ ...testForm, observaciones: e.target.value })} />
              </div>
            </CModalBody>
            <CModalFooter>
              <CButton color="secondary" variant="ghost" onClick={() => setShowTestForm(false)}>Cancelar</CButton>
              <CButton color="primary" type="submit" disabled={savingTest}>{savingTest ? "Guardando…" : "Guardar"}</CButton>
            </CModalFooter>
          </CForm>
        </CModal>
      )}

      {editForm && (
        <CModal visible={editOpen} onClose={() => setEditOpen(false)} alignment="center" size="lg">
          <CModalHeader><CModalTitle>Editar lote</CModalTitle></CModalHeader>
          <CForm onSubmit={handleEditSubmit}>
            <CModalBody>
              {editError && <CAlert color="danger">{editError}</CAlert>}
              <CRow className="mb-3 g-2">
                <CCol md={8}>
                  <CFormLabel>Especificación</CFormLabel>
                  <CFormSelect value={editForm.specId} onChange={(e) => setEditForm({ ...editForm, specId: e.target.value })} required>
                    {specs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </CFormSelect>
                </CCol>
                <CCol md={4}>
                  <CFormLabel>Código de lote</CFormLabel>
                  <CFormInput value={editForm.codigo} onChange={(e) => setEditForm({ ...editForm, codigo: e.target.value })} required />
                </CCol>
              </CRow>
              <CRow className="mb-3 g-2">
                <CCol>
                  <CFormLabel>Cantidad de postes</CFormLabel>
                  <CFormInput type="number" min={1} step={1} value={editForm.cantidad || ""} onChange={(e) => setEditForm({ ...editForm, cantidad: Number(e.target.value) })} required />
                </CCol>
                <CCol>
                  <CFormLabel>Para ensayo (destructivo)</CFormLabel>
                  <CFormInput type="number" min={0} step={1} value={editForm.cantidadParaEnsayo ?? 0} onChange={(e) => setEditForm({ ...editForm, cantidadParaEnsayo: Number(e.target.value) })} />
                </CCol>
                <CCol>
                  <CFormLabel>Despachados</CFormLabel>
                  <CFormInput type="number" min={0} step={1} value={editForm.cantidadDespachada || 0} onChange={(e) => setEditForm({ ...editForm, cantidadDespachada: Number(e.target.value) })} />
                </CCol>
                <CCol>
                  <CFormLabel>Estado</CFormLabel>
                  <CFormSelect value={editForm.estado} onChange={(e) => setEditForm({ ...editForm, estado: e.target.value as PoleLotStatus })}>
                    {LOT_STATUS_ORDER.map((e) => <option key={e} value={e}>{LOT_STATUS_LABEL[e]}</option>)}
                  </CFormSelect>
                </CCol>
              </CRow>
              <CRow className="mb-3 g-2">
                <CCol>
                  <CFormLabel>Fecha de colado</CFormLabel>
                  <CFormInput type="date" value={editForm.fechaColado} onChange={(e) => setEditForm({ ...editForm, fechaColado: e.target.value })} required />
                </CCol>
                <CCol>
                  <CFormLabel>Fecha de desmolde</CFormLabel>
                  <CFormInput type="date" value={editForm.fechaDesmolde ?? ""} onChange={(e) => setEditForm({ ...editForm, fechaDesmolde: e.target.value })} />
                </CCol>
                <CCol>
                  <CFormLabel>Responsable</CFormLabel>
                  <CFormInput value={editForm.responsable ?? ""} onChange={(e) => setEditForm({ ...editForm, responsable: e.target.value })} />
                </CCol>
                <CCol>
                  <CFormLabel>Ciudad de destino</CFormLabel>
                  <CFormInput value={editForm.ciudadDestino ?? ""} onChange={(e) => setEditForm({ ...editForm, ciudadDestino: e.target.value })} />
                </CCol>
              </CRow>
              <hr />
              <p className="module-desc mb-2">Aprobación ANDE</p>
              <div className="mb-3 form-check">
                <input className="form-check-input" type="checkbox" id="edit-lot-ande" checked={editForm.andeAprobado ?? false} onChange={(e) => setEditForm({ ...editForm, andeAprobado: e.target.checked })} />
                <label className="form-check-label" htmlFor="edit-lot-ande">Lote aprobado por ANDE</label>
              </div>
              <CRow className="mb-3 g-2">
                <CCol>
                  <CFormLabel>Fecha de aprobación</CFormLabel>
                  <CFormInput type="date" value={editForm.andeFecha ?? ""} onChange={(e) => setEditForm({ ...editForm, andeFecha: e.target.value })} />
                </CCol>
                <CCol>
                  <CFormLabel>N° de acta</CFormLabel>
                  <CFormInput value={editForm.andeActa ?? ""} onChange={(e) => setEditForm({ ...editForm, andeActa: e.target.value })} />
                </CCol>
                <CCol>
                  <CFormLabel>Inspector</CFormLabel>
                  <CFormInput value={editForm.andeInspector ?? ""} onChange={(e) => setEditForm({ ...editForm, andeInspector: e.target.value })} />
                </CCol>
                <CCol>
                  <CFormLabel>Numeración ANDE asignada</CFormLabel>
                  <CFormInput placeholder="Ej. Del 004521 al 004620" value={editForm.numeracionAnde ?? ""} onChange={(e) => setEditForm({ ...editForm, numeracionAnde: e.target.value })} />
                </CCol>
              </CRow>
              <div className="mb-1">
                <CFormLabel>Notas</CFormLabel>
                <CFormTextarea rows={2} value={editForm.notas ?? ""} onChange={(e) => setEditForm({ ...editForm, notas: e.target.value })} />
              </div>
            </CModalBody>
            <CModalFooter>
              <CButton color="secondary" variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</CButton>
              <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
            </CModalFooter>
          </CForm>
        </CModal>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Eliminar lote"
        message={`¿Eliminar el lote "${lot.codigo}"? Esta acción no se puede deshacer.`}
        busy={deleting}
        error={deleteError}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
      <ConfirmDialog
        open={confirmTestId !== null}
        title="Eliminar ensayo"
        message="¿Eliminar este ensayo? Esta acción no se puede deshacer."
        busy={deletingTest}
        onConfirm={() => confirmTestId && performDeleteTest(confirmTestId)}
        onCancel={() => setConfirmTestId(null)}
      />
      <Toast message={toast} />
    </AppShell>
  );
}
