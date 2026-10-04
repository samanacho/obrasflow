"use client";

import Swal from "sweetalert2";

// Diálogos con SweetAlert2 y el estilo de la app. Es la ÚNICA forma de
// confirmar o avisar algo: nada de window.alert/confirm (el navegador los
// puede silenciar sin avisar) ni modales de confirmación propios.
// Títulos y textos se muestran siempre como texto, nunca como HTML: así un
// nombre cargado por otra persona (un usuario, un proveedor) no puede meter código.
//
//   if (await confirmar({ titulo: "¿Seguimos?" })) { ... }
//   await confirmarAccion({ titulo: "¿Eliminar la obra?", peligro: true, accion: () => borrar(id) });
//   notificar("Guardado");              // chiquito, se cierra solo
//   notificar("No se pudo guardar.", "error");

const base = Swal.mixin({
  buttonsStyling: false,
  reverseButtons: true,
  focusCancel: false,
  customClass: {
    popup: "of-swal",
    confirmButton: "btn btn-primary mx-1",
    cancelButton: "btn btn-outline-secondary mx-1",
    denyButton: "btn btn-outline-danger mx-1",
    validationMessage: "of-swal-error",
  },
  // Sin animaciones de entrada: el diálogo aparece en su lugar, sin saltos.
  showClass: { popup: "" },
  hideClass: { popup: "" },
});

type Tipo = "success" | "error" | "info" | "warning";

interface OpcionesConfirmar {
  titulo: string;
  texto?: string;
  confirmar?: string;
  cancelar?: string;
  /** Acción que borra o pierde datos: botón rojo y el foco arranca en "Cancelar". */
  peligro?: boolean;
}

function opciones(o: OpcionesConfirmar) {
  return {
    titleText: o.titulo,
    text: o.texto,
    icon: (o.peligro ? "warning" : "question") as "warning" | "question",
    showCancelButton: true,
    confirmButtonText: o.confirmar ?? (o.peligro ? "Eliminar" : "Sí, seguir"),
    cancelButtonText: o.cancelar ?? "Cancelar",
    focusCancel: Boolean(o.peligro),
    // Solo se pisa el estilo cuando es peligroso: un `customClass: undefined`
    // borraba el de la base y el diálogo salía sin el estilo de la app.
    ...(o.peligro
      ? { customClass: { popup: "of-swal", confirmButton: "btn btn-danger mx-1", cancelButton: "btn btn-outline-secondary mx-1", validationMessage: "of-swal-error" } }
      : {}),
  };
}

/** Pregunta Sí/No. Devuelve true si confirmó. */
export async function confirmar(o: OpcionesConfirmar) {
  const r = await base.fire(opciones(o));
  return r.isConfirmed;
}

/**
 * Pregunta y, si confirma, ejecuta `accion` con el diálogo abierto
 * ("Un momento…"). Si la acción falla, el error se muestra adentro del mismo
 * diálogo y se puede reintentar o cancelar. Devuelve true si se hizo.
 */
export async function confirmarAccion(o: OpcionesConfirmar & { accion: () => Promise<unknown> }) {
  const r = await base.fire({
    ...opciones(o),
    showLoaderOnConfirm: true,
    allowOutsideClick: () => !Swal.isLoading(),
    preConfirm: async () => {
      try {
        await o.accion();
        return true;
      } catch (err: any) {
        Swal.showValidationMessage(err?.message || "No se pudo completar. Probá de nuevo.");
        return false;
      }
    },
  });
  return r.isConfirmed;
}

/**
 * Como confirmarAccion, pero con un campo de texto (por ejemplo, el motivo de
 * un rechazo). El texto puede quedar vacío salvo que `obligatorio` sea true.
 * `accion` recibe lo escrito. Devuelve true si se hizo.
 */
