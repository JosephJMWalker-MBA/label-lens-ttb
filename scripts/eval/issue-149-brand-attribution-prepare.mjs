#!/usr/bin/env node
/**
 * Issue #149 — Brand native-runtime / float-model attribution benchmark, PREPARE.
 *
 * Recovers the exact governed preprocessed Brand crop PNG bytes already
 * committed by the merged Otsu-threshold control arm, so all three arms receive
 * byte-identical input. No OCR runs here and no crop is recomputed: the bytes
 * are recovered, not regenerated.
 *
 * Inference inputs are written under opaque item identifiers. Brand truth is
 * never read by this script.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-brand-native-tesseract-model-attribution";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const INPUTS = path.join(ROOT, "inference-inputs");
const EVALUATION = path.join(ROOT, "evaluation");

/** Canonical bounded-Brand preprocessed bytes, from the merged control arm. */
const PREPROCESSED_SOURCE = "artifacts/issue-149-brand-otsu-threshold/control/preprocessed";
const CROP_SOURCE = "artifacts/issue-149-brand-otsu-threshold/control/crops";
const PROVENANCE = "artifacts/issue-149-brand-duplicate-crop-adjudication/case-provenance.json";
const CASE_FREEZE = "artifacts/issue-149-brand-mechanism-sublabels/case-freeze.json";

const OPAQUE_SALT = "issue-149-brand-native-attribution-v1";

/** The six governed Brand OCR items of the five frozen stylization cases. */
const OCR_ITEMS = [
  { itemId: "approved-wine-004", caseId: "approved-wine-004" },
  { itemId: "approved-wine-005", caseId: "approved-wine-005" },
  { itemId: "approved-wine-031", caseId: "approved-wine-031" },
  { itemId: "la-fattoria-rotated", caseId: "la-fattoria-rotated" },
  { itemId: "wine-multi-artifact-04-region-1", caseId: "wine-multi-artifact-04" },
  { itemId: "wine-multi-artifact-04-region-2", caseId: "wine-multi-artifact-04" },
];

