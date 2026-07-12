// @vitest-environment node
//
// Deployment-config guard for the Render blueprint.
//
// Render sets NODE_ENV=production, which makes `npm ci` omit devDependencies by
// default. The build toolchain (TypeScript and Next's type/alias plumbing) lives
// in devDependencies, so a plain `npm ci && npm run build` on Render installs
// only production packages and `next build` then fails resolving every `@/...`
// alias. The build command must therefore force dev dependencies to install.
//
// This guard keeps those two facts pinned together: as long as the blueprint
// sets NODE_ENV=production, its build command must install dev dependencies.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BLUEPRINT = readFileSync(join(ROOT, "render.yaml"), "utf8");

const buildCommand = BLUEPRINT.match(/^\s*buildCommand:\s*(.+)$/m)?.[1]?.trim();
const setsProductionEnv = /key:\s*NODE_ENV[\s\S]*?value:\s*production/.test(BLUEPRINT);

describe("Render blueprint integrity", () => {
  it("declares a build command", () => {
    expect(buildCommand).toBeDefined();
  });

  it("installs build (dev) dependencies when the runtime env is production", () => {
    // If the blueprint runs the service with NODE_ENV=production, npm ci would
    // omit devDependencies unless the build command opts them back in.
    if (setsProductionEnv) {
      expect(buildCommand).toMatch(/npm ci\b[^&|]*--include=dev/);
    }
  });

  it("still runs the Next build after installing dependencies", () => {
    expect(buildCommand).toMatch(/npm run build/);
  });
});
