"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CModal, CModalBody } from "@coreui/react";
import { dayjs } from "@/lib/dayjs";

// Misma forma que devuelve GET /api/projects/[id]/files (solo metadata —
// el contenido real de cada archivo se pide aparte a /api/attachments/[id]).
interface FileItemRef {
  id: string;
  kind: string;
  kindLabel: string;
  icon: string;
  title: string;
  fecha: string;
  monto: number | null;
}

interface AttachmentEntry {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  isLink?: false;
  item: FileItemRef;
}

interface LinkEntry {
  id: string;
  url: string;
  isLink: true;
  createdAt: string;
  item: FileItemRef;
}

type FileEntry = AttachmentEntry | LinkEntry;

type Filter = "all" | "photos" | "pdf" | "receipts" | "links";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "photos", label: "Fotos" },
  { key: "pdf", label: "PDF" },
  { key: "receipts", label: "Comprobantes de gastos" },
  { key: "links", label: "Enlaces" },
];

function isImage(e: FileEntry): e is AttachmentEntry {
  return !e.isLink && e.mimeType.startsWith("image/");
}

function isPdf(e: FileEntry): boolean {
  return !e.isLink && (e.mimeType === "application/pdf" || e.filename.toLowerCase().endsWith(".pdf"));
}

function matchesFilter(e: FileEntry, f: Filter): boolean {
  switch (f) {
    case "photos": return isImage(e);
    case "pdf": return isPdf(e);
    case "receipts": return !e.isLink && e.item.kind === "change_order";
    case "links": return !!e.isLink;
    default: return true;
  }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function fmtMonto(n: number): string {
  return `Gs. ${Math.round(n).toLocaleString("es-PY")}`;
}

function fmtDate(ymd: string): string {
  const d = dayjs(ymd.slice(0, 10), "YYYY-MM-DD");
  return d.isValid() ? d.format("D MMM YYYY") : ymd;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function fileUrl(id: string): string {
  return `/api/attachments/${encodeURIComponent(id)}`;
}

/**
 * Galería "Fotos y documentos" de la ficha de una obra: junta en un solo
 * lugar todas las fotos, PDFs y comprobantes adjuntos a cualquier registro
 * de la obra (Fotos de avance, Documentos, gastos de Ejecución...), más los
 * enlaces externos que se cargaron sin archivo.
 *
 * Para refrescar desde el padre (ej. después de subir una foto nueva),
 * incrementá `reloadKey`.
 */
export default function FilesGallery({
  projectId,
  onUpload,
  reloadKey,
}: {
  projectId: string;
  onUpload: (kind: "photo" | "document") => void;
  /** Cambiá este número para que la galería vuelva a pedir los archivos. */
  reloadKey?: number;
}) {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json() as Promise<FileEntry[]>;
      })
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch((err: any) => { if (!cancelled) setError(err?.message || "No se pudieron cargar los archivos."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, reloadKey, retryTick]);

  const counts = useMemo(() => {
    const list = entries ?? [];
    return {
      photos: list.filter(isImage).length,
      docs: list.filter((e) => !e.isLink && !isImage(e)).length,
      links: list.filter((e) => e.isLink).length,
    };
  }, [entries]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (entries ?? []).filter((e) => {
      if (!matchesFilter(e, filter)) return false;
      if (!q) return true;
      const haystack = [e.item.title, e.isLink ? e.url : e.filename].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, filter, search]);

  const images = useMemo(() => visible.filter(isImage), [visible]);
  const lightboxIndex = lightboxId ? images.findIndex((i) => i.id === lightboxId) : -1;
  const current = lightboxIndex >= 0 ? images[lightboxIndex] : null;

  const go = useCallback(
    (delta: number) => {
      if (images.length === 0 || lightboxIndex < 0) return;
      const next = (lightboxIndex + delta + images.length) % images.length;
      setLightboxId(images[next].id);
    },
    [images, lightboxIndex]
  );

  useEffect(() => {
    if (!current) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "ArrowRight") { ev.preventDefault(); go(1); }
      else if (ev.key === "ArrowLeft") { ev.preventDefault(); go(-1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, go]);

  // Si el filtro/búsqueda deja afuera la imagen abierta, se cierra el visor.
  useEffect(() => {
    if (lightboxId && lightboxIndex < 0) setLightboxId(null);
  }, [lightboxId, lightboxIndex]);

  const total = entries?.length ?? 0;
  const summaryParts = [
    `${counts.photos} ${counts.photos === 1 ? "foto" : "fotos"}`,
    `${counts.docs} ${counts.docs === 1 ? "documento" : "documentos"}`,
    ...(counts.links > 0 ? [`${counts.links} ${counts.links === 1 ? "enlace" : "enlaces"}`] : []),
  ];

  return (
    <section className="fg-root" aria-label="Fotos y documentos">
      <div className="fg-header">
        <div>
          <h3 className="fg-title">Fotos y documentos</h3>
          {entries && <p className="fg-counts">{summaryParts.join(" · ")}</p>}
        </div>
        <div className="fg-actions">
          <button type="button" className="fg-btn fg-btn-primary" onClick={() => onUpload("photo")}>
            📷 Subir foto
          </button>
          <button type="button" className="fg-btn" onClick={() => onUpload("document")}>
            📄 Subir documento
          </button>
        </div>
      </div>

      {total > 0 && (
        <div className="fg-toolbar">
          <div className="fg-chips" role="tablist" aria-label="Filtrar archivos">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={`fg-chip${filter === f.key ? " is-active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            className="fg-search"
            placeholder="Buscar por nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar por título o nombre de archivo"
          />
        </div>
      )}

      {loading && !entries ? (
        <div className="fg-grid" aria-busy="true" aria-label="Cargando archivos">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="fg-card fg-skeleton">
              <div className="fg-thumb fg-skel-block" />
              <div className="fg-meta">
                <div className="fg-skel-line" style={{ width: "80%" }} />
                <div className="fg-skel-line" style={{ width: "55%" }} />
              </div>
            </div>
          ))}
        </div>
      ) : error && !entries ? (
        <div className="fg-state fg-state-error" role="alert">
          <p>No pudimos cargar las fotos y documentos. {error}</p>
          <button type="button" className="fg-btn" onClick={() => setRetryTick((t) => t + 1)}>
            Reintentar
          </button>
        </div>
      ) : total === 0 ? (
        <div className="fg-state fg-empty">
          <div className="fg-empty-icon" aria-hidden>🖼️</div>
          <p>Todavía no hay fotos ni documentos. Subí la primera foto de la obra o adjuntá comprobantes a los gastos.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="fg-state">
          <p>No hay archivos que coincidan con este filtro.</p>
          <button type="button" className="fg-btn" onClick={() => { setFilter("all"); setSearch(""); }}>
            Ver todo
          </button>
        </div>
      ) : (
        <>
          {error && (
            <div className="fg-inline-error" role="alert">
              No se pudo actualizar la lista. {" "}
              <button type="button" className="fg-link-btn" onClick={() => setRetryTick((t) => t + 1)}>Reintentar</button>
            </div>
          )}
          <div className={`fg-grid${loading ? " is-refreshing" : ""}`}>
            {visible.map((e) => (
              <FileCard key={e.id} entry={e} onOpenImage={setLightboxId} />
            ))}
          </div>
        </>
      )}

      <CModal
        visible={!!current}
        onClose={() => setLightboxId(null)}
        size="xl"
        alignment="center"
        className="fg-lightbox"
      >
        {current && (
          <CModalBody className="fg-lb-body">
            <button type="button" className="fg-lb-close" onClick={() => setLightboxId(null)} aria-label="Cerrar">
              ✕
            </button>
            <div className="fg-lb-stage">
              {images.length > 1 && (
                <button type="button" className="fg-lb-nav fg-lb-prev" onClick={() => go(-1)} aria-label="Foto anterior">
                  ‹
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(current.id)} alt={current.item.title || current.filename} className="fg-lb-img" />
              {images.length > 1 && (
                <button type="button" className="fg-lb-nav fg-lb-next" onClick={() => go(1)} aria-label="Foto siguiente">
                  ›
                </button>
              )}
            </div>
            <div className="fg-lb-caption">
              <div>
                <strong>{current.item.title || current.filename}</strong>
                <span className="fg-lb-sub">
                  {current.item.icon} {current.item.kindLabel} · {fmtDate(current.item.fecha)}
                  {current.item.monto !== null && ` · ${fmtMonto(current.item.monto)}`}
                  {images.length > 1 && ` · ${lightboxIndex + 1} de ${images.length}`}
                </span>
              </div>
              <div className="fg-lb-links">
                <a href={fileUrl(current.id)} target="_blank" rel="noopener noreferrer">Abrir en pestaña nueva</a>
                <a href={fileUrl(current.id)} download={current.filename}>Descargar</a>
              </div>
            </div>
          </CModalBody>
        )}
      </CModal>
    </section>
  );
}

function FileCard({ entry, onOpenImage }: { entry: FileEntry; onOpenImage: (id: string) => void }) {
  const { item } = entry;

  const meta = (
    <div className="fg-meta">
      <div className="fg-card-title" title={item.title}>{item.title || (entry.isLink ? hostOf(entry.url) : entry.filename)}</div>
      <div className="fg-card-kind">{item.icon} {item.kindLabel}</div>
      <div className="fg-card-info">
        <span>{fmtDate(item.fecha)}</span>
        {item.monto !== null && <span className="fg-card-monto">{fmtMonto(item.monto)}</span>}
        {!entry.isLink && <span>{fmtSize(entry.size)}</span>}
      </div>
    </div>
  );

  if (entry.isLink) {
    const tile = (
      <>
        <div className="fg-thumb fg-tile fg-tile-link">
          <span className="fg-tile-icon" aria-hidden>🔗</span>
          <span className="fg-tile-name">{hostOf(entry.url)}</span>
        </div>
        {meta}
      </>
    );
    // Solo http(s) se vuelve enlace: un "javascript:..." guardado se
    // ejecutaría al tocarlo. Cualquier otra cosa se muestra como texto.
    return /^https?:\/\//i.test(entry.url.trim()) ? (
      <a className="fg-card" href={entry.url} target="_blank" rel="noopener noreferrer" title={entry.url}>
        {tile}
      </a>
    ) : (
      <div className="fg-card" title={entry.url}>
        {tile}
      </div>
    );
  }

  if (entry.mimeType.startsWith("image/")) {
    return (
      <button type="button" className="fg-card" onClick={() => onOpenImage(entry.id)} title={entry.filename}>
        <div className="fg-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(entry.id)} alt={item.title || entry.filename} loading="lazy" />
        </div>
        {meta}
      </button>
    );
  }

  return (
    <a className="fg-card" href={fileUrl(entry.id)} target="_blank" rel="noopener noreferrer" title={entry.filename}>
      <div className={`fg-thumb fg-tile${isPdf(entry) ? " fg-tile-pdf" : ""}`}>
        <span className="fg-tile-icon" aria-hidden>📄</span>
        <span className="fg-tile-name">{entry.filename}</span>
      </div>
      {meta}
    </a>
  );
}
