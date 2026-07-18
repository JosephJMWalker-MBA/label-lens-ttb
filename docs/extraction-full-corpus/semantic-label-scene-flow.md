# Semantic Label-Scene Acquisition and Regulatory Decision Flow

This diagram captures the intended image-first, semantic-region workflow while preserving the frozen production boundary. OCR is one acquisition operation attached to a provisional semantic object; it is not the scene model itself.

```mermaid
flowchart TD
    A[Label image]
    B[Scene initializer<br/>artifact, image frame,<br/>unresolved regulatory needs]
    C[Region proposal sources<br/>visual components, panels,<br/>OCR components, existing candidates]
    D[Provisional region classification<br/>retain multiple semantic hypotheses]
    E[Incremental label-scene graph]
    F{Sufficient, unresolved,<br/>or budget exhausted?}

    G[Regulatory attention queue]
    H{Highest-priority unresolved object}
    I[Choose acquisition operation]

    J[Generic or stylized-text OCR]
    K[Numeric / mandatory-statement OCR]
    L[Barcode decoder — future]
    M[No read; preserve as<br/>decorative / contextual / unknown]

    N[Attach observations<br/>geometry, confidence, and provenance]
    O[Reclassify region and<br/>update relationships]

    P[Project observed<br/>brand / alcohol evidence]
    Q[Frozen analyzer schema]
    R[Frozen deterministic rules]
    S[PASS / NEEDS_REVIEW / not_run]

    A --> B --> C --> D --> E --> F
    F -- More evidence justified --> G --> H --> I
    I --> J
    I --> K
    I --> L
    I --> M
    J --> N
    K --> N
    L --> N
    M --> N
    N --> O --> E

    F -- Sufficient or exhausted --> P --> Q --> R --> S
```

## Boundary represented by the diagram

The left-hand loop is an incremental, evaluation-first scene-understanding model:

`observe → segment → provisionally classify → choose operation → acquire content → update scene → redirect attention`

The right-hand path remains frozen:

`project observed evidence → analyzer schema → deterministic rules → PASS / NEEDS_REVIEW / not_run`

The diagram does **not** authorize production semantic routing, new production fields, specialized OCR execution, barcode decoding, or changes to reviewer authority. Those require separately authorized work.
