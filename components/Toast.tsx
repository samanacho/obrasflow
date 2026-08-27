"use client";

/** Ver lib/useToast.ts — reemplazo de window.alert() para toda la app. */
export default function Toast({ message }: { message: string | null }) {
  return <div className={"toast" + (message ? " show" : "")}>{message}</div>;
}
