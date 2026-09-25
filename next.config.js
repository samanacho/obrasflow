/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Solo los usa el conector local de WhatsApp (worker/): no se empaquetan en la app.
    serverComponentsExternalPackages: ["@anthropic-ai/claude-agent-sdk", "@whiskeysockets/baileys", "embedded-postgres"],
  },
};

module.exports = nextConfig;
