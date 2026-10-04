import type { Metadata } from "next";
import "bootstrap/dist/css/bootstrap.min.css";
import "@coreui/coreui/dist/css/coreui.min.css";
import "animate.css";
import "sweetalert2/dist/sweetalert2.min.css";
import "./globals.css";
import NumberInputWheelGuard from "@/components/NumberInputWheelGuard";

export const metadata: Metadata = {
  title: "ObrasFlow",
  description: "Gestión de proyectos de obras civiles, eléctricas y viales.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: el script de abajo agrega atributos al <html>
    // antes de que React tome la página, y eso no es un error.
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Aplica el tema y el menú oculto guardados (ver AppShell) antes del
            primer pintado: así el modo oscuro no arranca con un destello
            claro ni el menú se abre y se cierra solo al entrar. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var h=document.documentElement;h.setAttribute("data-coreui-theme",localStorage.getItem("obrasflow-theme")==="dark"?"dark":"light");if(localStorage.getItem("obrasflow-menu")==="oculto")h.setAttribute("data-menu-oculto","")}catch(e){}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NumberInputWheelGuard />
        {children}
      </body>
    </html>
  );
}
