import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend base URL used by the Vite dev-server proxy. In production the
// app is served by nginx which proxies /api to the backend container.
const backendTarget = process.env.VITE_BACKEND_URL || "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
});
