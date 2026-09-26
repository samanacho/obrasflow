"use client";

import Swal from "sweetalert2";

// Diálogos con SweetAlert2 y el estilo de la app. Usar estos helpers en vez de
// window.alert/confirm (ver también components/ConfirmDialog.tsx y Toast).

const base = Swal.mixin({
  buttonsStyling: false,
  reverseButtons: true,
  customClass: {
    popup: "of-swal",
    confirmButton: "btn btn-primary mx-1",
    cancelButton: "btn btn-outline-secondary mx-1",
    denyButton: "btn btn-outline-danger mx-1",
  },
  showClass: { popup: "animate__animated animate__fadeInDown animate__faster" },
  hideClass: { popup: "animate__animated animate__fadeOutUp animate__faster" },
});

/** Pregunta Sí/No. Devuelve true si confirmó. */
export async function confirmar(opts: { titulo: string; texto?: string; confirmar?: string; cancelar?: string; peligro?: boolean }) {
  const r = await base.fire({
    title: opts.titulo,
    text: opts.texto,
    icon: opts.peligro ? "warning" : "question",
    showCancelButton: true,
    confirmButtonText: opts.confirmar ?? "Sí, seguir",
    cancelButtonText: opts.cancelar ?? "Cancelar",
    customClass: opts.peligro ? { confirmButton: "btn btn-danger mx-1", cancelButton: "btn btn-outline-secondary mx-1", popup: "of-swal" } : undefined,
  });
  return r.isConfirmed;
}

/** Aviso con un solo botón. */
export function avisar(titulo: string, texto?: string, tipo: "success" | "error" | "info" | "warning" = "info") {
  return base.fire({ title: titulo, text: texto, icon: tipo, confirmButtonText: "Entendido" });
}

/** Notificación chica en la esquina, que se cierra sola. */
export function notificar(texto: string, tipo: "success" | "error" | "info" | "warning" = "success") {
  return Swal.fire({
    toast: true,
    position: "bottom-end",
    icon: tipo,
    title: texto,
    showConfirmButton: false,
    timer: 2600,
    timerProgressBar: true,
    customClass: { popup: "of-swal" },
  });
}
