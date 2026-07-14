export const OBSERVER_GRID_SCHEMA_VERSION = "observer-grid.v1" as const;
export const OBSERVER_OVERLAY_MEDIA_TYPE = "image/png" as const;
export const OBSERVER_OVERLAY_ARTIFACT_KIND = "observer-overlay" as const;
export const OBSERVER_SOURCE_ARTIFACT_KIND = "original-source" as const;
export const OBSERVER_HALO_POLICY_ID = "observer-grid-halo.v1" as const;

export const OBSERVER_GRID_COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;
export const OBSERVER_GRID_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export const OBSERVER_REFINEMENT_COLUMNS = ["A", "B", "C", "D", "E"] as const;
export const OBSERVER_REFINEMENT_ROWS = [1, 2, 3, 4, 5] as const;

export const OBSERVER_OBSERVATION_TYPES = ["text-like-region"] as const;
export const OBSERVER_APPARENT_ORIENTATIONS = [
  "horizontal",
  "vertical-clockwise",
  "vertical-counterclockwise",
  "rotated-180",
  "uncertain",
] as const;
export const OBSERVER_VISIBILITIES = ["full", "partial", "obscured"] as const;
export const OBSERVER_REASON_CODES = [
  "small_text",
  "edge_proximity",
  "rotation",
  "dense_text",
  "multi_line",
  "partial_visibility",
  "high_salience",
  "low_contrast",
  "multi_artifact",
] as const;
export const OBSERVER_PROPOSAL_SOURCES = ["machine-observer"] as const;
export const OBSERVER_AUTHORITIES = ["non-authoritative"] as const;
export const OBSERVER_PURPOSES = ["ocr-region-proposal"] as const;
export const OBSERVER_ROTATIONS = [0, 90, 180, 270] as const;

export type GridColumn = (typeof OBSERVER_GRID_COLUMNS)[number];
export type GridRow = (typeof OBSERVER_GRID_ROWS)[number];
export type RefinementColumn = (typeof OBSERVER_REFINEMENT_COLUMNS)[number];
export type RefinementRow = (typeof OBSERVER_REFINEMENT_ROWS)[number];
export type ObservationType = (typeof OBSERVER_OBSERVATION_TYPES)[number];
export type ApparentOrientation = (typeof OBSERVER_APPARENT_ORIENTATIONS)[number];
export type Visibility = (typeof OBSERVER_VISIBILITIES)[number];
export type ReasonCode = (typeof OBSERVER_REASON_CODES)[number];
export type ProposalSource = (typeof OBSERVER_PROPOSAL_SOURCES)[number];
export type ProposalAuthority = (typeof OBSERVER_AUTHORITIES)[number];
export type ProposalPurpose = (typeof OBSERVER_PURPOSES)[number];
export type ObservationRotation = (typeof OBSERVER_ROTATIONS)[number];

export interface GridSpec {
  schemaVersion: typeof OBSERVER_GRID_SCHEMA_VERSION;
  columns: 10;
  rows: 10;
  columnLabels: readonly GridColumn[];
  rowLabels: readonly GridRow[];
  origin: "top-left";
  cellRangeNotation: "inclusive";
  sourceCrop: "none";
  aspectRatioPolicy: "preserve-source";
}

export interface RefinementGridSpec {
  schemaVersion: typeof OBSERVER_GRID_SCHEMA_VERSION;
  columns: 5;
  rows: 5;
  columnLabels: readonly RefinementColumn[];
  rowLabels: readonly RefinementRow[];
  origin: "top-left";
  cellRangeNotation: "inclusive";
  sourceCrop: "none";
  parentFrame: "coarse-proposal";
}

export interface GridCell {
  column: GridColumn;
  row: GridRow;
  columnIndex: number;
  rowIndex: number;
  id: string;
}

export interface RefinementCell {
  column: RefinementColumn;
  row: RefinementRow;
  columnIndex: number;
  rowIndex: number;
  id: string;
}

export interface GridCellRange {
  start: GridCell;
  end: GridCell;
  notation: string;
}

export interface RefinementCellRange {
  start: RefinementCell;
  end: RefinementCell;
  notation: string;
}

export interface LocalRefinementSelection {
  gridSpec: RefinementGridSpec;
  range: RefinementCellRange;
}

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}

export interface RegionGeometry {
  normalizedBox: NormalizedBox;
  pixelBox: PixelBox;
}

export interface PaddingSpec {
  unit: "normalized";
  top: number;
  right: number;
  bottom: number;
  left: number;
  clampToImage: true;
}

export interface HaloPolicyRecord {
  paddingPolicyId: typeof OBSERVER_HALO_POLICY_ID;
  paddingRatio: number;
  requestedPadding: PaddingSpec;
  actualPadding: PaddingSpec;
}

