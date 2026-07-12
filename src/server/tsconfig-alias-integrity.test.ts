// @vitest-environment node
//
// Build-integrity guard for the `@/*` path alias.
//
// A clean Linux `next build` on Render failed resolving every `@/...` import
// because tsconfig declared `paths` without an explicit `baseUrl`. Some
// resolvers (and Next's webpack alias plumbing) require `baseUrl` to anchor the
// relative `paths` targets; without it the aliases silently fail to resolve on
// a fresh build. This guard keeps `baseUrl` and the alias target pinned so the
// deployment path-resolution defect cannot regress.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const tsconfig = JSON.parse(readFileSync(join(ROOT, "tsconfig.json"), "utf8")) as {
  compilerOptions: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
};

describe("tsconfig path-alias integrity", () => {
  it("declares an explicit baseUrl so relative path aliases anchor on clean builds", () => {
    expect(tsconfig.compilerOptions.baseUrl).toBe(".");
  });

  it("maps the @/* alias to ./src/*", () => {
    expect(tsconfig.compilerOptions.paths).toBeDefined();
    expect(tsconfig.compilerOptions.paths?.["@/*"]).toEqual(["./src/*"]);
  });
});
