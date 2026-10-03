"use client";

import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Captions from "yet-another-react-lightbox/plugins/captions";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";

// Visor de fotos y comprobantes a pantalla completa, con zoom (rueda del
// mouse, doble clic o pellizco) y flechas para pasar de una a otra.
// Los PDF no van acá: se abren en una pestaña nueva.
//
//   const [open, setOpen] = useState<number | null>(null);
//   <img onClick={() => setOpen(0)} ... />
//   <ImageViewer images={[{ src: url, title: "Factura ferretería" }]} index={open} onClose={() => setOpen(null)} />

export interface ViewerImage {
  src: string;
  title?: string;
}

export default function ImageViewer({
  images,
  index,
  onClose,
}: {
  images: ViewerImage[];
  /** Imagen abierta, o null si el visor está cerrado. */
  index: number | null;
  onClose: () => void;
}) {
  return (
    <Lightbox
      open={index !== null}
      index={index ?? 0}
      close={onClose}
      slides={images.map((i) => ({ src: i.src, title: i.title }))}
      plugins={[Zoom, Captions]}
      zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true }}
      carousel={{ finite: images.length <= 1 }}
      render={images.length <= 1 ? { buttonPrev: () => null, buttonNext: () => null } : undefined}
      animation={{ fade: 150, swipe: 200 }}
      labels={{ Close: "Cerrar", Previous: "Anterior", Next: "Siguiente", "Zoom in": "Acercar", "Zoom out": "Alejar" }}
      className="of-viewer"
    />
  );
}
