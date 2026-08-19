import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing";

export default defineConfig({
  plugins: [WxtVitest() as any, react()],
  test: {
    exclude: [...configDefaults.exclude, "**/.claude/**", "**/.worktrees/**", "tests/**"],
    environment: "node",
    globals: true,
    setupFiles: "vitest.setup.ts",
    watch: false,
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json-summary", "html", "lcov"],
      thresholds: {
        statements: 78,
        branches: 66,
        functions: 76,
        lines: 78,
      },
    },
  },
});
