import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "convex", include: ["convex/**/*.test.ts"], environment: "edge-runtime", server: { deps: { inline: ["convex-test"] } } },
      },
      { extends: true, test: { name: "lib", include: ["lib/**/*.test.ts", "tests/**/*.test.ts"], environment: "node" } },
    ],
  },
});
