// Avatar de Memby: una "M" con casco de obra, en los colores de la paleta
// (paleta Salvia: verde tranquilo + casco amarillo, ver .memby-theme). SVG propio, sin imágenes.

export default function MembyAvatar({ size = 40, online = false }: { size?: number; online?: boolean }) {
  return (
    <span className="memby-avatar" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <circle cx="32" cy="32" r="32" fill="var(--accent)" />
        {/* casco */}
        <path d="M14 30c0-10 8-17 18-17s18 7 18 17z" fill="var(--electrico)" />
        <rect x="11" y="29" width="42" height="5" rx="2.5" fill="var(--electrico)" />
        <rect x="29" y="11" width="6" height="10" rx="3" fill="var(--electrico-soft)" opacity=".9" />
        {/* M */}
        <path
          d="M20 50V37l6 7 6-7 6 7 6-7v13"
          fill="none"
          stroke="var(--surface)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {online && <span className="memby-avatar-dot" />}
    </span>
  );
}
