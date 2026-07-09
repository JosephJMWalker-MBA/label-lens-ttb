# Validation Rules

## Purpose

The validation layer converts extracted label information into explainable compliance findings.

This is intentionally separate from the AI extraction layer. AI identifies what appears on the label; deterministic rules decide how findings should be classified.

## Finding Statuses

```ts
type FindingStatus = "PASS" | "WARN" | "FAIL" | "NEEDS_REVIEW";
```

### PASS

The observed label value matches the expected application value, either exactly or through a clearly acceptable normalization.

### WARN

The observed value is close or probably acceptable, but requires agent review.

### FAIL

The observed value is missing, materially different, or violates a strict requirement.

### NEEDS_REVIEW

The system could not determine the result confidently.

## Field Rules

### Brand Name

| Condition | Status | Reason |
|---|---:|---|
| Exact match | PASS | Label brand matches expected application brand. |
| Case/punctuation-normalized match | PASS | Label brand matches after normalization. |
| High fuzzy similarity | WARN | Label brand is similar but not identical. |
| Missing or materially different | FAIL | Label brand does not match expected application brand. |

Example:

```text
Expected: Stone's Throw
Observed: STONE'S THROW
Status: PASS
Reason: Brand name matches after capitalization normalization.
```

### Class / Type

| Condition | Status |
|---|---:|
| Exact or normalized match | PASS |
| Similar but not exact | WARN |
| Missing or inconsistent | FAIL |

### Alcohol Content

Alcohol content needs specialized normalization.

Examples that may be equivalent:

```text
45% Alc./Vol.
45% ABV
45% alcohol by volume
90 proof
```

Rules:

- If ABV values match numerically, status should be PASS.
- If proof and ABV are mathematically equivalent, status should be PASS or WARN depending on extraction confidence.
- If observed ABV differs materially, status should be FAIL.
- If alcohol content is unreadable, status should be NEEDS_REVIEW.

### Net Contents

Examples:

```text
750 mL
750ml
0.75 L
```

Rules:

- Normalize whitespace and units.
- Convert liters to milliliters where practical.
- PASS if normalized values are equivalent.
- WARN if similar but uncertain.
- FAIL if missing or materially different.

### Producer / Bottler Name and Address

This field may be complex and multi-line.

Rules:

- PASS for strong normalized match.
- WARN for partial or fuzzy match.
- NEEDS_REVIEW if AI extraction is incomplete.
- FAIL if clearly absent when expected.

### Country of Origin

Rules:

- Required for imports.
- PASS if expected and observed country match.
- FAIL if expected country is missing from the label.
- NEEDS_REVIEW if import status is unknown.

## Government Health Warning

The government warning is a strict rule and should not be treated like ordinary fuzzy matching.

Required warning language:

```text
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
```

Checks:

1. Warning statement is present.
2. `GOVERNMENT WARNING:` appears in uppercase.
3. Required wording is substantially complete.
4. Punctuation and numbering are close to required language.
5. Formatting limitations are disclosed.

Prototype limitation:

The app may not be able to conclusively verify bold type from a normal uploaded image. If warning text appears present and correct but bold formatting cannot be verified, the result should be WARN, not PASS.

Suggested finding:

```text
Status: WARN
Reason: Government warning text appears present and substantially complete, but bold formatting cannot be conclusively verified from the uploaded image.
```

## Overall Status Logic

Suggested aggregation:

```text
If any field FAILS → overall FAIL
Else if any field NEEDS_REVIEW → overall NEEDS_REVIEW
Else if any field WARNS → overall WARN
Else → overall PASS
```

## Design Principle

Be strict where the regulation is strict. Be flexible where human reviewers would be flexible. Always explain the difference.
