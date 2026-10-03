"use client";

import Swal from "sweetalert2";

// Diálogos con SweetAlert2 y el estilo de la app. Es la ÚNICA forma de
// confirmar o avisar algo: nada de window.alert/confirm (el navegador los
// puede silenciar sin avisar) ni modales de confirmación propios.
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
    title: o.titulo,
    text: o.texto,
    icon: (o.peligro ? "warning" : "question") as "warning" | "question",
    showCancelButton: true,
    confirmButtonText: o.confirmar ?? (o.peligro ? "Eliminar" : "Sí, seguir"),
    cancelButtonText: o.cancelar ?? "Cancelar",
    focusCancel: Boolean(o.peligro),
    customClass: o.peligro
      ? { popup: "of-swal", confirmButton: "btn btn-danger mx-1", cancelButton: "btn btn-outline-secondary mx-1", validationMessage: "of-swal-error" }
      : undefined,
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

/** Aviso con un solo botón. */
export function avisar(titulo: string, texto?: string, tipo: Tipo = "info") {
  return base.fire({ title: titulo, text: texto, icon: tipo, confirmButtonText: "Entendido" });
}

/** Notificación chica en la esquina, que se cierra sola. Los errores duran más. */
export function notificar(texto: string, tipo: Tipo = "success") {
  return Swal.fire({
    toast: true,
    position: "bottom-end",
    icon: tipo,
    title: texto,
    showConfirmButton: false,
    showCloseButton: tipo === "error",
    timer: tipo === "error" ? 6000 : 2600,
    timerProgressBar: false,
    customClass: { popup: "of-swal" },
  });
}
