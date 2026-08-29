"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CCard, CCardBody, CCardHeader, CNav, CNavItem, CNavLink,
  CButton, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea, CFormCheck,
  CBadge, CAlert, CRow, CCol,
  CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell,
} from "@coreui/react";
import { CChartDoughnut } from "@coreui/react-chartjs";
import CIcon from "@coreui/icons-react";
import { cilPlus, cilPencil, cilTrash } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast from "@/components/Toast";
import { useToast } from "@/lib/useToast";
import { LOT_STATUS_ORDER, LOT_STATUS_LABEL, LOT_STATUS_COLOR, COMMON_UNITS, PURCHASE_DOC_TYPE_ORDER, PURCHASE_DOC_TYPE_LABEL } from "@/lib/poleFields";
import { fmtGs } from "@/lib/currency";
import type { PoleSpecDTO, PoleSpecInput, PoleLotDTO, PoleLotInput, PoleLotStatus, RawMaterialDTO, RawMaterialInput, MaterialPurchaseDTO, MaterialPurchaseInput } from "@/lib/types";

const POSTES_TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "specs", label: "Especificaciones" },
  { key: "materiales", label: "Materias primas" },
  { key: "compras", label: "Compras" },
  { key: "lotes", label: "Lotes de producción" },
] as const;
type PostesTab = (typeof POSTES_TABS)[number]["key"];

const EMPTY_SPEC: PoleSpecInput = {
  nombre: "", longitud: 0, esfuerzoNominal: 0, diametroBase: null,
  resistenciaHormigon: "", armadura: "", normaAnde: "", notas: "", activo: true,
};

const EMPTY_MATERIAL: RawMaterialInput = {
  nombre: "", unidad: "", costoUnitarioGs: 0, proveedor: "", notas: "", activo: true,
};

function emptyLot(specId = ""): PoleLotInput {
  return {
    specId, codigo: "", cantidad: 0, cantidadParaEnsayo: 1, cantidadDespachada: 0,
    fechaColado: "", fechaDesmolde: "", estado: "en_curado",
    responsable: "", ciudadDestino: "", andeAprobado: false, andeFecha: "", andeActa: "", andeInspector: "", numeracionAnde: "", notas: "",
  };
}