export async function confirmarConTexto(
  o: OpcionesConfirmar & {
    etiqueta: string;
    placeholder?: string;
    obligatorio?: boolean;
    /** Texto con el que arranca el campo (por ejemplo, el nombre actual). */
    valor?: string;
    /** "linea" para un dato corto (un nombre): Enter confirma. Por defecto, un párrafo. */
    campo?: "parrafo" | "linea";
    accion: (texto: string) => Promise<unknown>;
  }
) {
  const r = await base.fire({
    ...opciones(o),
    input: o.campo === "linea" ? "text" : "textarea",
    inputValue: o.valor ?? "",
    inputLabel: o.etiqueta,
    inputPlaceholder: o.placeholder,
    inputAttributes: { "aria-label": o.etiqueta, ...(o.campo === "linea" ? { maxlength: "80", autocomplete: "off" } : {}) },
    showLoaderOnConfirm: true,
    allowOutsideClick: () => !Swal.isLoading(),
    preConfirm: async (valor: string) => {
      const texto = String(valor ?? "").trim();
      if (o.obligatorio && !texto) {
        Swal.showValidationMessage("Escribí algo para seguir.");
        return false;
      }
      try {
        await o.accion(texto);
        return true;
      } catch (err: any) {
        Swal.showValidationMessage(err?.message || "No se pudo completar. Probá de nuevo.");
        return false;
      }
    },
  });
  return r.isConfirmed;
}

/**
 * Muestra un link para pasarle a otra persona, con "Copiar link" y "Mandar
 * por WhatsApp" (abre WhatsApp con el mensaje ya escrito). Los textos se
 * insertan como texto, nunca como HTML.
 */
export function compartirLink(o: { titulo: string; texto?: string; link: string; mensajeWhatsApp: string; nota?: string }) {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string | boolean> = {}, ...hijos: (Node | string)[]): HTMLElementTagNameMap[K] => {
    const n = document.createElement(tag);
    Object.assign(n, props);
    n.append(...hijos);
    return n;
  };
  // El link entero a la vista (se parte en renglones), y se marca de un toque.
  const campo = el("div", { className: "of-share-link" }, o.link);
  const marcar = () => {
    const rango = document.createRange();
    rango.selectNodeContents(campo);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(rango);
  };
  campo.addEventListener("click", marcar);
  const estado = el("p", { className: "of-share-estado" });
  estado.setAttribute("role", "status");
  const copiar = el("button", { type: "button", className: "btn btn-primary" }, "Copiar link");
  copiar.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(o.link);
      estado.classList.remove("is-aviso");
      copiar.textContent = "Copiado";
      estado.textContent = "Listo, el link quedó copiado. Pegalo en un mensaje.";
      setTimeout(() => (copiar.textContent = "Copiar link"), 2500);
    } catch {
      // Sin permiso para el portapapeles: queda marcado para copiarlo a mano.
      marcar();
      estado.classList.add("is-aviso");
      estado.textContent = "No se pudo copiar solo. El link quedó marcado: copialo con Ctrl+C (o mantené apretado en el celular).";
    }
  });
  const whatsapp = el(
    "a",
    { className: "btn btn-outline-success", href: `https://wa.me/?text=${encodeURIComponent(o.mensajeWhatsApp)}`, target: "_blank", rel: "noopener noreferrer" },
    "Mandar por WhatsApp"
  );
  const cuerpo = el(
    "div",
    { className: "of-share" },
    ...(o.texto ? [el("p", {}, o.texto)] : []),
    campo,
    el("div", { className: "of-share-acciones" }, copiar, whatsapp),
    estado,
    ...(o.nota ? [el("p", { className: "of-share-nota" }, o.nota)] : [])
  );
  return base.fire({
    titleText: o.titulo,
    html: cuerpo,
    icon: "success",
    confirmButtonText: "Listo",
    focusConfirm: false,
    // "Copiar link" es la acción principal; "Listo" solo cierra.
    customClass: { popup: "of-swal", confirmButton: "btn btn-outline-secondary mx-1" },
    didOpen: () => copiar.focus(),
  });
}

/** Aviso con un solo botón. */
export function avisar(titulo: string, texto?: string, tipo: Tipo = "info") {
  return base.fire({ titleText: titulo, text: texto, icon: tipo, confirmButtonText: "Entendido" });
}

/** Notificación chica en la esquina, que se cierra sola. Los errores duran más. */
export function notificar(texto: string, tipo: Tipo = "success") {
  return Swal.fire({
    toast: true,
    position: "bottom-end",
    icon: tipo,
    titleText: texto,
    showConfirmButton: false,
    showCloseButton: tipo === "error",
    timer: tipo === "error" ? 6000 : 2600,
    timerProgressBar: false,
    customClass: { popup: "of-swal" },
  });
}
