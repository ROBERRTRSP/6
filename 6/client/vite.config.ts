import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = process.env.VITE_API_PORT ?? "43778";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});