const EMPTY_PURCHASE: MaterialPurchaseInput = {
  materialId: "", fecha: new Date().toISOString().slice(0, 10), cantidad: 0, costoUnitarioGs: 0,
  proveedor: "", tipoDocumento: "factura", numeroDocumento: "", notas: "",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

/**
 * Fábrica de Postes — control de producción de postes de hormigón bajo
 * especificaciones técnicas de ANDE. Dominio propio (no son "obras"), con
 * su propio modelo relacional (prisma/schema.prisma: PoleSpec/PoleLot/
 * PoleQualityTest) en vez del patrón ProjectItem/JSON que usan los
 * módulos de proyecto.
 *
 * No hay una tabla de "clases ANDE oficiales" hardcodeada: la nomenclatura
 * exacta varía y el usuario carga acá las especificaciones reales que
 * produce (ver lib/poleFields.ts para el detalle de qué se investigó).
 */
export default function PostesPage() {
  const [tab, setTab] = useState<PostesTab>("resumen");
  const [specs, setSpecs] = useState<PoleSpecDTO[]>([]);
  const [lots, setLots] = useState<PoleLotDTO[]>([]);
  const [materials, setMaterials] = useState<RawMaterialDTO[]>([]);
  const [purchases, setPurchases] = useState<MaterialPurchaseDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();

  async function loadAll() {
    setLoading(true);
    try {
      const [specsRes, lotsRes, materialsRes, purchasesRes] = await Promise.all([
        fetch("/api/postes/specs"),
        fetch("/api/postes/lots"),
        fetch("/api/postes/materials"),
        fetch("/api/postes/purchases"),
      ]);
      setSpecs(specsRes.ok ? await specsRes.json() : []);
      setLots(lotsRes.ok ? await lotsRes.json() : []);
      setMaterials(materialsRes.ok ? await materialsRes.json() : []);
      setPurchases(purchasesRes.ok ? await purchasesRes.json() : []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadAll(); }, []);

  return (
    <AppShell crumbs={[{ label: "Fábrica de Postes" }]}>
      <h1 className="of-page-title">🏭 Fábrica de Postes</h1>
      <p className="module-desc mb-4">Control de producción de postes de hormigón bajo especificaciones técnicas de la ANDE.</p>

      <CNav variant="underline" className="mb-4">
        {POSTES_TABS.map((t) => (
          <CNavItem key={t.key}>
            <CNavLink active={tab === t.key} onClick={() => setTab(t.key)} style={{ cursor: "pointer" }}>
              {t.label}
            </CNavLink>
          </CNavItem>
        ))}
      </CNav>

      {loading && <p className="state-message">Cargando…</p>}

      {!loading && tab === "resumen" && <ResumenView specs={specs} lots={lots} />}
      {!loading && tab === "specs" && <SpecsView specs={specs} onChanged={loadAll} showToast={showToast} />}
      {!loading && tab === "materiales" && <MaterialesView materials={materials} onChanged={loadAll} showToast={showToast} />}
      {!loading && tab === "compras" && <PurchasesView purchases={purchases} materials={materials} onChanged={loadAll} showToast={showToast} />}
      {!loading && tab === "lotes" && <LotesView lots={lots} specs={specs} onChanged={loadAll} showToast={showToast} />}

      <Toast message={toast} />
    </AppShell>
  );
}

function ResumenView({ specs, lots }: { specs: PoleSpecDTO[]; lots: PoleLotDTO[] }) {
  const specsActivos = specs.filter((s) => s.activo).length;
  const enProceso = lots.filter((l) => l.estado === "en_curado" || l.estado === "listo_para_ensayo" || l.estado === "en_ensayo").length;
  const aprobados = lots.filter((l) => l.estado === "aprobado").length;
  const rechazados = lots.filter((l) => l.estado === "rechazado").length;
  const stockDisponible = lots
    .filter((l) => l.estado === "aprobado")
    .reduce((sum, l) => sum + Math.max(0, l.cantidad - l.cantidadParaEnsayo - l.cantidadDespachada), 0);
  const costoMaterialConsumido = lots.reduce((sum, l) => sum + l.costoMaterialTotalGs, 0);

  const porEstado = LOT_STATUS_ORDER.map((e) => ({ estado: e, count: lots.filter((l) => l.estado === e).length })).filter((x) => x.count > 0);
  const isDark = typeof document !== "undefined" && document.documentElement.getAttribute("data-coreui-theme") === "dark";
  const tickColor = isDark ? "#a39e93" : "#75726a";
  const chartColors = isDark
    ? ["#b3ac9e", "#8ca9c2", "#d3af6e", "#8fb491", "#c98980", "#b3a4cc"]
    : ["#726c61", "#4a6b85", "#a9803d", "#5f8362", "#a0564d", "#8172a3"];

  return (
    <>
      <div className="row g-3 mb-4">
        <div className="col-md-3 col-6">
          <CCard className="h-100"><CCardBody>
            <div className="text-uppercase text-body-secondary small mb-1">Especificaciones activas</div>
            <div className="fs-3 fw-bold mono">{specsActivos}</div>
            <div className="text-body-secondary small">de {specs.length} cargadas</div>
          </CCardBody></CCard>
        </div>
        <div className="col-md-3 col-6">
          <CCard className="h-100"><CCardBody>
            <div className="text-uppercase text-body-secondary small mb-1">Lotes en proceso</div>
            <div className="fs-3 fw-bold mono">{enProceso}</div>
            <div className="text-body-secondary small">curado, ensayo pendiente o en curso</div>
          </CCardBody></CCard>
        </div>
        <div className="col-md-3 col-6">
          <CCard className="h-100"><CCardBody>
            <div className="text-uppercase text-body-secondary small mb-1">Lotes aprobados</div>
            <div className="fs-3 fw-bold mono">{aprobados}</div>
            <div className={"text-body-secondary small" + (rechazados ? " alert-text" : "")}>{rechazados} rechazado{rechazados === 1 ? "" : "s"}</div>
          </CCardBody></CCard>
        </div>
        <div className="col-md-3 col-6">
          <CCard className="h-100"><CCardBody>
            <div className="text-uppercase text-body-secondary small mb-1">Postes en stock</div>
            <div className="fs-3 fw-bold mono">{stockDisponible}</div>
            <div className="text-body-secondary small">aprobados, listos para despacho</div>
          </CCardBody></CCard>
        </div>
        <div className="col-md-3 col-6">
          <CCard className="h-100"><CCardBody>
            <div className="text-uppercase text-body-secondary small mb-1">Costo de materia prima consumida</div>
            <div className="fs-3 fw-bold mono">{fmtGs(costoMaterialConsumido)}</div>
            <div className="text-body-secondary small">en todos los lotes producidos</div>
          </CCardBody></CCard>
        </div>
      </div>

      {porEstado.length > 0 && (
        <CCard>
          <CCardHeader className="fw-semibold">Lotes por estado</CCardHeader>
          <CCardBody className="d-flex align-items-center justify-content-center">
            <CChartDoughnut
              style={{ maxHeight: 260 }}
              data={{
                labels: porEstado.map((x) => LOT_STATUS_LABEL[x.estado]),
                datasets: [{ data: porEstado.map((x) => x.count), backgroundColor: porEstado.map((_, i) => chartColors[i % chartColors.length]) }],
              }}
              options={{ plugins: { legend: { position: "bottom", labels: { color: tickColor } } } }}
            />
          </CCardBody>
        </CCard>
      )}
      {porEstado.length === 0 && <p className="empty-col">Todavía no hay lotes cargados.</p>}
    </>
  );
}

function SpecsView({
  specs, onChanged, showToast,
}: {
  specs: PoleSpecDTO[];
  onChanged: () => void;
  showToast: (m: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PoleSpecDTO | null>(null);
  const [form, setForm] = useState<PoleSpecInput>(EMPTY_SPEC);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<PoleSpecDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openModal(s: PoleSpecDTO | null) {
    setFormError(null);
    setEditing(s);
    setForm(
      s
        ? { nombre: s.nombre, longitud: s.longitud, esfuerzoNominal: s.esfuerzoNominal, diametroBase: s.diametroBase, resistenciaHormigon: s.resistenciaHormigon ?? "", armadura: s.armadura ?? "", normaAnde: s.normaAnde ?? "", notas: s.notas ?? "", activo: s.activo }
        : EMPTY_SPEC
    );
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) { setFormError("El nombre es obligatorio."); return; }
    if (!form.longitud || form.longitud <= 0) { setFormError("Cargá la longitud (metros)."); return; }
    if (!form.esfuerzoNominal || form.esfuerzoNominal <= 0) { setFormError("Cargá el esfuerzo nominal (kgf)."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const url = editing ? `/api/postes/specs/${editing.id}` : "/api/postes/specs";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setModalOpen(false);
      onChanged();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function performDelete(s: PoleSpecDTO) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/postes/specs/${s.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setConfirmTarget(null);
      onChanged();
    } catch (err: any) {
      setDeleteError(err.message || "No se pudo eliminar.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <CCard>
      <CCardHeader className="module-panel-head">
        <div>
          <span className="fw-semibold fs-5">Especificaciones técnicas</span>
          <p className="module-desc mb-0">Catálogo de tipos de poste que produce la fábrica — longitud, esfuerzo nominal, diámetro y calidad del hormigón.</p>
        </div>
        <CButton color="primary" size="sm" onClick={() => openModal(null)}>
          <CIcon icon={cilPlus} className="me-1" /> Nueva especificación
        </CButton>
      </CCardHeader>
      <CCardBody>
        {specs.length === 0 && <p className="empty-col">Sin especificaciones todavía. Cargá la primera con &quot;+ Nueva especificación&quot;.</p>}
        {specs.length > 0 && (
          <div className="table-wrap">
            <CTable hover responsive>
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Nombre</CTableHeaderCell>
                  <CTableHeaderCell>Longitud (m)</CTableHeaderCell>
                  <CTableHeaderCell>Esfuerzo nominal (kgf)</CTableHeaderCell>
                  <CTableHeaderCell>Diámetro base (cm)</CTableHeaderCell>
                  <CTableHeaderCell>Hormigón</CTableHeaderCell>
                  <CTableHeaderCell>Costo est./poste</CTableHeaderCell>
                  <CTableHeaderCell>Lotes</CTableHeaderCell>
                  <CTableHeaderCell>Estado</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Acciones</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {specs.map((s) => (
                  <CTableRow key={s.id}>
                    <CTableDataCell className="fw-semibold"><Link href={`/postes/specs/${s.id}`}>{s.nombre} ↗</Link></CTableDataCell>
                    <CTableDataCell className="mono">{s.longitud}</CTableDataCell>
                    <CTableDataCell className="mono">{s.esfuerzoNominal}</CTableDataCell>
                    <CTableDataCell className="mono">{s.diametroBase ?? "—"}</CTableDataCell>
                    <CTableDataCell>{s.resistenciaHormigon || "—"}</CTableDataCell>
                    <CTableDataCell className="mono">{fmtGs(s.costoEstimadoPorPosteGs)}</CTableDataCell>
                    <CTableDataCell className="mono">{s.lotCount}</CTableDataCell>
                    <CTableDataCell><CBadge color={s.activo ? "success" : "secondary"}>{s.activo ? "Activa" : "Inactiva"}</CBadge></CTableDataCell>
                    <CTableDataCell className="text-end">
                      <CButton size="sm" color="secondary" variant="outline" className="me-1" onClick={() => openModal(s)}><CIcon icon={cilPencil} size="sm" /></CButton>
                      <CButton size="sm" color="danger" variant="outline" onClick={() => { setDeleteError(null); setConfirmTarget(s); }}><CIcon icon={cilTrash} size="sm" /></CButton>
                    </CTableDataCell>
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          </div>
        )}
      </CCardBody>

      <CModal visible={modalOpen} onClose={() => setModalOpen(false)} alignment="center" size="lg">
        <CModalHeader><CModalTitle>{editing ? "Editar" : "Nueva"} especificación</CModalTitle></CModalHeader>
        <CForm onSubmit={handleSubmit}>
          <CModalBody>
            {formError && <CAlert color="danger">{formError}</CAlert>}
            <div className="mb-3">
              <CFormLabel>Nombre</CFormLabel>
              <CFormInput placeholder="Ej. Poste 9m — 500 kgf" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            </div>
            <CRow className="mb-3 g-2">
              <CCol>
                <CFormLabel>Longitud (m)</CFormLabel>
                <CFormInput type="number" step="0.1" min={0} value={form.longitud || ""} onChange={(e) => setForm({ ...form, longitud: Number(e.target.value) })} required />
              </CCol>
              <CCol>
                <CFormLabel>Esfuerzo nominal (kgf)</CFormLabel>
                <CFormInput type="number" step="1" min={0} value={form.esfuerzoNominal || ""} onChange={(e) => setForm({ ...form, esfuerzoNominal: Number(e.target.value) })} required />
              </CCol>
              <CCol>
                <CFormLabel>Diámetro en la base (cm)</CFormLabel>
                <CFormInput type="number" step="0.1" min={0} value={form.diametroBase || ""} onChange={(e) => setForm({ ...form, diametroBase: e.target.value ? Number(e.target.value) : null })} />
              </CCol>
            </CRow>
            <CRow className="mb-3 g-2">
              <CCol>
                <CFormLabel>Calidad del hormigón</CFormLabel>
                <CFormInput placeholder="Ej. H25 — 250 kgf/cm²" value={form.resistenciaHormigon ?? ""} onChange={(e) => setForm({ ...form, resistenciaHormigon: e.target.value })} />
              </CCol>
              <CCol>
                <CFormLabel>Norma / código ANDE (opcional)</CFormLabel>
                <CFormInput value={form.normaAnde ?? ""} onChange={(e) => setForm({ ...form, normaAnde: e.target.value })} />
              </CCol>
            </CRow>
            <div className="mb-3">
              <CFormLabel>Armadura</CFormLabel>
              <CFormInput placeholder="Ej. 8 varillas de 8mm + zunchado" value={form.armadura ?? ""} onChange={(e) => setForm({ ...form, armadura: e.target.value })} />
            </div>
            <div className="mb-3">
              <CFormLabel>Notas</CFormLabel>
              <CFormTextarea rows={2} value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
            <CFormCheck id="spec-activo" label="Especificación activa (se puede elegir para lotes nuevos)" checked={form.activo !== false} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</CButton>
            <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
          </CModalFooter>
        </CForm>
      </CModal>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Eliminar especificación"
        message={`¿Eliminar "${confirmTarget?.nombre}"? Esta acción no se puede deshacer.`}
        busy={deleting}
        error={deleteError}
        onConfirm={() => confirmTarget && performDelete(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
    </CCard>
  );
}

function MaterialesView({
  materials, onChanged, showToast,
}: {
  materials: RawMaterialDTO[];
  onChanged: () => void;
  showToast: (m: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterialDTO | null>(null);
  const [form, setForm] = useState<RawMaterialInput>(EMPTY_MATERIAL);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<RawMaterialDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openModal(m: RawMaterialDTO | null) {
    setFormError(null);
    setEditing(m);
    setForm(
      m
        ? { nombre: m.nombre, unidad: m.unidad, costoUnitarioGs: m.costoUnitarioGs, proveedor: m.proveedor ?? "", notas: m.notas ?? "", activo: m.activo }
        : EMPTY_MATERIAL
    );
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) { setFormError("El nombre es obligatorio."); return; }
    if (!form.unidad.trim()) { setFormError("Cargá la unidad de medida."); return; }
    if (!form.costoUnitarioGs || form.costoUnitarioGs <= 0) { setFormError("Cargá el costo unitario (Gs.)."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const url = editing ? `/api/postes/materials/${editing.id}` : "/api/postes/materials";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setModalOpen(false);
      onChanged();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function performDelete(m: RawMaterialDTO) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/postes/materials/${m.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setConfirmTarget(null);
      onChanged();
    } catch (err: any) {
      setDeleteError(err.message || "No se pudo eliminar.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <CCard>
      <CCardHeader className="module-panel-head">
        <div>
          <span className="fw-semibold fs-5">Materias primas</span>
          <p className="module-desc mb-0">Insumos usados en las recetas de fabricación — cemento, hierro, arena, etc. — con su costo unitario vigente.</p>
        </div>
        <CButton color="primary" size="sm" onClick={() => openModal(null)}>
          <CIcon icon={cilPlus} className="me-1" /> Nueva materia prima
        </CButton>
      </CCardHeader>
      <CCardBody>
        {materials.length === 0 && <p className="empty-col">Sin materias primas todavía. Cargá la primera con &quot;+ Nueva materia prima&quot;.</p>}
        {materials.length > 0 && (
          <div className="table-wrap">
            <CTable hover responsive>
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Nombre</CTableHeaderCell>
                  <CTableHeaderCell>Unidad</CTableHeaderCell>
                  <CTableHeaderCell>Costo unitario (Gs)</CTableHeaderCell>
                  <CTableHeaderCell>Proveedor</CTableHeaderCell>
                  <CTableHeaderCell>En X recetas</CTableHeaderCell>
                  <CTableHeaderCell>Consumido histórico</CTableHeaderCell>
                  <CTableHeaderCell>Comprado</CTableHeaderCell>
                  <CTableHeaderCell>Stock disponible</CTableHeaderCell>
                  <CTableHeaderCell>Estado</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Acciones</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {materials.map((m) => (
                  <CTableRow key={m.id}>
                    <CTableDataCell className="fw-semibold">{m.nombre}</CTableDataCell>
                    <CTableDataCell>{m.unidad}</CTableDataCell>
                    <CTableDataCell className="mono">{fmtGs(m.costoUnitarioGs)}</CTableDataCell>
                    <CTableDataCell>{m.proveedor || "—"}</CTableDataCell>
                    <CTableDataCell className="mono">{m.recipeCount}</CTableDataCell>
                    <CTableDataCell className="mono">{`${m.consumidoTotal} ${m.unidad}`}</CTableDataCell>
                    <CTableDataCell className="mono">{`${m.compradoTotal} ${m.unidad}`}</CTableDataCell>
                    <CTableDataCell className="mono">{`${m.stockDisponible} ${m.unidad}`}</CTableDataCell>
                    <CTableDataCell><CBadge color={m.activo ? "success" : "secondary"}>{m.activo ? "Activa" : "Inactiva"}</CBadge></CTableDataCell>
                    <CTableDataCell className="text-end">
                      <CButton size="sm" color="secondary" variant="outline" className="me-1" onClick={() => openModal(m)}><CIcon icon={cilPencil} size="sm" /></CButton>
                      <CButton size="sm" color="danger" variant="outline" onClick={() => { setDeleteError(null); setConfirmTarget(m); }}><CIcon icon={cilTrash} size="sm" /></CButton>
                    </CTableDataCell>
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          </div>
        )}
      </CCardBody>

      <CModal visible={modalOpen} onClose={() => setModalOpen(false)} alignment="center" size="lg">
        <CModalHeader><CModalTitle>{editing ? "Editar" : "Nueva"} materia prima</CModalTitle></CModalHeader>
        <CForm onSubmit={handleSubmit}>
          <CModalBody>
            {formError && <CAlert color="danger">{formError}</CAlert>}
            <CRow className="mb-3 g-2">
              <CCol md={8}>
                <CFormLabel>Nombre</CFormLabel>
                <CFormInput placeholder="Ej. Cemento Portland" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
              </CCol>
              <CCol md={4}>
                <CFormLabel>Unidad</CFormLabel>
                <CFormInput
                  list="unidad-suggestions"
                  placeholder="Ej. kg"
                  value={form.unidad}
                  onChange={(e) => setForm({ ...form, unidad: e.target.value })}
                  required
                />
                <datalist id="unidad-suggestions">
                  {COMMON_UNITS.map((u) => <option key={u} value={u} />)}
                </datalist>
              </CCol>
            </CRow>
            <CRow className="mb-3 g-2">
              <CCol>
                <CFormLabel>Costo unitario (Gs.)</CFormLabel>
                <CFormInput type="number" min={0} step="1" value={form.costoUnitarioGs || ""} onChange={(e) => setForm({ ...form, costoUnitarioGs: Number(e.target.value) })} required />
              </CCol>
              <CCol>
                <CFormLabel>Proveedor (opcional)</CFormLabel>
                <CFormInput value={form.proveedor ?? ""} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />
              </CCol>
            </CRow>
            <div className="mb-3">
              <CFormLabel>Notas</CFormLabel>
              <CFormTextarea rows={2} value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
            <CFormCheck id="material-activo" label="Materia prima activa (se puede elegir en recetas nuevas)" checked={form.activo !== false} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</CButton>
            <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
          </CModalFooter>
        </CForm>
      </CModal>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Eliminar materia prima"
        message={`¿Eliminar "${confirmTarget?.nombre}"? Esta acción no se puede deshacer.`}
        busy={deleting}
        error={deleteError}
        onConfirm={() => confirmTarget && performDelete(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
    </CCard>
  );
}

function PurchasesView({
  purchases, materials, onChanged, showToast,
}: {
  purchases: MaterialPurchaseDTO[];
  materials: RawMaterialDTO[];
  onChanged: () => void;
  showToast: (m: string) => void;
}) {
  const [materialFilter, setMaterialFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<MaterialPurchaseInput>(EMPTY_PURCHASE);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<MaterialPurchaseDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const visiblePurchases = materialFilter ? purchases.filter((p) => p.materialId === materialFilter) : purchases;

  function openModal() {
    setFormError(null);
    setForm({ ...EMPTY_PURCHASE, materialId: materials.find((m) => m.activo)?.id ?? "", fecha: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.materialId) { setFormError("Elegí una materia prima."); return; }
    if (!form.fecha) { setFormError("Cargá la fecha de compra."); return; }
    if (!form.cantidad || form.cantidad <= 0) { setFormError("La cantidad tiene que ser mayor a 0."); return; }
    if (!form.costoUnitarioGs || form.costoUnitarioGs <= 0) { setFormError("Cargá el costo unitario pagado (Gs.)."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/postes/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setModalOpen(false);
      onChanged();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function performDelete(p: MaterialPurchaseDTO) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/postes/purchases/${p.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setConfirmTarget(null);
      onChanged();
    } catch (err: any) {
      setDeleteError(err.message || "No se pudo eliminar.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <CCard>
      <CCardHeader className="module-panel-head">
        <div>
          <span className="fw-semibold fs-5">Compras de materia prima</span>
          <p className="module-desc mb-0">Historial de compras — de acá sale el stock disponible de cada materia prima.</p>
        </div>
        <CButton color="primary" size="sm" onClick={openModal} disabled={materials.length === 0}>
          <CIcon icon={cilPlus} className="me-1" /> Registrar compra
        </CButton>
      </CCardHeader>
      <CCardBody>
        {materials.length === 0 && <CAlert color="warning">Cargá al menos una materia prima antes de registrar una compra.</CAlert>}

        {purchases.length > 0 && (
          <CRow className="g-2 mb-3">
            <CCol md={3}>
              <CFormSelect value={materialFilter} onChange={(e) => setMaterialFilter(e.target.value)}>
                <option value="">Todas las materias primas</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </CFormSelect>
            </CCol>
          </CRow>
        )}

        {purchases.length === 0 && <p className="empty-col">Sin compras registradas todavía.</p>}
        {purchases.length > 0 && visiblePurchases.length === 0 && <p className="empty-col">Ninguna compra coincide con este filtro.</p>}

        {visiblePurchases.length > 0 && (
          <div className="table-wrap">
            <CTable hover responsive>
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Fecha</CTableHeaderCell>
                  <CTableHeaderCell>Material</CTableHeaderCell>
                  <CTableHeaderCell>Documento</CTableHeaderCell>
                  <CTableHeaderCell>Proveedor</CTableHeaderCell>
                  <CTableHeaderCell>Cantidad</CTableHeaderCell>
                  <CTableHeaderCell>Costo unitario (Gs)</CTableHeaderCell>
                  <CTableHeaderCell>Costo total (Gs)</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Acciones</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {visiblePurchases.map((p) => (
                  <CTableRow key={p.id}>
                    <CTableDataCell className="mono">{fmtDate(p.fecha)}</CTableDataCell>
                    <CTableDataCell className="fw-semibold">{p.materialNombre}</CTableDataCell>
                    <CTableDataCell>{`${PURCHASE_DOC_TYPE_LABEL[p.tipoDocumento]}${p.numeroDocumento ? " · " + p.numeroDocumento : ""}`}</CTableDataCell>
                    <CTableDataCell>{p.proveedor || "—"}</CTableDataCell>
                    <CTableDataCell className="mono">{`${p.cantidad} ${p.unidad}`}</CTableDataCell>
                    <CTableDataCell className="mono">{fmtGs(p.costoUnitarioGs)}</CTableDataCell>
                    <CTableDataCell className="mono">{fmtGs(p.costoTotalGs)}</CTableDataCell>
                    <CTableDataCell className="text-end">
                      <CButton size="sm" color="danger" variant="outline" onClick={() => { setDeleteError(null); setConfirmTarget(p); }}><CIcon icon={cilTrash} size="sm" /></CButton>
                    </CTableDataCell>
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          </div>
        )}
      </CCardBody>

      <CModal visible={modalOpen} onClose={() => setModalOpen(false)} alignment="center" size="lg">
        <CModalHeader><CModalTitle>Registrar compra</CModalTitle></CModalHeader>
        <CForm onSubmit={handleSubmit}>
          <CModalBody>
            {formError && <CAlert color="danger">{formError}</CAlert>}
            <CRow className="mb-3 g-2">
              <CCol md={8}>
                <CFormLabel>Materia prima</CFormLabel>
                <CFormSelect value={form.materialId} onChange={(e) => setForm({ ...form, materialId: e.target.value })} required>
                  <option value="">Seleccioná…</option>
                  {materials.map((m) => <option key={m.id} value={m.id}>{`${m.nombre} (${m.unidad})`}</option>)}
                </CFormSelect>
              </CCol>
              <CCol md={4}>
                <CFormLabel>Fecha</CFormLabel>
                <CFormInput type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
              </CCol>
            </CRow>
            <CRow className="mb-3 g-2">
              <CCol>
                <CFormLabel>Cantidad</CFormLabel>
                <CFormInput type="number" min={0} step="any" value={form.cantidad || ""} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })} required />
              </CCol>
              <CCol>
                <CFormLabel>Costo unitario pagado (Gs.)</CFormLabel>
                <CFormInput type="number" min={0} step="1" value={form.costoUnitarioGs || ""} onChange={(e) => setForm({ ...form, costoUnitarioGs: Number(e.target.value) })} required />
              </CCol>
            </CRow>
            <CRow className="mb-3 g-2">
              <CCol>
                <CFormLabel>Tipo de documento</CFormLabel>
                <CFormSelect value={form.tipoDocumento ?? "factura"} onChange={(e) => setForm({ ...form, tipoDocumento: e.target.value as MaterialPurchaseInput["tipoDocumento"] })}>
                  {PURCHASE_DOC_TYPE_ORDER.map((t) => <option key={t} value={t}>{PURCHASE_DOC_TYPE_LABEL[t]}</option>)}
                </CFormSelect>
              </CCol>
              <CCol>
                <CFormLabel>N° de documento</CFormLabel>
                <CFormInput value={form.numeroDocumento ?? ""} onChange={(e) => setForm({ ...form, numeroDocumento: e.target.value })} />
              </CCol>
            </CRow>
            <div className="mb-3">
              <CFormLabel>Proveedor</CFormLabel>
              <CFormInput value={form.proveedor ?? ""} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />
            </div>
            <div className="mb-1">
              <CFormLabel>Notas</CFormLabel>
              <CFormTextarea rows={2} value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</CButton>
            <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
          </CModalFooter>
        </CForm>
      </CModal>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Eliminar compra"
        message={`¿Eliminar esta compra de "${confirmTarget?.materialNombre}"? Esta acción no se puede deshacer.`}
        busy={deleting}
        error={deleteError}
        onConfirm={() => confirmTarget && performDelete(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
    </CCard>
  );
}

function LotesView({
  lots, specs, onChanged, showToast,
}: {
  lots: PoleLotDTO[];
  specs: PoleSpecDTO[];
  onChanged: () => void;
  showToast: (m: string) => void;
}) {
  const [estadoFilter, setEstadoFilter] = useState<PoleLotStatus | "">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PoleLotDTO | null>(null);
  const [form, setForm] = useState<PoleLotInput>(emptyLot());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<PoleLotDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const visibleLots = estadoFilter ? lots.filter((l) => l.estado === estadoFilter) : lots;

  function openModal(l: PoleLotDTO | null) {
    setFormError(null);
    setEditing(l);
    setForm(
      l
        ? { specId: l.specId, codigo: l.codigo, cantidad: l.cantidad, cantidadParaEnsayo: l.cantidadParaEnsayo, cantidadDespachada: l.cantidadDespachada, fechaColado: l.fechaColado, fechaDesmolde: l.fechaDesmolde ?? "", estado: l.estado, responsable: l.responsable ?? "", ciudadDestino: l.ciudadDestino ?? "", andeAprobado: l.andeAprobado, andeFecha: l.andeFecha ?? "", andeActa: l.andeActa ?? "", andeInspector: l.andeInspector ?? "", numeracionAnde: l.numeracionAnde ?? "", notas: l.notas ?? "" }
        : emptyLot(specs.find((s) => s.activo)?.id ?? "")
    );
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.specId) { setFormError("Elegí una especificación."); return; }
    if (!form.codigo.trim()) { setFormError("Cargá el código del lote."); return; }
    if (!form.cantidad || form.cantidad <= 0) { setFormError("La cantidad tiene que ser mayor a 0."); return; }
    if (!form.fechaColado) { setFormError("Cargá la fecha de colado."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const url = editing ? `/api/postes/lots/${editing.id}` : "/api/postes/lots";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setModalOpen(false);
      onChanged();
    } catch (err: any) {
      setFormError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function performDelete(l: PoleLotDTO) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/postes/lots/${l.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setConfirmTarget(null);
      onChanged();
    } catch {
      showToast("No se pudo eliminar el lote.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <CCard>
      <CCardHeader className="module-panel-head">
        <div>
          <span className="fw-semibold fs-5">Lotes de producción</span>
          <p className="module-desc mb-0">Cada lote recorre curado → ensayo → aprobación ANDE → despacho. Entrá a un lote para cargar sus ensayos.</p>
        </div>
        <CButton color="primary" size="sm" onClick={() => openModal(null)} disabled={specs.length === 0}>
          <CIcon icon={cilPlus} className="me-1" /> Nuevo lote
        </CButton>
      </CCardHeader>
      <CCardBody>
        {specs.length === 0 && <CAlert color="warning">Cargá al menos una especificación técnica antes de crear un lote.</CAlert>}

        {lots.length > 0 && (
          <CRow className="g-2 mb-3">
            <CCol md={3}>
              <CFormSelect value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value as PoleLotStatus | "")}>
                <option value="">Todos los estados</option>
                {LOT_STATUS_ORDER.map((e) => <option key={e} value={e}>{LOT_STATUS_LABEL[e]}</option>)}
              </CFormSelect>
            </CCol>
          </CRow>
        )}

        {lots.length === 0 && <p className="empty-col">Sin lotes todavía.</p>}
        {lots.length > 0 && visibleLots.length === 0 && <p className="empty-col">Ningún lote coincide con este filtro.</p>}

        {visibleLots.length > 0 && (
          <div className="table-wrap">
            <CTable hover responsive>
              <CTableHead>
                <CTableRow>
                  <CTableHeaderCell>Código</CTableHeaderCell>
                  <CTableHeaderCell>Especificación</CTableHeaderCell>
                  <CTableHeaderCell>Cantidad</CTableHeaderCell>
                  <CTableHeaderCell>Disponible</CTableHeaderCell>
                  <CTableHeaderCell>Colado</CTableHeaderCell>
                  <CTableHeaderCell>Estado</CTableHeaderCell>
                  <CTableHeaderCell>Costo materiales</CTableHeaderCell>
                  <CTableHeaderCell>ANDE</CTableHeaderCell>
                  <CTableHeaderCell className="text-end">Acciones</CTableHeaderCell>
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {visibleLots.map((l) => (
                  <CTableRow key={l.id}>
                    <CTableDataCell className="fw-semibold"><Link href={`/postes/lotes/${l.id}`}>{l.codigo} ↗</Link></CTableDataCell>
                    <CTableDataCell>{l.specNombre}</CTableDataCell>
                    <CTableDataCell className="mono">{l.cantidad}</CTableDataCell>
                    <CTableDataCell className="mono">{Math.max(0, l.cantidad - l.cantidadParaEnsayo - l.cantidadDespachada)}</CTableDataCell>
                    <CTableDataCell className="mono">{fmtDate(l.fechaColado)}</CTableDataCell>
                    <CTableDataCell><CBadge color={LOT_STATUS_COLOR[l.estado]}>{LOT_STATUS_LABEL[l.estado]}</CBadge></CTableDataCell>
                    <CTableDataCell className="mono">{fmtGs(l.costoMaterialTotalGs)}</CTableDataCell>
                    <CTableDataCell>{l.andeAprobado ? <CBadge color="success">Aprobado</CBadge> : <span className="text-body-secondary">—</span>}</CTableDataCell>
                    <CTableDataCell className="text-end">
                      <CButton size="sm" color="secondary" variant="outline" className="me-1" onClick={() => openModal(l)}><CIcon icon={cilPencil} size="sm" /></CButton>
                      <CButton size="sm" color="danger" variant="outline" onClick={() => setConfirmTarget(l)}><CIcon icon={cilTrash} size="sm" /></CButton>
                    </CTableDataCell>
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          </div>
        )}
      </CCardBody>

      <CModal visible={modalOpen} onClose={() => setModalOpen(false)} alignment="center" size="lg">
        <CModalHeader><CModalTitle>{editing ? "Editar" : "Nuevo"} lote</CModalTitle></CModalHeader>
        <CForm onSubmit={handleSubmit}>
          <CModalBody>
            {formError && <CAlert color="danger">{formError}</CAlert>}
            <CRow className="mb-3 g-2">
              <CCol md={8}>
                <CFormLabel>Especificación</CFormLabel>
                <CFormSelect value={form.specId} onChange={(e) => setForm({ ...form, specId: e.target.value })} required>
                  <option value="">Seleccioná…</option>
                  {specs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </CFormSelect>
              </CCol>
              <CCol md={4}>
                <CFormLabel>Código de lote</CFormLabel>
                <CFormInput placeholder="Ej. L-2026-014" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} required />
              </CCol>
            </CRow>
            <CRow className="mb-3 g-2">
              <CCol>
                <CFormLabel>Cantidad de postes</CFormLabel>
                <CFormInput type="number" min={1} step={1} value={form.cantidad || ""} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })} required />
              </CCol>
              <CCol>
                <CFormLabel>Para ensayo (destructivo)</CFormLabel>
                <CFormInput type="number" min={0} step={1} value={form.cantidadParaEnsayo ?? 1} onChange={(e) => setForm({ ...form, cantidadParaEnsayo: Number(e.target.value) })} />
                <div className="module-desc small mt-1">Se descuenta de la cantidad para calcular el disponible para despacho — por defecto 1 (de 101 postes, 100 se entregan y 1 se rompe en la fiscalización).</div>
              </CCol>
              <CCol>
                <CFormLabel>Despachados</CFormLabel>
                <CFormInput type="number" min={0} step={1} value={form.cantidadDespachada || 0} onChange={(e) => setForm({ ...form, cantidadDespachada: Number(e.target.value) })} />
              </CCol>
              <CCol>
                <CFormLabel>Estado</CFormLabel>
                <CFormSelect value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as PoleLotStatus })}>
                  {LOT_STATUS_ORDER.map((e) => <option key={e} value={e}>{LOT_STATUS_LABEL[e]}</option>)}
                </CFormSelect>
              </CCol>
            </CRow>
            <CRow className="mb-3 g-2">
              <CCol>
                <CFormLabel>Fecha de colado</CFormLabel>
                <CFormInput type="date" value={form.fechaColado} onChange={(e) => setForm({ ...form, fechaColado: e.target.value })} required />
              </CCol>
              <CCol>
                <CFormLabel>Fecha de desmolde (opcional)</CFormLabel>
                <CFormInput type="date" value={form.fechaDesmolde ?? ""} onChange={(e) => setForm({ ...form, fechaDesmolde: e.target.value })} />
              </CCol>
              <CCol>
                <CFormLabel>Responsable</CFormLabel>
                <CFormInput value={form.responsable ?? ""} onChange={(e) => setForm({ ...form, responsable: e.target.value })} />
              </CCol>
              <CCol>
                <CFormLabel>Ciudad de destino</CFormLabel>
                <CFormInput value={form.ciudadDestino ?? ""} onChange={(e) => setForm({ ...form, ciudadDestino: e.target.value })} />
              </CCol>
            </CRow>
            <hr />
            <p className="module-desc mb-2">Aprobación ANDE</p>
            <CRow className="mb-3 g-2 align-items-end">
              <CCol xs={12}>
                <CFormCheck id="lot-ande" label="Lote aprobado por ANDE" checked={form.andeAprobado ?? false} onChange={(e) => setForm({ ...form, andeAprobado: e.target.checked })} />
              </CCol>
              <CCol>
                <CFormLabel>Fecha de aprobación</CFormLabel>
                <CFormInput type="date" value={form.andeFecha ?? ""} onChange={(e) => setForm({ ...form, andeFecha: e.target.value })} />
              </CCol>
              <CCol>
                <CFormLabel>N° de acta</CFormLabel>
                <CFormInput value={form.andeActa ?? ""} onChange={(e) => setForm({ ...form, andeActa: e.target.value })} />
              </CCol>
              <CCol>
                <CFormLabel>Inspector</CFormLabel>
                <CFormInput value={form.andeInspector ?? ""} onChange={(e) => setForm({ ...form, andeInspector: e.target.value })} />
              </CCol>
              <CCol>
                <CFormLabel>Numeración ANDE asignada</CFormLabel>
                <CFormInput placeholder="Ej. Del 004521 al 004620" value={form.numeracionAnde ?? ""} onChange={(e) => setForm({ ...form, numeracionAnde: e.target.value })} />
              </CCol>
            </CRow>
            <div className="mb-1">
              <CFormLabel>Notas</CFormLabel>
              <CFormTextarea rows={2} value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</CButton>
            <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
          </CModalFooter>
        </CForm>
      </CModal>

      <ConfirmDialog
        open={confirmTarget !== null}
        title="Eliminar lote"
        message={`¿Eliminar el lote "${confirmTarget?.codigo}"? Esta acción no se puede deshacer.`}
        busy={deleting}
        onConfirm={() => confirmTarget && performDelete(confirmTarget)}
        onCancel={() => setConfirmTarget(null)}
      />
    </CCard>
  );
}
