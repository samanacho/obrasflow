"use client";

import { useEffect, useState } from "react";
import {
  CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter,
  CForm, CFormLabel, CFormInput, CFormSelect, CFormTextarea,
  CButton, CAlert, CProgress, CRow, CCol,
} from "@coreui/react";
import CIcon from "@coreui/icons-react";
import { cilArrowLeft, cilBriefcase, cilHome } from "@coreui/icons";
import type { ProjectDTO, ProjectInput, ProjectStatus, ProjectType, ProjectSector } from "@/lib/types";
import { PUBLIC_FIELDS, PRIVATE_FIELDS, SectorField } from "@/lib/sectorFields";
import CityMultiSelect from "@/components/CityMultiSelect";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planificado: "Planificado",
  en_curso: "En curso",
  pausado: "Pausado",
  finalizado: "Finalizado",
};
const STATUS_ORDER: ProjectStatus[] = ["planificado", "en_curso", "pausado", "finalizado"];

const EMPTY_FORM: ProjectInput = {
  name: "",
  type: "civil",
  customType: "",
  status: "planificado",
  manager: "",
  start: "",
  end: "",
  budget: 0,
  spent: 0,
  progress: 0,
  sector: null,
  sectorData: {},
};

function toForm(project: ProjectDTO): ProjectInput {
  return {
    name: project.name,
    type: project.type,
    customType: project.customType ?? "",
    status: project.status,
    manager: project.manager,
    start: project.start,
    end: project.end,
    budget: project.budget,
    spent: project.spent,
    progress: project.progress,
    sector: project.sector,
    sectorData: project.sectorData ?? {},
  };
}

export default function NewProjectWizard({
  visible, editingProject, initialType, onClose, onSaved,
}: {
  visible: boolean;
  editingProject: ProjectDTO | null;
  /** Rubro con el que arranca el formulario al crear (no aplica si se está editando) — útil cuando se crea desde una pantalla ya filtrada por rubro, como /rubros/[type]. */
  initialType?: ProjectType;
  onClose: () => void;
  onSaved: (p: ProjectDTO) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<ProjectInput>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep(1);
    setError(null);
    setForm(editingProject ? toForm(editingProject) : initialType ? { ...EMPTY_FORM, type: initialType } : EMPTY_FORM);
  }, [visible, editingProject, initialType]);

  function setSectorField(key: string, value: string | string[]) {
    setForm((f) => ({ ...f, sectorData: { ...(f.sectorData ?? {}), [key]: value } }));
  }

  function validateStep1(): string | null {
    if (!form.name.trim() || !form.manager.trim() || !form.start || !form.end) {
      return "Completá nombre, responsable y ambas fechas.";
    }
    if (form.type === "otro" && !form.customType?.trim()) {
      return "Especificá el rubro cuando el tipo es \"Otro\".";
    }
    return null;
  }

  function goNext() {
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
    }
    if (step === 2 && !form.sector) {
      setError("Elegí si la obra es privada o pública para continuar.");
      return;
    }
    setError(null);
    setStep((s) => (s === 1 ? 2 : 3) as 1 | 2 | 3);
  }
  function goBack() {
    setError(null);
    setStep((s) => (s === 3 ? 2 : 1) as 1 | 2 | 3);
  }

  function selectSector(sector: ProjectSector) {
    setForm((f) => ({ ...f, sector, sectorData: f.sector === sector ? f.sectorData : {} }));
  }

  const sectorFields: SectorField[] = form.sector === "publico" ? PUBLIC_FIELDS : form.sector === "privado" ? PRIVATE_FIELDS : [];

  async function handleFinish() {
    for (const f of sectorFields) {
      if (f.required && !String(form.sectorData?.[f.key] ?? "").trim()) {
        setError(`Completá "${f.label}".`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const url = editingProject ? `/api/projects/${editingProject.id}` : "/api/projects";
      const res = await fetch(url, {
        method: editingProject ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onSaved(await res.json());
    } catch (err: any) {
      setError(err.message || "No se pudo guardar el proyecto.");
    } finally {
      setSaving(false);
    }
  }

  const stepTitle = step === 1 ? "Datos generales" : step === 2 ? "Sector de la obra" : form.sector === "publico" ? "Detalles de la obra pública" : "Detalles de la obra privada";

  return (
    <CModal visible={visible} onClose={onClose} alignment="center" size="lg">
      <CModalHeader>
        <CModalTitle>{editingProject ? "Editar proyecto" : "Nuevo proyecto"} — {stepTitle}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="d-flex align-items-center gap-2 mb-3 wizard-steps">
          <span className={"wizard-step" + (step >= 1 ? " active" : "")}>1. General</span>
          <span className={"wizard-step" + (step >= 2 ? " active" : "")}>2. Sector</span>
          <span className={"wizard-step" + (step >= 3 ? " active" : "")}>3. Detalles</span>
        </div>
        <CProgress className="mb-4" value={(step / 3) * 100} color="primary" height={4} />

        {error && <CAlert color="danger">{error}</CAlert>}

        {step === 1 && <StepGeneral form={form} setForm={setForm} />}
        {step === 2 && <StepSector sector={form.sector ?? null} onSelect={selectSector} />}
        {step === 3 && <StepSectorDetails fields={sectorFields} form={form} setSectorField={setSectorField} />}
      </CModalBody>
      <CModalFooter className="d-flex justify-content-between">
        <div>
          {step > 1 && (
            <CButton color="secondary" variant="ghost" onClick={goBack}>
              <CIcon icon={cilArrowLeft} className="me-1" /> Atrás
            </CButton>
          )}
        </div>
        <div className="d-flex gap-2">
          <CButton color="secondary" variant="ghost" onClick={onClose}>Cancelar</CButton>
          {step < 3 ? (
            <CButton color="primary" onClick={goNext}>Siguiente</CButton>
          ) : (
            <CButton color="primary" onClick={handleFinish} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</CButton>
          )}
        </div>
      </CModalFooter>
    </CModal>
  );
}

function StepGeneral({ form, setForm }: { form: ProjectInput; setForm: (f: ProjectInput) => void }) {
  return (
    <>
      <div className="mb-3">
        <CFormLabel>Nombre del proyecto</CFormLabel>
        <CFormInput required placeholder="Ej. Puente Río Claro" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <CRow className="mb-3 g-2">
        <CCol>
          <CFormLabel>Tipo</CFormLabel>
          <CFormSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ProjectType, customType: e.target.value === "otro" ? form.customType : "" })}>
            <option value="civil">Civil</option>
            <option value="electrico">Eléctrico</option>
            <option value="vial">Vial</option>
            <option value="otro">Otro</option>
          </CFormSelect>
        </CCol>
        <CCol>
          <CFormLabel>Estado</CFormLabel>
          <CFormSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </CFormSelect>
        </CCol>
      </CRow>
      {form.type === "otro" && (
        <div className="mb-3">
          <CFormLabel>Especificá el rubro</CFormLabel>
          <CFormInput
            required
            placeholder="Ej. Saneamiento, forestación, demolición…"
            value={form.customType ?? ""}
            onChange={(e) => setForm({ ...form, customType: e.target.value })}
          />
        </div>
      )}
      <div className="mb-3">
        <CFormLabel>Responsable</CFormLabel>
        <CFormInput required placeholder="Ej. Ana Torres" value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} />
      </div>
      <CRow className="mb-3 g-2">
        <CCol>
          <CFormLabel>Fecha inicio</CFormLabel>
          <CFormInput type="date" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
        </CCol>
        <CCol>
          <CFormLabel>Fecha fin</CFormLabel>
          <CFormInput type="date" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </CCol>
      </CRow>
      <CRow className="mb-3 g-2">
        <CCol>
          <CFormLabel>Presupuesto (Gs.)</CFormLabel>
          <CFormInput type="number" min={0} step={1} required placeholder="0" value={form.budget === 0 ? "" : form.budget} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })} />
        </CCol>
        <CCol>
          <CFormLabel>Ejecutado (Gs.)</CFormLabel>
          <CFormInput type="number" min={0} step={1} required placeholder="0" value={form.spent === 0 ? "" : form.spent} onChange={(e) => setForm({ ...form, spent: Number(e.target.value) })} />
        </CCol>
      </CRow>
      <div className="mb-1">
        <CFormLabel>Avance (%)</CFormLabel>
        <CFormInput type="number" min={0} max={100} step={1} required placeholder="0" value={form.progress === 0 ? "" : form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} />
      </div>
    </>
  );
}

