import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages project sites are served from /<repository>/, while user
  // and custom-domain sites are served from /. Set BASE_PATH for project sites.
  base: process.env.BASE_PATH ?? "/",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
