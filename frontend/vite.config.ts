import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Страница живёт по адресу https://tea-master-team.ru/management/finance/
export default defineConfig({
  base: "/management/finance/",
  plugins: [react()],
  server: {
    proxy: { "/management/finance/api": "http://127.0.0.1:3200" }
  }
});
