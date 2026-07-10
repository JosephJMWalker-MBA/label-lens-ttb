/**
 * The four outcomes a verification can produce. Kept as a single source of
 * truth so extraction, rules, UI, and exported reports use identical language.
 *
 * - PASS:         evidence supports the expected value.
 * - WARN:         plausibly correct, but a limitation prevents full confidence.
 * - FAIL:         evidence contradicts the expected value or a required element.
 * - NEEDS_REVIEW: evidence is insufficient; a human must decide.
 */
export const VERIFICATION_STATUSES = ["PASS", "WARN", "FAIL", "NEEDS_REVIEW"] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
