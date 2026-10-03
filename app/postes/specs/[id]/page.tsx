"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CCard, CCardBody, CCardHeader, CButton, CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea, CFormCheck, CBadge, CAlert, CRow, CCol,
  CTable, CTableHead, CTableRow, CTableHeaderCell, CTableBody, CTableDataCell,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilPlus, cilPencil, cilTrash } from "@coreui/icons";
import AppShell from "@/components/AppShell";
import { confirmarAccion } from "@/lib/ui/alerts";
import { fmtGs } from "@/lib/currency";
import type { PoleSpecDetailDTO, PoleSpecInput, RawMaterialDTO, PoleRecipeItemDTO, PoleRecipeItemInput } from "@/lib/types";

const EMPTY_RECIPE: PoleRecipeItemInput = { materialId: "", cantidadPorPoste: 0, notas: "" };

/**
 * Ficha de una especificación de poste — datos técnicos de solo lectura más
 * gestión completa de su receta de materia prima (PoleRecipeItem), que es
 * lo que alimenta costoEstimadoPorPosteGs y, al crear un lote, el consumo
 * real congelado (PoleLotMaterialConsumption).
 */
export default function PoleSpecDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [spec, setSpec] = useState<PoleSpecDetailDTO | null>(null);
  const [materials, setMaterials] = useState<RawMaterialDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edición de la especificación
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<PoleSpecInput | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Receta de producción
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<PoleRecipeItemDTO | null>(null);
  const [recipeForm, setRecipeForm] = useState<PoleRecipeItemInput>(EMPTY_RECIPE);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [savingRecipe, setSavingRecipe] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [specRes, materialsRes] = await Promise.all([
        fetch(`/api/postes/specs/${id}`),
        fetch("/api/postes/materials"),
      ]);
      if (!specRes.ok) throw new Error(`HTTP ${specRes.status}`);
      setSpec(await specRes.json());
      setMaterials(materialsRes.ok ? await materialsRes.json() : []);
    } catch {
      setError("No se pudo cargar la especificación.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [id]);

  /** Vuelve a pedir solo el detalle de la spec (receta + totales), sin recargar materiales. */
  async function reloadSpec() {
    try {
      const res = await fetch(`/api/postes/specs/${id}`);
      if (res.ok) setSpec(await res.json());
    } catch {
      // silencioso — la próxima acción del usuario o un load() completo reintenta
    }
  }

  function openEdit() {
    if (!spec) return;
    setEditError(null);
    setEditForm({
      nombre: spec.nombre,
      longitud: spec.longitud,
      esfuerzoNominal: spec.esfuerzoNominal,
      diametroBase: spec.diametroBase,
      resistenciaHormigon: spec.resistenciaHormigon ?? "",
      armadura: spec.armadura ?? "",
      normaAnde: spec.normaAnde ?? "",
      notas: spec.notas ?? "",
      activo: spec.activo,
    });
    setEditOpen(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm) return;
    if (!editForm.nombre.trim()) { setEditError("El nombre es obligatorio."); return; }
    if (!editForm.longitud || editForm.longitud <= 0) { setEditError("Cargá la longitud (metros)."); return; }
    if (!editForm.esfuerzoNominal || editForm.esfuerzoNominal <= 0) { setEditError("Cargá el esfuerzo nominal (kgf)."); return; }
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/postes/specs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await reloadSpec();
      setEditOpen(false);
    } catch (err: any) {
      setEditError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!spec) return;
    const ok = await confirmarAccion({
      titulo: "Eliminar especificación",
      texto: `¿Eliminar "${spec.nombre}"? Esta acción no se puede deshacer.`,
      confirmar: "Eliminar",
      peligro: true,
      accion: async () => {
        setDeleting(true);
        try {
          const res = await fetch(`/api/postes/specs/${id}`, { method: "DELETE" });
          if (!res.ok && res.status !== 204) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${res.status}`);
          }
        } catch (err: any) {
          setDeleting(false);
          throw new Error(err.message || "No se pudo eliminar la especificación. Probá de nuevo.");
        }
      },
    });
    if (ok) router.push("/postes?tab=specs");
  }

  // ── Receta de producción ──────────────────────────────────────────────

  const availableMaterials = spec
    ? materials.filter((m) => m.activo && !spec.recipe.some((r) => r.materialId === m.id))
    : [];

  function openRecipeCreate() {
    setRecipeError(null);
    setEditingRecipe(null);
    setRecipeForm({ materialId: availableMaterials[0]?.id ?? "", cantidadPorPoste: 0, notas: "" });
    setRecipeModalOpen(true);
  }

  function openRecipeEdit(item: PoleRecipeItemDTO) {
    setRecipeError(null);
    setEditingRecipe(item);
    setRecipeForm({ materialId: item.materialId, cantidadPorPoste: item.cantidadPorPoste, notas: item.notas ?? "" });
    setRecipeModalOpen(true);
  }

  async function handleRecipeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipeForm.materialId) { setRecipeError("Elegí un material."); return; }
    if (!recipeForm.cantidadPorPoste || recipeForm.cantidadPorPoste <= 0) { setRecipeError("La cantidad por poste tiene que ser mayor a 0."); return; }
    setSavingRecipe(true);
    setRecipeError(null);
    try {
      const url = editingRecipe ? `/api/postes/recipe/${editingRecipe.id}` : `/api/postes/specs/${id}/recipe`;
      const body = editingRecipe
        ? { cantidadPorPoste: recipeForm.cantidadPorPoste, notas: recipeForm.notas }
        : recipeForm;
      const res = await fetch(url, {
        method: editingRecipe ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      setRecipeModalOpen(false);
      await reloadSpec();
    } catch (err: any) {
      setRecipeError(err.message || "No se pudo guardar.");
    } finally {
      setSavingRecipe(false);
    }
  }

  async function performDeleteRecipe(item: PoleRecipeItemDTO) {
    const ok = await confirmarAccion({
      titulo: "Quitar material de la receta",
      texto: `¿Quitar "${item.materialNombre}" de la receta de esta especificación? Esta acción no se puede deshacer.`,
      confirmar: "Eliminar",
      peligro: true,
      accion: async () => {
        try {
          const res = await fetch(`/api/postes/recipe/${item.id}`, { method: "DELETE" });
          if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
        } catch {
          throw new Error("No se pudo eliminar el material de la receta.");
        }
      },
    });
    if (ok) await reloadSpec();
  }

  if (loading) return <AppShell crumbs={[{ label: "Fábrica de Postes", href: "/postes" }]}><p className="state-message">Cargando…</p></AppShell>;
  if (error || !spec) return <AppShell crumbs={[{ label: "Fábrica de Postes", href: "/postes" }]}><p className="state-message form-error">{error || "Especificación no encontrada."}</p></AppShell>;

  const selectedMaterialForForm = materials.find((m) => m.id === recipeForm.materialId);
  const cantidadLabel = editingRecipe
    ? `Cantidad por poste (${editingRecipe.unidad})`
    : selectedMaterialForForm
      ? `Cantidad por poste (${selectedMaterialForForm.unidad})`
      : "Cantidad por poste";

  return (
    <AppShell
      crumbs={[{ label: "Fábrica de Postes", href: "/postes" }, { label: spec.nombre }]}
      headerActions={
        <>
          <CButton color="secondary" variant="outline" size="sm" onClick={openEdit}>
            <CIcon icon={cilPencil} className="me-1" /> Editar
          </CButton>
          <CButton color="danger" variant="outline" size="sm" onClick={handleDelete} disabled={deleting}>
            <CIcon icon={cilTrash} className="me-1" /> {deleting ? "Eliminando…" : "Eliminar"}
          </CButton>
        </>
      }
    >
      <div className="project-hero">
        <div>
          <h1 className="of-page-title mb-2">{spec.nombre}</h1>
          <div className="project-hero-meta">
            <CBadge color={spec.activo ? "success" : "secondary"}>{spec.activo ? "Activa" : "Inactiva"}</CBadge>
            <span>{spec.longitud} m · {spec.esfuerzoNominal} kgf{spec.diametroBase ? ` · ⌀ ${spec.diametroBase} cm` : ""}</span>
          </div>
        </div>
        <div className="project-hero-kpis">
          <CCard><CCardBody><div className="label">Costo est./poste</div><div className="value mono">{fmtGs(spec.costoEstimadoPorPosteGs)}</div><div className="sub">con precios actuales</div></CCardBody></CCard>
          <CCard><CCardBody><div className="label">Ítems en receta</div><div className="value mono">{spec.recipeCount}</div><div className="sub">materias primas</div></CCardBody></CCard>
          <CCard><CCardBody><div className="label">Lotes producidos</div><div className="value mono">{spec.lotCount}</div><div className="sub">con esta especificación</div></CCardBody></CCard>
        </div>
      </div>

      <CRow className="g-3 mb-4">
        <CCol xs={12}>
          <CCard>
            <CCardHeader className="fw-semibold">Especificación técnica</CCardHeader>
            <CCardBody>
              <CRow className="g-3">
                <CCol xs={6} md={3}><span className="module-desc">Longitud</span><div>{spec.longitud} m</div></CCol>
                <CCol xs={6} md={3}><span className="module-desc">Esfuerzo nominal</span><div>{spec.esfuerzoNominal} kgf</div></CCol>
                <CCol xs={6} md={3}><span className="module-desc">Diámetro base</span><div>{spec.diametroBase != null ? `${spec.diametroBase} cm` : "—"}</div></CCol>
                <CCol xs={6} md={3}><span className="module-desc">Calidad del hormigón</span><div>{spec.resistenciaHormigon || "—"}</div></CCol>
                <CCol xs={12} md={6}><span className="module-desc">Armadura</span><div>{spec.armadura || "—"}</div></CCol>
                <CCol xs={12} md={6}><span className="module-desc">Norma / código ANDE</span><div>{spec.normaAnde || "—"}</div></CCol>
                {spec.notas && <CCol xs={12}><span className="module-desc">Notas</span><div className="item-row-notes">{spec.notas}</div></CCol>}
              </CRow>
            </CCardBody>
          </CCard>
        </CCol>
      </CRow>

      <CCard>
        <CCardHeader className="module-panel-head">
          <div>
            <span className="fw-semibold fs-5">Receta de producción</span>
            <p className="module-desc mb-0">Materia prima que entra en UN poste de este tipo — se usa para calcular costo estimado y, al crear un lote, para congelar el consumo real.</p>
          </div>
          <CButton color="primary" size="sm" onClick={openRecipeCreate} disabled={availableMaterials.length === 0}>
            <CIcon icon={cilPlus} className="me-1" /> Agregar material
          </CButton>
        </CCardHeader>
        <CCardBody>
          {spec.recipe.length === 0 && materials.length === 0 && (
            <CAlert color="warning">Cargá materias primas en la pestaña Materias primas primero.</CAlert>
          )}
          {spec.recipe.length === 0 && materials.length > 0 && <p className="empty-col">Sin materiales en la receta todavía.</p>}

          {spec.recipe.length > 0 && (
            <div className="table-wrap">
              <CTable hover responsive>
                <CTableHead>
                  <CTableRow>
                    <CTableHeaderCell>Material</CTableHeaderCell>
                    <CTableHeaderCell>Unidad</CTableHeaderCell>
                    <CTableHeaderCell>Cantidad por poste</CTableHeaderCell>
                    <CTableHeaderCell>Costo unitario (Gs)</CTableHeaderCell>
                    <CTableHeaderCell>Subtotal por poste (Gs)</CTableHeaderCell>
                    <CTableHeaderCell className="text-end">Acciones</CTableHeaderCell>
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {spec.recipe.map((r) => (
                    <CTableRow key={r.id}>
                      <CTableDataCell className="fw-semibold">{r.materialNombre}</CTableDataCell>
                      <CTableDataCell>{r.unidad}</CTableDataCell>
                      <CTableDataCell className="mono">{r.cantidadPorPoste}</CTableDataCell>
                      <CTableDataCell className="mono">{fmtGs(r.costoUnitarioGs)}</CTableDataCell>
                      <CTableDataCell className="mono">{fmtGs(r.subtotalGs)}</CTableDataCell>
                      <CTableDataCell className="text-end">
                        <CButton size="sm" color="secondary" variant="outline" className="me-1" onClick={() => openRecipeEdit(r)}><CIcon icon={cilPencil} size="sm" /></CButton>
                        <CButton size="sm" color="danger" variant="outline" onClick={() => performDeleteRecipe(r)}><CIcon icon={cilTrash} size="sm" /></CButton>
                      </CTableDataCell>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            </div>
          )}

          <div className="mt-3 d-flex align-items-center gap-2 flex-wrap">
            <span className="module-desc mb-0">Costo estimado por poste:</span>
            <CBadge color="info" className="fs-6 fw-semibold">{fmtGs(spec.costoEstimadoPorPosteGs)}</CBadge>
          </div>
        </CCardBody>
      </CCard>

      {editForm && (
        <CModal visible={editOpen} onClose={() => setEditOpen(false)} alignment="center" size="lg">
          <CModalHeader><CModalTitle>Editar especificación</CModalTitle></CModalHeader>
          <CForm onSubmit={handleEditSubmit}>
            <CModalBody>
              {editError && <CAlert color="danger">{editError}</CAlert>}
              <div className="mb-3">
                <CFormLabel>Nombre</CFormLabel>
                <CFormInput placeholder="Ej. Poste 9m — 500 kgf" value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} required />
              </div>
              <CRow className="mb-3 g-2">
                <CCol>
                  <CFormLabel>Longitud (m)</CFormLabel>
                  <CFormInput type="number" step="0.1" min={0} value={editForm.longitud || ""} onChange={(e) => setEditForm({ ...editForm, longitud: Number(e.target.value) })} required />
                </CCol>
                <CCol>
                  <CFormLabel>Esfuerzo nominal (kgf)</CFormLabel>
                  <CFormInput type="number" step="1" min={0} value={editForm.esfuerzoNominal || ""} onChange={(e) => setEditForm({ ...editForm, esfuerzoNominal: Number(e.target.value) })} required />
                </CCol>
                <CCol>
                  <CFormLabel>Diámetro en la base (cm)</CFormLabel>
                  <CFormInput type="number" step="0.1" min={0} value={editForm.diametroBase || ""} onChange={(e) => setEditForm({ ...editForm, diametroBase: e.target.value ? Number(e.target.value) : null })} />
                </CCol>
              </CRow>
              <CRow className="mb-3 g-2">
                <CCol>
                  <CFormLabel>Calidad del hormigón</CFormLabel>
                  <CFormInput placeholder="Ej. H25 — 250 kgf/cm²" value={editForm.resistenciaHormigon ?? ""} onChange={(e) => setEditForm({ ...editForm, resistenciaHormigon: e.target.value })} />
                </CCol>
                <CCol>
                  <CFormLabel>Norma / código ANDE (opcional)</CFormLabel>
                  <CFormInput value={editForm.normaAnde ?? ""} onChange={(e) => setEditForm({ ...editForm, normaAnde: e.target.value })} />
                </CCol>
              </CRow>
              <div className="mb-3">
                <CFormLabel>Armadura</CFormLabel>
                <CFormInput placeholder="Ej. 8 varillas de 8mm + zunchado" value={editForm.armadura ?? ""} onChange={(e) => setEditForm({ ...editForm, armadura: e.target.value })} />
              </div>
              <div className="mb-3">
                <CFormLabel>Notas</CFormLabel>
                <CFormTextarea rows={2} value={editForm.notas ?? ""} onChange={(e) => setEditForm({ ...editForm, notas: e.target.value })} />
              </div>
              <CFormCheck id="edit-spec-activo" label="Especificación activa (se puede elegir para lotes nuevos)" checked={editForm.activo !== false} onChange={(e) => setEditForm({ ...editForm, activo: e.target.checked })} />
            </CModalBody>
            <CModalFooter>
              <CButton color="secondary" variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</CButton>
              <CButton color="primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
            </CModalFooter>
          </CForm>
        </CModal>
      )}

      <CModal visible={recipeModalOpen} onClose={() => setRecipeModalOpen(false)} alignment="center" size="lg">
        <CModalHeader><CModalTitle>{editingRecipe ? "Editar" : "Agregar"} material a la receta</CModalTitle></CModalHeader>
        <CForm onSubmit={handleRecipeSubmit}>
          <CModalBody>
            {recipeError && <CAlert color="danger">{recipeError}</CAlert>}
            <div className="mb-3">
              <CFormLabel>Material</CFormLabel>
              {editingRecipe ? (
                <CFormInput value={`${editingRecipe.materialNombre} (${editingRecipe.unidad})`} disabled />
              ) : (
                <CFormSelect value={recipeForm.materialId} onChange={(e) => setRecipeForm({ ...recipeForm, materialId: e.target.value })} required>
                  <option value="">Seleccioná…</option>
                  {availableMaterials.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.unidad})</option>)}
                </CFormSelect>
              )}
            </div>
            <div className="mb-3">
              <CFormLabel>{cantidadLabel}</CFormLabel>
              <CFormInput type="number" step="0.001" min={0} value={recipeForm.cantidadPorPoste || ""} onChange={(e) => setRecipeForm({ ...recipeForm, cantidadPorPoste: Number(e.target.value) })} required />
            </div>
            <div className="mb-1">
              <CFormLabel>Notas (opcional)</CFormLabel>
              <CFormTextarea rows={2} value={recipeForm.notas ?? ""} onChange={(e) => setRecipeForm({ ...recipeForm, notas: e.target.value })} />
            </div>
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" variant="ghost" onClick={() => setRecipeModalOpen(false)}>Cancelar</CButton>
            <CButton color="primary" type="submit" disabled={savingRecipe}>{savingRecipe ? "Guardando…" : "Guardar"}</CButton>
          </CModalFooter>
        </CForm>
      </CModal>
    </AppShell>
  );
}
