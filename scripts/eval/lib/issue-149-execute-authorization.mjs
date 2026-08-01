/**
 * Issue #149 — the execute-transition integrity gate.
 *
 * ## Why a repository gate, and not the workflow `paths:` filter
 *
 * The workflow comments claimed the `paths:` filter admits only the workflow and
 * the mode file. That is not what a GitHub Actions path filter does. `paths:`
 * decides **whether the workflow runs** when a push touches a matching file. It
 * places no restriction on what else that same push may contain. A commit could
 * therefore change `workflow-mode.txt` *and* the runner, the adapter, a contract
 * or a bundle input, and still trigger execute — with the changed code never
 * having been reviewed.
 *
 * So the changed-file restriction is enforced HERE, against the actual commit
 * range, rather than assumed from the trigger.
 *
 * This module is plain JavaScript with a typed sidecar, so the gate runs under
 * bare `node`: a security control should not depend on a TypeScript toolchain
 * being present and working.
 *
 * It is pure — it takes already-collected facts and returns a verdict. The
 * workflow supplies the facts by asking Git; the tests supply synthetic
 * histories. Both drive the same decision function.
 */

/** The ONLY files the authorization-and-transition commits may touch. */
export const PERMITTED_TRANSITION_PATHS = [
  "artifacts/issue-149-brand-complete-evidence-acquisition/workflow-mode.txt",
  "artifacts/issue-149-brand-complete-evidence-acquisition/execute-authorization.json",
];

/** The exact bytes the mode file must contain for execute. */
export const EXECUTE_MODE_BYTES = "execute\n";

const LOWER_HEX_40 = /^[0-9a-f]{40}$/;

/**
 * May execute run?
 *
 * Every condition must hold. A missing fact is a violation, never a pass: "we
 * could not check" and "we checked and it was fine" must not produce the same
 * verdict.
 */
export function evaluateExecuteTransition(facts) {
  const violations = [];
  const reject = (rule, detail) => {
    violations.push({ rule, detail });
  };

  const authorization = facts.authorization;
  if (authorization === null || authorization === undefined) {
    reject(
      "AUTHORIZATION_ARTIFACT_ABSENT",
      "execute-authorization.json is not present; execute is authorized by an artifact, never by the absence of one",
    );
  } else {
    if (
      typeof authorization.reviewedImplementationSha !== "string" ||
      !LOWER_HEX_40.test(authorization.reviewedImplementationSha)
    ) {
      reject(
        "AUTHORIZATION_MALFORMED",
        `reviewedImplementationSha must be a full 40-character commit SHA, received ${JSON.stringify(authorization.reviewedImplementationSha)}`,
      );
    }
    if (authorization.status !== "EXECUTE_AUTHORIZED") {
      reject(
        "EXECUTE_NOT_AUTHORIZED",
        `status is ${JSON.stringify(authorization.status)}; execute requires exactly EXECUTE_AUTHORIZED`,
      );
    }
  }

  if (!facts.reviewedShaIsAncestorOfHead) {
    reject(
      "REVIEWED_HEAD_NOT_ANCESTOR",
      "the current head does not descend from the reviewed implementation SHA; authorization is bound to a specific reviewed tree",
    );
  }

  // The heart of it: whatever the trigger admitted, the COMMITS must contain
  // nothing but the permitted transition files.
  const unreviewed = (facts.changedPathsSinceReviewedSha ?? []).filter(
    (changed) => !PERMITTED_TRANSITION_PATHS.includes(changed),
  );
  if (unreviewed.length > 0) {
    reject(
      "UNREVIEWED_FILE_CHANGED_AFTER_REVIEWED_HEAD",
      `${unreviewed.length} file(s) changed after the reviewed head that are not the authorization or mode file: ${JSON.stringify(unreviewed.slice(0, 10))}. GitHub's paths: filter decides whether this workflow runs; it does not restrict what else the push contains.`,
    );
  }

  if (facts.modeFileBytes !== EXECUTE_MODE_BYTES) {
    // Distinguish "not execute at all" from "execute, but not exactly".
    if (typeof facts.modeFileBytes === "string" && facts.modeFileBytes.trim() === "execute") {
      reject(
        "MODE_BYTES_NOT_EXACT",
        `the mode file trims to "execute" but its exact bytes are ${JSON.stringify(facts.modeFileBytes)}; the required bytes are ${JSON.stringify(EXECUTE_MODE_BYTES)}`,
      );
    } else {
      reject(
        "MODE_NOT_TRANSITIONED_TO_EXECUTE",
        `the committed mode is ${JSON.stringify(facts.modeFileBytes)}`,
      );
    }
  }

  return {
    ok: violations.length === 0,
    haltCode: violations.length === 0 ? null : "EXECUTE_TRANSITION_REJECTED",
    violations,
  };
}
