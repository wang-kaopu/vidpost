import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(appRoot, "src"),
      "@shared": path.resolve(appRoot, "../shared"),
    },
  },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(appRoot, "dist"),
    emptyOutDir: true,
  },
});
