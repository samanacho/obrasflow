/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Solo el servidor local en modo dev (server/local-server.mjs) la define, para que
  // su compilación en caliente no pise el build de .next/. En Vercel no existe: queda .next.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  experimental: {
    // Solo los usa el conector local de WhatsApp (worker/): no se empaquetan en la app.
    serverComponentsExternalPackages: ["@anthropic-ai/claude-agent-sdk", "@whiskeysockets/baileys", "embedded-postgres"],
  },
};

module.exports = nextConfig;
