// Reconocimiento de "sí"/"no" escritos a mano para confirmar o cancelar una
// propuesta sin tocar el botón. Es deliberadamente estricto: el mensaje
// entero tiene que ser una afirmación/negación corta. "sí, pero eran 600
// mil" NO confirma (va al modelo, que arma una propuesta corregida).

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const AFFIRMATIVE = new Set([
  "si", "sii", "siii", "si si", "confirmo", "confirmar", "confirmado", "dale", "ok", "okay", "oki",
  "listo", "correcto", "esta bien", "si confirmo", "si dale", "dale si", "si correcto", "perfecto", "va",
]);
const NEGATIVE = new Set([
  "no", "noo", "cancelar", "cancela", "cancelalo", "anular", "anula", "no gracias", "no cancela", "no cancelar",
]);

export function isAffirmative(text: string): boolean {
  return AFFIRMATIVE.has(normalize(text));
}

export function isNegative(text: string): boolean {
  return NEGATIVE.has(normalize(text));
}

/** "confirm:<id>" / "cancel:<id>" -> {op, id}; null si el id del botón no es nuestro. */
export function parseButtonId(buttonId: string): { op: "confirm" | "cancel"; actionId: string } | null {
  const m = /^(confirm|cancel):([a-z0-9]{10,40})$/.exec(buttonId);
  return m ? { op: m[1] as "confirm" | "cancel", actionId: m[2] } : null;
}
