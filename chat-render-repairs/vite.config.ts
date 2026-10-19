import { defineConfig } from "vite";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  build: { rollupOptions: { input: { elements: "index.html", react: "react.html" } } },
});
