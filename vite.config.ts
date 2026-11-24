import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs work on both project sites and root/custom domains.
  base: "./",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
