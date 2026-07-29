// Evaluation-only blinding validator. Imports nothing from production code.
//
// Proves, mechanically, that the reader packet leaks none of:
//   - original case IDs
//   - Brand truth strings
//   - OCR transcript excerpts / machine-selected candidates
//   - prior failure-class labels
// and that anonymous items map 1:1 onto frozen cases with a stable packet hash.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const REPO = process.cwd();
const PHASE2 = path.join(REPO, "artifacts/brand-region-coverage-diagnosis/classifications.json");
const OUT = path.join(REPO, "artifacts/issue-149-brand-mechanism-sublabels");
const PACKET = path.join(OUT, "reader-packet");

const TEXT_EXT = new Set([".md", ".json", ".txt", ".csv", ".jsonl"]);
const failures = [];
const checks = [];

function ok(name) {
  checks.push(`PASS  ${name}`);
}
function fail(name, detail) {
  failures.push(`FAIL  ${name}: ${detail}`);
}
function sha256Str(s) {
  return createHash("sha256").update(s).digest("hex");
}
function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function readerTextFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (TEXT_EXT.has(path.extname(p))) out.push(p);
    }
  };
  walk(PACKET);
  return out;
}

function allReaderFacingPaths() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(PACKET);
  return out;
}

const phase2 = JSON.parse(readFileSync(PHASE2, "utf8"));
const primary = phase2.cases.filter((c) => c.population === "primary");
const freeze = JSON.parse(readFileSync(path.join(OUT, "case-freeze.json"), "utf8"));
const map = JSON.parse(readFileSync(path.join(OUT, "anonymization-map.json"), "utf8"));

const caseIds = primary.map((c) => c.caseId);
const brandTruths = [...new Set(primary.map((c) => c.fixtureBrand).filter(Boolean))];
const machineReads = [...new Set(primary.map((c) => c.machineSelectedBrand).filter(Boolean))];
const failureClasses = [
  ...new Set([
    ...primary.map((c) => c.primaryCategory),
    "ORIENTATION_OR_SEGMENTATION_FAILURE",
    "REGION_COVERED_NO_TEXT_RECOGNIZED",
    "REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION",
    "REGION_NOT_COVERED",
  ]),
];
const ocrSamples = primary.flatMap((c) =>
  (c.overlappingWordSample ?? []).map((w) => (typeof w === "string" ? w : (w?.text ?? ""))),
);

// ---- 1. no original case IDs in reader-facing content or filenames ----
{
  let leaked = [];
  for (const f of readerTextFiles()) {
    const body = readFileSync(f, "utf8");
    for (const id of caseIds) if (body.includes(id)) leaked.push(`${path.basename(f)} <- ${id}`);
  }
  for (const p of allReaderFacingPaths()) {
    const rel = path.relative(PACKET, p);
    for (const id of caseIds) if (rel.includes(id)) leaked.push(`filename ${rel} <- ${id}`);
  }
  leaked.length
    ? fail("no original case IDs in packet", leaked.join("; "))
    : ok("no original case IDs in packet");
}

// ---- 2. no Brand truth strings ----
{
  const leaked = [];
  for (const f of readerTextFiles()) {
    const body = readFileSync(f, "utf8").toLowerCase();
    for (const t of brandTruths)
      if (t && body.includes(t.toLowerCase())) leaked.push(`${path.basename(f)} <- ${t}`);
  }
  leaked.length
    ? fail("no Brand truth strings in packet", leaked.join("; "))
    : ok("no Brand truth strings in packet");
}

// ---- 3. no OCR transcript excerpts or machine-selected candidates ----
{
  const leaked = [];
  const needles = [...machineReads, ...ocrSamples].filter((s) => s && s.length >= 3);
  for (const f of readerTextFiles()) {
    const body = readFileSync(f, "utf8").toLowerCase();
    for (const n of needles)
      if (body.includes(n.toLowerCase())) leaked.push(`${path.basename(f)} <- ${n}`);
  }
  leaked.length
    ? fail("no OCR/candidate text in packet", leaked.join("; "))
    : ok("no OCR/candidate text in packet");
}

// ---- 4. no prior failure-class labels ----
{
  const leaked = [];
  for (const f of readerTextFiles()) {
    const body = readFileSync(f, "utf8");
    for (const c of failureClasses)
      if (body.includes(c)) leaked.push(`${path.basename(f)} <- ${c}`);
  }
  leaked.length
    ? fail("no prior failure-class labels in packet", leaked.join("; "))
    : ok("no prior failure-class labels in packet");
}