export interface TransformRecord {
  schemaVersion: typeof OBSERVER_GRID_SCHEMA_VERSION;
  mapping: "observer-grid-to-original-image";
  coarseGridRange: string;
  refinementGridRange: string | null;
  observationRotation: ObservationRotation;
  sourceImageWidth: number;
  sourceImageHeight: number;
  observationFrameWidth: number;
  observationFrameHeight: number;
  sourceCrop: "none";
  overlayDeterministic: true;
}

export interface ObserverDerivative {
  gridSpec: GridSpec;
  rotation: 0;
  mediaType: typeof OBSERVER_OVERLAY_MEDIA_TYPE;
  width: number;
  height: number;
  sourceMediaType: string;
  sourceSha256: string;
  overlaySha256: string;
  bytes: Uint8Array;
  sourceArtifactPath: string;
  overlayArtifactPath: string;
  workspaceDir: string;
  transform: TransformRecord;
}

export interface ObserverRegionProposal {
  observationId: string;
  proposalId: string;
  observationType: ObservationType;
  source: ProposalSource;
  authority: ProposalAuthority;
  purpose: ProposalPurpose;
  gridRange: GridCellRange;
  localRefinement: LocalRefinementSelection | null;
  observationRotation: ObservationRotation;
  apparentOrientation: ApparentOrientation;
  visibility: Visibility;
  reasonCodes: ReasonCode[];
  description: string;
}

export interface OcrInspectionHandoff {
  sourceArtifactKind: typeof OBSERVER_SOURCE_ARTIFACT_KIND;
  sourceArtifactRef: string;
  sourceImageSha256: string;
  originalPixelRegion: PixelBox;
  overlayArtifactKindRejected: typeof OBSERVER_OVERLAY_ARTIFACT_KIND;
  overlayArtifactPathRejected: string;
  overlaySha256Rejected: string;
}

export interface CanonicalRegionProposal extends ObserverRegionProposal {
  proposedRegion: RegionGeometry;
  ocrInspectionRegion: RegionGeometry;
  haloPolicy: HaloPolicyRecord;
  transform: TransformRecord;
  ocrHandoff: OcrInspectionHandoff;
}

export interface VisionObserverInput {
  observationRunId: string;
  scenarioId: string;
  workspaceDir: string;
  overlayArtifactPath: string;
  overlayMediaType: typeof OBSERVER_OVERLAY_MEDIA_TYPE;
  overlaySha256: string;
  overlayWidth: number;
  overlayHeight: number;
  sourceImageSha256: string;
}

export interface VisionObserverResult {
  observationRunId: string;
  proposals: readonly unknown[];
}

export interface VisionObserverAdapter {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly promptId: string;
  readonly promptVersion: string;
  observe(input: VisionObserverInput, signal: AbortSignal): Promise<VisionObserverResult>;
  reset?(): Promise<void>;
  dispose(): Promise<void>;
}

export interface VisionObservationErrorRecord {
  immutable: true;
  code:
    | "DERIVATIVE_DECODE_FAILED"
    | "DERIVATIVE_DIMENSION_MISMATCH"
    | "DERIVATIVE_RENDER_FAILED"
    | "OBSERVER_TIMEOUT"
    | "OBSERVER_EXCEPTION"
    | "INVALID_OBSERVER_OUTPUT"
    | "INVALID_PROPOSAL_GEOMETRY"
    | "INVALID_OCR_HANDOFF";
  stage: "derivative" | "observe" | "proposal-validate" | "geometry" | "ocr-handoff";
  message: string;
  issues: readonly string[];
}

export interface ObservationRunMetadata {
  observationRunId: string;
  adapterId: string;
  adapterVersion: string;
  promptId: string;
  promptVersion: string;
  sourceImageSha256: string;
  overlaySha256: string | null;
  startedAt: string;
  completedAt: string;
  cleanupCompleted: boolean;
}

export interface VisionObserverLifecycleResult {
  run: ObservationRunMetadata;
  derivative: ObserverDerivative | null;
  observerResult: VisionObserverResult | null;
  canonicalProposals: CanonicalRegionProposal[];
  errorRecord: VisionObservationErrorRecord | null;
  workspaceDir: string;
}

export type ObserverGridValidationErrorCode = "INVALID_SHAPE";

export interface ObserverGridValidationError {
  code: ObserverGridValidationErrorCode;
  message: string;
  issues: string[];
}

export type ObserverGuardErrorCode = "INVALID_CONTRACT";

export interface ObserverGuardError {
  code: ObserverGuardErrorCode;
  message: string;
  issues: string[];
}

export type ObserverAdapterErrorCode =
  "INVALID_DERIVATIVE" | "INVALID_PROPOSAL" | "INVALID_CANONICAL_PROPOSAL" | "INVALID_OCR_HANDOFF";

export interface ObserverAdapterError {
  code: ObserverAdapterErrorCode;
  message: string;
  issues: string[];
}

export interface FakeObserverScenario {
  scenarioId: string;
  proposals: readonly ObserverRegionProposal[];
}
