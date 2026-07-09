# Architecture

## Architectural Goal

Create a standalone prototype that demonstrates a practical AI-assisted compliance workflow without overbuilding production federal infrastructure.

## High-Level Flow

```text
Browser UI
  ↓
Image upload + expected field form
  ↓
/api/analyze-label
  ↓
AI vision extraction
  ↓
Schema validation
  ↓
Normalization + fuzzy comparison
  ↓
Compliance rule engine
  ↓
Verification report UI
```

## Planned Application Structure

```text
src/
  app/
    page.tsx
    layout.tsx
    globals.css
    api/
      analyze-label/
        route.ts
  components/
    LabelUpload.tsx
    ExpectedFieldsForm.tsx
    ResultsDashboard.tsx
    FindingCard.tsx
    ConfidenceBadge.tsx
  lib/
    ai/
      extractLabelFields.ts
      prompt.ts
    compliance/
      rules.ts
      warningStatement.ts
      types.ts
    matching/
      normalize.ts
      fuzzyMatch.ts
      compareFields.ts
    sampleData.ts
  types/
    label.ts
```

## System Boundaries

### In Scope

- Client-side upload and preview
- Server-side analysis route
- AI-assisted structured extraction
- Field comparison
- Rule-based validation
- Explainable report generation
- Exportable review result

### Out of Scope

- COLA integration
- Authentication
- User management
- Permanent database persistence
- Production document retention
- FedRAMP-certified deployment
- Full TTB rule coverage

## AI Extraction Layer

The AI extraction layer should return structured JSON only. The output should be validated before use.

Expected extracted fields:

```ts
export type ExtractedLabelFields = {
  brandName?: ExtractedField;
  classType?: ExtractedField;
  alcoholContent?: ExtractedField;
  netContents?: ExtractedField;
  producerNameAddress?: ExtractedField;
  countryOfOrigin?: ExtractedField;
  governmentWarning?: ExtractedField;
};

export type ExtractedField = {
  value: string;
  confidence: number;
  evidence?: string;
};
```

## Matching Layer

The matching layer separates human-obvious equivalence from actual mismatches.

Examples:

- `STONE'S THROW` and `Stone's Throw` should match after case normalization.
- `45% Alc./Vol.` and `45% ABV` may be equivalent after alcohol-content normalization.
- Missing government warning text should fail.

## Rule Engine

Rules should be deterministic where possible.

The rule engine should produce findings like:

```ts
export type VerificationFinding = {
  field: string;
  expected?: string;
  observed?: string;
  status: "PASS" | "WARN" | "FAIL" | "NEEDS_REVIEW";
  confidence: number;
  reason: string;
  normalizedExpected?: string;
  normalizedObserved?: string;
};
```

## Performance Target

The prototype should document a target of returning results in approximately 5 seconds when practical.

If processing takes longer, the UI should still communicate progress clearly.

## Deployment Assumption

The prototype will be deployed as a standalone web app, likely on Vercel for evaluation convenience.

Production notes should describe how this could later move toward Azure or government-controlled infrastructure, but that should not be built into the take-home prototype.

## Security and Privacy Assumptions

- Do not persist uploaded images by default.
- Do not store application data by default.
- Keep API keys server-side.
- Use `.env.local` for local secrets.
- Provide `.env.example` for reviewer setup.

## Design Principle

Use AI for perception and extraction. Use deterministic code for compliance rules. Use humans for final judgment.
