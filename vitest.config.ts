import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    host: "127.0.0.1"
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "packages/**/*.test.ts",
      "apps/**/*.test.ts",
      "agents/**/*.test.ts"
    ]
  }
});
