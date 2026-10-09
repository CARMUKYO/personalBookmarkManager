import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    env: { DATABASE_URL: "file:./test.db" },
    // All test files share one SQLite file, so run them one at a time.
    fileParallelism: false,
  },
});
