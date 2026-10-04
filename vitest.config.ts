import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests de lógica pura (sin base ni red). El alias "@/..." es el mismo de tsconfig.json.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts", "worker/**/*.test.mts"],
    environment: "node",
    env: { TZ: "UTC" }, // como Vercel: lo que dependa de la hora de Paraguay tiene que fijarla a mano
  },
});
