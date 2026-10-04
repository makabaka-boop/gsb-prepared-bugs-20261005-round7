import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  build: { rollupOptions: { input: ["index.html", "plan.html"] } },
  plugins: [vue()],
  server: {
    host: true,
  },
});
