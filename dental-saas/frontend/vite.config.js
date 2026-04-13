import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@packages": path.resolve(__dirname, "../packages"),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: "localhost",
        // Tell Express which hostname sent the request so edgeRouter
        // can correctly detect the loopback host even with changeOrigin=true.
        headers: {
          "X-Forwarded-Host": "localhost",
          "x-region-code": "EG", // dev region fallback — overridden by jwt regionCode
        },
        configure: (proxy) => {
          proxy.on("error", (err) => {
            console.error("[Vite Proxy] /api error:", err.message);
          });
        },
      },
      // Socket.IO — WebSocket upgrade proxy
      "/socket.io": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      // Uploaded files (photos, STL, etc.) — served by Express static middleware
      "/uploads": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
      // Bull Board dashboard + admin diagnostic endpoints
      "/admin": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: "localhost",
        headers: {
          "X-Forwarded-Host": "localhost",
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});