// @vitest-environment node
//
// Documentation-integrity guard for the Slice 3 acceptance doc.
//
// Keeps docs/slice-3-acceptance.md honest: every documented command must exist
// in package.json, the documented fixture identity must match the committed
// fixture, and the doc must make no claim of official approval, certification,
// or TTB integration.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DOC = readFileSync(join(ROOT, "docs/slice-3-acceptance.md"), "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("Slice 3 acceptance documentation integrity", () => {
  it("documents only commands that exist in package.json", () => {
    const documented = [...DOC.matchAll(/`npm run ([a-z:]+)`/g)].map((m) => m[1]);
    expect(documented.length).toBeGreaterThan(0);
    for (const script of documented) {
      expect(pkg.scripts).toHaveProperty(script);
    }
    // npm ci is a native npm command and is expected verbatim.
    expect(DOC).toMatch(/npm ci/);
  });

  it("documents the fixture SHA-256 that matches the committed fixture", () => {
    const documented = DOC.match(/`([0-9a-f]{64})`/);
    expect(documented).not.toBeNull();
    const actual = createHash("sha256")
      .update(
        readFileSync(
          join(ROOT, "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg"),
        ),
      )
      .digest("hex");
    expect(documented![1]).toBe(actual);
  });

  it("makes no claim of official approval, certification, or TTB integration", () => {
    // Any sentence naming these must be an explicit disclaimer (contains a negation).
    const sentences = DOC.replace(/\s+/g, " ").split(/(?<=\.)\s/);
    for (const phrase of [
      /FedRAMP authoriz/i,
      /production certif/i,
      /official TTB integration/i,
      /legal approval/i,
    ]) {
      for (const sentence of sentences) {
        if (phrase.test(sentence)) {
          expect(sentence).toMatch(/\bnot\b|\bno\b|does not|never/i);
        }
      }
    }
    // The doc explicitly states the slice presents no overall status/score,
    // rather than advertising one as a feature.
    expect(DOC).toMatch(/no overall status[^.]*compliance score/i);
  });
});
