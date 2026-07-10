import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../public/sidebar",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "sidebar.js",
        assetFileNames: "sidebar.[ext]"
      }
    }
  }
});
