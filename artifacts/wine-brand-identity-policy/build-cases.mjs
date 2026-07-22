import { readFileSync, writeFileSync } from "node:fs";
const A = "artifacts/wine-brand-identity-policy/";
const M = JSON.parse(readFileSync("src/fixtures/eval/eval-manifest.json", "utf8"));
const R = JSON.parse(readFileSync("docs/extraction-full-corpus/extractor-report.json", "utf8"));
const ASSESS = JSON.parse(readFileSync(A + "assessments.json", "utf8"));

const PRIMARY = [
  "patricia-green-cellars",
  "approved-wine-049",
  "approved-wine-052",
  "approved-wine-053",
  "three-steves-winery",
  "approved-wine-073",
  "approved-wine-074",
  "approved-wine-083",
  "approved-wine-086",
  "m-cellars-baseline",
  "wine-multi-artifact-04",
  "wine-multi-artifact-07",
  "wine-multi-artifact-09",
];
const CONTROLS = [
  "approved-wine-046",
  "approved-wine-048",
  "approved-wine-013",
  "approved-wine-061",
  "approved-wine-006",
  "approved-wine-069",
  "approved-wine-022",
  "approved-wine-082",
  "approved-wine-031",
  "approved-wine-091",
];

function row(caseId, population) {
  const rec = M.records.find((r) => r.caseId === caseId);
  const b = rec.annotation.brand;
  const rep = R.cases.find((c) => c.caseId === caseId);
  const a = ASSESS[caseId] ?? { elements: [], notes: "NO ASSESSMENT" };
  return {
    caseId,
    population,
    imagePath: rec.imagePath,
    imageType: /Back/i.test(rec.annotation?.notes ?? "") ? "back" : (a.imageType ?? "unknown"),
    currentFixtureTruth: b.presence === "present" ? b.acceptablePresentations : [],
    brandPresenceInFixture: b.presence,
    acceptableAlternatives: b.presence === "present" ? b.acceptablePresentations.slice(1) : [],
    forbiddenPresentations: b.forbiddenPresentations ?? [],
    genuinelyAmbiguous: b.presence === "present" ? b.genuinelyAmbiguous : false,
    currentSelectedCandidate: rep ? rep.brand.value : null,
    currentSelectedState: rep ? rep.brand.state : null,
    // Two-axis element assessments (curated from visual inspection this session).
    namingElements: a.elements,
    currentFixtureTruthDefensible: a.truthDefensible,
    requiresHumanReview: a.requiresHumanReview,
    wouldNeedPermitOrApplicationFacts: a.needsPermitFacts,
    artworkSupports: a.artworkSupports,
    artworkCannotEstablish: a.artworkCannotEstablish,
    notes: a.notes,
  };
}

const cases = [
  ...PRIMARY.map((id) => row(id, "primary")),
  ...CONTROLS.map((id) => row(id, "control")),
];
writeFileSync(A + "cases.json", JSON.stringify(cases, null, 2) + "\n");
const p = cases.filter((c) => c.population === "primary"),
  c = cases.filter((x) => x.population === "control");
console.log("primary:", p.length, "control:", c.length);
// element-level role tallies (primary)
const roleT = {},
  statusT = {};
for (const cs of p)
  for (const e of cs.namingElements) {
    roleT[e.role] = (roleT[e.role] ?? 0) + 1;
    statusT[e.brandStatus] = (statusT[e.brandStatus] ?? 0) + 1;
  }
console.log("primary element roles:", JSON.stringify(roleT));
console.log("primary brand statuses:", JSON.stringify(statusT));
console.log(
  "no-assessment cases:",
  cases.filter((c) => c.notes === "NO ASSESSMENT").map((c) => c.caseId),
);
