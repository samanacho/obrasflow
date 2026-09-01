"use client";

import { useMemo, useRef, useState } from "react";
import type { AttachmentDTO } from "@/lib/types";

const MAX_SIZE_MB = 4;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/*,application/pdf";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Arrastrar y soltar (o clic para elegir) una foto o PDF de comprobante —
 * el objetivo puntual es que cargar el respaldo de un gasto no dependa de
 * subirlo a otro lado y pegar un link, que era la única opción hasta
 * ahora (ver el campo "comprobante" de lib/itemKinds.ts).
 *
 * Trabaja con un `File` local todavía sin subir: el padre (ItemFormModal)
 * recién sube el archivo de verdad después de guardar el item, porque el
 * adjunto se guarda asociado a un ProjectItem.id que para un item nuevo
 * todavía no existe hasta ese momento.
 */
export default function FileDropZone({
  file,
  existingAttachment,
  markedForRemoval,
  onFileSelected,
  onToggleRemove,
}: {
  file: File | null;
  existingAttachment: AttachmentDTO | null;
  markedForRemoval: boolean;
  onFileSelected: (f: File | null) => void;
  onToggleRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  // No hace falta revocar el object URL con useEffect acá: el componente
  // vive dentro de un CModal que se desmonta entero al cerrarse, y mientras
  // tanto solo se crea una URL nueva por selección de archivo (no en cada render).

  function validateAndSet(f: File) {
    setError(null);
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError("Formato no soportado — subí una foto (JPG/PNG/WEBP/HEIC) o un PDF.");
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`El archivo no puede superar los ${MAX_SIZE_MB}MB.`);
      return;
    }
    onFileSelected(f);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) validateAndSet(f);
  }

  const showingExisting = Boolean(existingAttachment) && !markedForRemoval && !file;
  const previewIsImage = file
    ? file.type.startsWith("image/")
    : showingExisting
    ? (existingAttachment!.mimeType.startsWith("image/"))
    : false;
  const previewUrl = file ? objectUrl : showingExisting ? `/api/attachments/${existingAttachment!.id}` : null;
  const displayName = file ? file.name : showingExisting ? existingAttachment!.filename : null;
  const displaySize = file ? file.size : showingExisting ? existingAttachment!.size : null;

  return (
    <div>
      {!previewUrl ? (
        <div
          className={"of-dropzone" + (dragging ? " dragging" : "")}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div className="of-dropzone-icon">📎</div>
          <div className="of-dropzone-text">
            <strong>Arrastrá y soltá</strong> una foto o PDF acá, o hacé clic para elegir el archivo.
          </div>
          <div className="form-hint mb-0">JPG, PNG, WEBP, HEIC o PDF — hasta {MAX_SIZE_MB}MB.</div>
        </div>
      ) : (
        <div className="of-dropzone-preview">
          {previewIsImage ? (
            <img src={previewUrl} alt={displayName ?? "Comprobante"} className="of-dropzone-thumb" />
          ) : (
            <div className="of-dropzone-file-icon">📄</div>
          )}
          <div className="of-dropzone-meta">
            <div className="fw-semibold">{displayName}</div>
            {displaySize != null && <div className="text-body-secondary small">{fmtSize(displaySize)}</div>}
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => { if (file) onFileSelected(null); else onToggleRemove(); }}
          >
            Quitar
          </button>
        </div>
      )}
      {error && <div className="form-error mt-1">{error}</div>}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="d-none"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) validateAndSet(f); e.target.value = ""; }}
      />
    </div>
  );
}
