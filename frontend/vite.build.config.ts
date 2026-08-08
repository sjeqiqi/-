import { defineConfig } from "vite";
import base from "./vite.config";

// 生产构建包装：允许从仓库根目录以 sandbox 兼容方式构建（root 指向 frontend）。
export default defineConfig({
  ...base,
  root: "frontend",
  build: { outDir: "dist" },
});