// ---- 5. unblinding key is NOT inside reader-packet/ ----
{
  const inside = allReaderFacingPaths().some((p) => path.basename(p) === "anonymization-map.json");
  inside
    ? fail("anonymization map outside packet", "found inside reader-packet/")
    : ok("anonymization map outside packet");
}

// ---- 6. each anonymous item maps to exactly one frozen case ----
{
  const ids = map.entries.map((e) => e.itemId);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  const frozen = new Set([...freeze.audits.geometric, ...freeze.audits.stylization]);
  const unmapped = map.entries.filter((e) => !frozen.has(e.caseId));
  const imageIds = readdirSync(path.join(PACKET, "images"))
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.replace(/\.png$/, ""))
    .sort();
  const mappedIds = [...ids].sort();

  if (dupes.length) fail("item ids unique", `duplicates: ${dupes.join(",")}`);
  else if (unmapped.length)
    fail("items map to frozen cases", `unmapped: ${unmapped.map((e) => e.caseId).join(",")}`);
  else if (JSON.stringify(imageIds) !== JSON.stringify(mappedIds))
    fail("packet images match map 1:1", `images=${imageIds.length} map=${mappedIds.length}`);
  else ok(`each anonymous item maps to exactly one frozen case (${ids.length} items)`);
}

// ---- 7. frozen case count and 5/5 split ----
{
  const g = freeze.audits.geometric.length;
  const s = freeze.audits.stylization.length;
  if (freeze.frozenCaseCount !== 10 || g !== 5 || s !== 5)
    fail(
      "frozen case set is 10 cases split 5/5",
      `count=${freeze.frozenCaseCount} geo=${g} sty=${s}`,
    );
  else ok("frozen case set is 10 cases split 5/5");
}

// ---- 8. freeze + packet hashes stable ----
{
  const freezeExpected = readFileSync(path.join(OUT, "case-freeze.sha256"), "utf8").split(/\s+/)[0];
  const freezeActual = sha256File(path.join(OUT, "case-freeze.json"));
  freezeExpected === freezeActual
    ? ok("case-freeze hash stable")
    : fail("case-freeze hash stable", `${freezeExpected} != ${freezeActual}`);

  const manifestRaw = readFileSync(path.join(OUT, "packet-manifest.json"), "utf8");
  const manifestExpected = readFileSync(path.join(OUT, "packet-manifest.sha256"), "utf8").split(
    /\s+/,
  )[0];
  const manifestActual = sha256Str(manifestRaw);
  manifestExpected === manifestActual
    ? ok("packet-manifest hash stable")
    : fail("packet-manifest hash stable", `${manifestExpected} != ${manifestActual}`);

  const manifest = JSON.parse(manifestRaw);
  const drifted = manifest.readerFiles.filter(
    (f) => sha256File(path.join(PACKET, f.path)) !== f.sha256,
  );
  drifted.length
    ? fail("every reader file matches manifest hash", drifted.map((d) => d.path).join(","))
    : ok(`every reader file matches manifest hash (${manifest.readerFiles.length} files)`);
}

// ---- 9. no production/OCR imports in the packet tooling ----
{
  const scripts = [
    "scripts/eval/build-issue-149-brand-mechanism-packet.mjs",
    "scripts/eval/validate-issue-149-brand-mechanism-packet.mjs",
  ];
  const banned = [
    "pipeline/extractor",
    "ocr-engine",
    "tesseract",
    "field-selection",
    "runOcrPass",
    "createLocalOcrEngine",
  ];
  const leaked = [];
  for (const s of scripts) {
    const body = readFileSync(path.join(REPO, s), "utf8");
    for (const b of banned) {
      // allow the words to appear inside comments/among banned-list literals in
      // this validator itself; only flag actual import statements.
      const importRe = new RegExp(`(import|require)[^\\n]*${b.replace(/[/\\-]/g, "\\$&")}`, "i");
      if (importRe.test(body)) leaked.push(`${s} <- ${b}`);
    }
  }
  leaked.length
    ? fail("no OCR/production imports in tooling", leaked.join("; "))
    : ok("no OCR/production imports in tooling");
}

for (const c of checks) console.log(c);
for (const f of failures) console.error(f);
console.log(`\n${checks.length} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
