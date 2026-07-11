import type { AdvisoryNotice } from "./result.types";

/**
 * The fixed, versioned advisory notice. It states plainly that the result is an
 * internal pre-submission aid, not a TTB approval or legal determination. The
 * wording is a constant — never generated dynamically by a model.
 */
export const ADVISORY_NOTICE: AdvisoryNotice = Object.freeze({
  noticeId: "precheck-advisory-notice",
  noticeVersion: "1.0.0",
  text:
    "This result is an automated pre-submission aid based on the supplied evidence and " +
    "declared facts. It is not a TTB approval, legal opinion, or official regulatory " +
    "disposition. A qualified human remains responsible for review and submission decisions.",
});
