"use client";

import { useEffect } from "react";
import { HardHat } from "@phosphor-icons/react";
import Icon from "@/components/ui/Icon";
import "@/app/styles/auth.css";

/**
 * Marco de las pantallas que se ven antes de entrar (ingresar, invitación):
 * la marca de ObrasFlow arriba y una tarjeta centrada, sin el menú de la app.
 */
export default function PantallaIngreso({ titulo, subtitulo, children, nota }: { titulo: string; subtitulo?: string; children: React.ReactNode; nota?: React.ReactNode }) {
  // Mismo tema (claro/oscuro) que eligió la persona dentro de la app (ver AppShell).
  useEffect(() => {
    let tema = "light";
    try {
      tema = localStorage.getItem("obrasflow-theme") === "dark" ? "dark" : "light";
    } catch {
      // Sin acceso al almacenamiento (modo privado): queda en claro.
    }
    document.documentElement.setAttribute("data-coreui-theme", tema);
  }, []);

  return (
    <main className="of-auth">
      <div className="of-auth-box">
        <div className="of-auth-brand">
          <span className="of-brand-mark">
            <Icon icon={HardHat} size={22} weight="bold" />
          </span>
          <span className="of-brand-text">ObrasFlow</span>
        </div>
        <section className="of-auth-card" aria-labelledby="of-auth-titulo">
          <h1 id="of-auth-titulo">{titulo}</h1>
          {subtitulo && <p className="of-auth-sub">{subtitulo}</p>}
          {children}
        </section>
        {nota && <p className="of-auth-note">{nota}</p>}
      </div>
    </main>
  );
}
