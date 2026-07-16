// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { EvalReport } from "./eval-report.types";
import {
  OBSERVATION_QUALITY_BENCHMARK_IMPLEMENTATION_STATUS,
  OBSERVATION_QUALITY_PRIMARY_REVIEWER_COUNT,
  OBSERVATION_QUALITY_TOTAL_SCORED_ITEMS,
  productionPromptChangeAuthorized,
  realExecutionAuthorized,
} from "./vision-observer/local-vlm/observation-quality-benchmark-protocol";

function loadCommittedReport(): EvalReport {
  return JSON.parse(
    readFile