/** Crop clusters, per the PR #207 adjudication (case-level units). */
const CROP_CLUSTERS = {
  C1: ["approved-wine-004", "la-fattoria-rotated"],
  C2: ["approved-wine-005"],
  C3: ["approved-wine-031"],
  C4: ["wine-multi-artifact-04"],
};
/** Design clusters: the shared-producer design counts once. */
const DESIGN_CLUSTERS = {
  D1: ["approved-wine-004", "la-fattoria-rotated", "approved-wine-005"],
  D2: ["wine-multi-artifact-04"],
  D3: ["approved-wine-031"],
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha256File = (p) =>
  sha256(readFileSync(path.isAbsolute(p) ? p : path.join(process.cwd(), p)));
const opaqueId = (itemId) => `item-${sha256(Buffer.from(`${OPAQUE_SALT}:${itemId}`)).slice(0, 12)}`;
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

function clusterOf(map, caseId) {
  const found = Object.entries(map).find(([, members]) => members.includes(caseId));
  if (!found) throw new Error(`NO_CLUSTER: ${caseId}`);
  return found[0];
}

function main() {
  mkdirSync(INPUTS, { recursive: true });
  mkdirSync(EVALUATION, { recursive: true });

  // Structure verification against the merged artifacts.
  const freeze = JSON.parse(readFileSync(path.join(process.cwd(), CASE_FREEZE), "utf8"));
  const expectedCases = [...freeze.audits.stylization].sort();
  const observedCases = [...new Set(OCR_ITEMS.map((i) => i.caseId))].sort();
  if (JSON.stringify(expectedCases) !== JSON.stringify(observedCases)) {
    throw new Error(
      `POPULATION_MISMATCH: merged case-freeze stylization = ${JSON.stringify(expectedCases)}, benchmark = ${JSON.stringify(observedCases)}`,
    );
  }

  const provenance = JSON.parse(readFileSync(path.join(process.cwd(), PROVENANCE), "utf8"));
  const byItem = new Map(provenance.governedCases.map((c) => [c.caseId, c]));

  const items = OCR_ITEMS.map((item) => {
    const prov = byItem.get(item.itemId);
    if (!prov) throw new Error(`ITEM_NOT_IN_PROVENANCE: ${item.itemId}`);
    const preprocessedSource = path.join(PREPROCESSED_SOURCE, `${item.itemId}.png`);
    const cropSource = path.join(CROP_SOURCE, `${item.itemId}.png`);
    const opaque = opaqueId(item.itemId);
    const destination = path.join(INPUTS, `${opaque}.png`);
    copyFileSync(path.join(process.cwd(), preprocessedSource), destination);
    const bytes = readFileSync(destination);
    return {
      opaqueItemId: opaque,
      ocrItemId: item.itemId,
      caseId: item.caseId,
      cropClusterId: clusterOf(CROP_CLUSTERS, item.caseId),
      designClusterId: clusterOf(DESIGN_CLUSTERS, item.caseId),
      sourceImagePath: prov.sourceImagePath,
      sourceImageSha256: prov.sourceImageSha256,
      sourceImageSize: prov.sourceImageSize,
      approvedRegion: prov.region,
      cropRect: prov.cropRect,
      committedCropPath: cropSource,
      committedCropSha256: sha256File(cropSource),
      preprocessedSourcePath: preprocessedSource,
      preprocessedSha256: sha256(bytes),
      preprocessedByteSize: bytes.length,
      inferenceInputPath: path.relative(process.cwd(), destination),
    };
  });

  const distinctPreprocessed = new Set(items.map((i) => i.preprocessedSha256)).size;
  const cropClusterCount = Object.keys(CROP_CLUSTERS).length;
  const designClusterCount = Object.keys(DESIGN_CLUSTERS).length;

  writeJson(path.join(ROOT, "case-freeze.json"), {
    artifact: "case-freeze",
    experimentId: EXPERIMENT_ID,
    frozenBeforeOcr: true,
    source: "PRs #204, #205 and #207 (merged)",
    historicalCaseCount: observedCases.length,
    cases: observedCases,
    verifiedAgainstMergedArtifact: CASE_FREEZE,
    mutationPolicy:
      "No case may be substituted and the population may not be expanded after results are seen.",
  });

  writeJson(path.join(ROOT, "ocr-item-freeze.json"), {
    artifact: "ocr-item-freeze",
    experimentId: EXPERIMENT_ID,
    frozenBeforeOcr: true,
    ocrItemCount: items.length,
    items: items.map((i) => ({
      opaqueItemId: i.opaqueItemId,
      ocrItemId: i.ocrItemId,
      caseId: i.caseId,
      cropClusterId: i.cropClusterId,
      designClusterId: i.designClusterId,
    })),
    opaqueIdScheme: `item-<first 12 hex of sha256("${OPAQUE_SALT}:<ocrItemId>")>`,
    note: "wine-multi-artifact-04 has two committed approved Brand regions and therefore contributes two OCR items.",
  });

  writeJson(path.join(ROOT, "independence-groups.json"), {
    artifact: "independence-groups",
    experimentId: EXPERIMENT_ID,
    basis: "PR #207 adjudication (DISTINCT_SOURCE_SAME_CROP)",
    counts: {
      historicalCases: observedCases.length,
      ocrItems: items.length,
      distinctPreprocessedPixelSetsAtItemLevel: distinctPreprocessed,
      distinctCropImagesAtCaseLevel: cropClusterCount,
      distinctBrandDesigns: designClusterCount,
    },
    unitNote:
      "Two counts of 'distinct crop images' coexist and are both reported to avoid ambiguity. At OCR-item level there are 5 distinct preprocessed pixel sets, because approved-wine-004 and la-fattoria-rotated are byte-identical. At case level there are 4 distinct crop clusters, which is the denominator PR #207 recorded, because wine-multi-artifact-04's two regions belong to one case. Cluster decisions in this benchmark use the 4 case-level crop clusters.",
    cropClusters: Object.entries(CROP_CLUSTERS).map(([id, members]) => ({
      cropClusterId: id,
      members,
      ocrItems: items.filter((i) => i.cropClusterId === id).map((i) => i.opaqueItemId),
    })),
    designClusters: Object.entries(DESIGN_CLUSTERS).map(([id, members]) => ({
      designClusterId: id,
      members,
      ocrItems: items.filter((i) => i.designClusterId === id).map((i) => i.opaqueItemId),
    })),
    countingRules: [
      "Duplicate crop evidence counts once.",
      "Shared-design evidence counts once at design level.",
      "Historical case, OCR item, distinct crop, and distinct design are reported separately.",
    ],
  });

  writeJson(path.join(ROOT, "input-pixel-manifest.json"), {
    artifact: "input-pixel-manifest",
    experimentId: EXPERIMENT_ID,
    frozenBeforeOcr: true,
    recoveredNotRegenerated: true,
    preprocessedSource: PREPROCESSED_SOURCE,
    preprocessingDescription:
      "Governed bounded-Brand control preprocessing, as committed by the merged Otsu-threshold control arm: approved Brand region crop with padding ratio 0.03 / min 4 px, rotation 0, scale 3 (cubic), sharp grayscale, sharp normalise, no local contrast, no threshold, no sharpening, no inversion, no denoising.",
    identicalBytesAcrossAllThreeArms: true,
    distinctPreprocessedPixelSets: distinctPreprocessed,
    items,
    brandTruthPresent: false,
    note: "This freeze records case identity and geometry. Brand truth appears nowhere in it, and the inference inputs are named only by opaque item id.",
  });

  // Evaluation-only mapping. The OCR phase never reads this file, and no
  // container is ever given a path to it.
  writeJson(path.join(EVALUATION, "id-map.json"), {
    artifact: "id-map",
    experimentId: EXPERIMENT_ID,
    availableToOcr: false,
    purpose: "Post-inference evaluation only: maps opaque item id back to historical case.",
    map: items.map((i) => ({
      opaqueItemId: i.opaqueItemId,
      ocrItemId: i.ocrItemId,
      caseId: i.caseId,
      cropClusterId: i.cropClusterId,
      designClusterId: i.designClusterId,
    })),
  });

  console.log(
    JSON.stringify(
      {
        historicalCases: observedCases.length,
        ocrItems: items.length,
        distinctPreprocessedPixelSetsAtItemLevel: distinctPreprocessed,
        distinctCropImagesAtCaseLevel: cropClusterCount,
        distinctBrandDesigns: designClusterCount,
        inputs: items.map((i) => ({
          opaque: i.opaqueItemId,
          item: i.ocrItemId,
          sha256: i.preprocessedSha256.slice(0, 16),
          bytes: i.preprocessedByteSize,
        })),
      },
      null,
      2,
    ),
  );
}

main();