function StepSector({ sector, onSelect }: { sector: ProjectSector | null; onSelect: (s: ProjectSector) => void }) {
  return (
    <>
      <p className="module-desc mb-3">¿Esta obra es para el sector privado o es una licitación pública?</p>
      <CRow className="g-3">
        <CCol md={6}>
          <button type="button" className={"sector-pick" + (sector === "privado" ? " active" : "")} onClick={() => onSelect("privado")}>
            <CIcon icon={cilHome} size="xl" />
            <span className="sector-pick-title">Privada</span>
            <span className="sector-pick-sub">Cliente o comitente privado, sin licitación</span>
          </button>
        </CCol>
        <CCol md={6}>
          <button type="button" className={"sector-pick" + (sector === "publico" ? " active" : "")} onClick={() => onSelect("publico")}>
            <CIcon icon={cilBriefcase} size="xl" />
            <span className="sector-pick-title">Pública</span>
            <span className="sector-pick-sub">Licitación con un organismo del Estado</span>
          </button>
        </CCol>
      </CRow>
    </>
  );
}

function StepSectorDetails({
  fields, form, setSectorField,
}: {
  fields: SectorField[];
  form: ProjectInput;
  setSectorField: (key: string, value: string | string[]) => void;
}) {
  if (fields.length === 0) {
    return <p className="empty-col">No hay campos adicionales configurados para este sector todavía.</p>;
  }
  return (
    <>
      {fields.map((f) => (
        <div className="mb-3" key={f.key}>
          <CFormLabel>{f.label}{!f.required && <span className="text-body-secondary"> (opcional)</span>}</CFormLabel>
          {f.type === "multiselect" ? (
            <CityMultiSelect
              value={Array.isArray(form.sectorData?.[f.key]) ? form.sectorData[f.key] : []}
              onChange={(next) => setSectorField(f.key, next)}
              placeholder={f.placeholder}
            />
          ) : f.type === "select" ? (
            <CFormSelect required={f.required} value={String(form.sectorData?.[f.key] ?? "")} onChange={(e) => setSectorField(f.key, e.target.value)}>
              <option value="">Seleccioná…</option>
              {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
            </CFormSelect>
          ) : f.type === "text" && f.label.toLowerCase().includes("forma de pago") ? (
            <CFormTextarea rows={2} required={f.required} value={String(form.sectorData?.[f.key] ?? "")} placeholder={f.placeholder} onChange={(e) => setSectorField(f.key, e.target.value)} />
          ) : (
            <CFormInput
              type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
              required={f.required}
              placeholder={f.placeholder}
              value={String(form.sectorData?.[f.key] ?? "")}
              onChange={(e) => setSectorField(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </>
  );
}
