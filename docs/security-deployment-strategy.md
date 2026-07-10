# Security and Deployment Strategy

## Purpose

Label Lens TTB must be deployed and testable without assuming that a production federal environment would allow unrestricted cloud AI calls.

The prototype should demonstrate a secure, reviewable architecture that can run in two modes:

1. **Demo Mode** - deployed web app with deterministic sample analysis for reviewers.
2. **Local AI Mode** - deployed web app calls a privately hosted analysis service, such as a Jetson-hosted OCR/computer-vision service.

This keeps the submission easy to evaluate while showing a realistic path toward secure deployment.

## Core Security Principles

### 1. No Secrets in the Browser

API keys, model endpoints, and service tokens must never be exposed to client-side code.

Allowed:

- Public UI configuration
- Demo/sample data
- Non-sensitive validation rules

Not allowed:

- OpenAI API keys in the browser
- Jetson service tokens in the browser
- Long-lived secrets in committed files

### 2. Uploads Are Ephemeral

The prototype should treat uploaded label images as temporary processing inputs.

Recommended behavior:

- Accept image upload in memory
- Process the image
- Return extracted fields and findings
- Do not persist uploaded images by default

If persistence is later added, it should require explicit retention policy decisions.

### 3. AI Extracts, Rules Verify

AI or OCR should extract observed label text and fields. It should not be the final compliance authority.

The deterministic rule engine is responsible for:

- Required field checks
- Fuzzy matching
- Government warning validation
- Confidence-based review flags
- Report generation

This makes the system easier to test, explain, and secure.

### 4. Support No-LLM Operation

The system should be engineered so the extraction layer can be swapped.

Supported extraction strategies:

- Mock/demo extractor for reviewer testing
- OCR-only extractor using Tesseract/EasyOCR-style output
- Local vision model hosted on Jetson
- Cloud vision/LLM extractor when explicitly configured

The rest of the app should not care which extractor produced the structured field data, as long as it matches the schema.

## Deployment Modes

### Mode A: Public Reviewer Demo

Purpose: Let reviewers open the deployed URL and test the workflow immediately.

Recommended behavior:

- Use deterministic demo/sample analysis if no private model endpoint is configured
- Clearly label sample/demo mode
- Allow users to inspect the generated verification report
- Avoid requiring reviewers to provide an API key

Security posture:

- No secrets needed
- No persistent storage
- No external AI dependency required for basic demo

### Mode B: Server-Side Cloud AI

Purpose: Optional enhanced extraction using a server-side model API.

Recommended behavior:

- Store provider API key only in deployment environment variables
- Send image only through server-side route
- Validate model output with schema before using it
- Return safe, structured errors

Security posture:

- Secrets stay server-side
- AI output is treated as untrusted until validated
- Compliance logic remains deterministic

### Mode C: Jetson Local AI Service

Purpose: Demonstrate a production-minded path where AI processing can run on controlled hardware.

Recommended architecture:

```text
Browser UI
  -> Next.js API route
    -> Private analysis endpoint
      -> Jetson OCR / CV service
        -> Structured extracted fields
    -> Deterministic rule engine
  -> Verification report
```

Jetson service responsibilities:

- Image preprocessing
- OCR
- Optional local vision model inference
- Return structured extracted fields with confidence values

Jetson service should not be responsible for final compliance decisions.

Security controls:

- Require service token or mTLS for private API access
- Restrict accepted content types
- Set upload size limits
- Do not expose Jetson directly to the public internet if avoidable
- Prefer private tunnel/VPN or reverse proxy with authentication
- Log request metadata, not raw label images by default

## No-LLM Baseline

The no-LLM baseline is important because much of this task is deterministic after text extraction.

A strong no-LLM baseline can include:

- OCR extraction
- Regex parsing for ABV/proof
- Regex parsing for net contents
- Keyword/region search for warning statement
- String normalization
- Fuzzy comparison
- Deterministic rule checks

This baseline proves the system is not dependent on a black-box model for every decision.

## Threat Model

### Assets to Protect

- Uploaded label images
- Expected application field values
- API keys and model endpoint credentials
- Verification reports
- Internal service endpoints

### Main Risks

- Secret leakage through client bundle
- Large or malicious file upload
- Prompt injection hidden in label text
- Overtrusting AI output
- Persisting images unintentionally
- Public exposure of a private Jetson endpoint
- Unclear reviewer behavior when AI is unavailable

### Mitigations

- Server-only environment variables
- File type and size validation
- Schema validation of extractor output
- Deterministic rule engine
- Demo mode fallback
- No default persistence
- Private network path for local AI service
- Clear limitations in UI and README

## Test Requirements

Security and deployment should be tested explicitly.

Planned tests:

- Missing API key returns demo mode or readable error
- Client bundle does not require private secrets
- Oversized image upload is rejected
- Unsupported file type is rejected
- Extractor output schema rejects malformed results
- Rule engine works without any AI call
- Demo mode returns deterministic report
- Jetson endpoint configuration is optional

## Submission Positioning

The deployed prototype should be immediately testable, but the architecture should show a realistic path toward controlled deployment.

The best review message is:

> The app can be evaluated without cloud AI access, but it is designed so a secure local Jetson-hosted extraction service or a server-side model provider can be plugged in without changing the rule engine or UI contract.
