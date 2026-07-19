/**
 * Obviously-fake, isolated e2e credentials. These are NOT real, reusable, or
 * tied to any deployment. The e2e run must export matching
 * LABEL_LENS_BOOTSTRAP_* env values so `npm run e2e:seed` provisions these exact
 * accounts before the tests sign in.
 */
export const E2E = {
  agent: { email: "e2e-agent@example.test", password: "e2e-only-agent-password-1234" },
  admin: { email: "e2e-admin@example.test", password: "e2e-only-admin-password-1234" },
  seller: { email: "e2e-seller@example.test", password: "e2e-only-seller-password-1234" },
  primarySubmissionId: "pkg-e2e-primary",
  otherSubmissionId: "pkg-e2e-other",
} as const;
