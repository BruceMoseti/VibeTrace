import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend build lands in dist/ and is served by the Express server in production.
// In dev, the Vite dev server proxies API calls to the Express server on :3001.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      // The bundled app under test is served by Express, so it has to be
      // reachable from the dev server too.
      "/demo-app": "http://localhost:3001",
    },
  },
});
