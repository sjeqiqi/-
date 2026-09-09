/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  build: {
    target: "es2015",
  },
  plugins: [react(), viteSingleFile()],
  server: {
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
