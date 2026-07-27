# Deterministic experiment diff

- Declared variable: `scale`
- Behavioral delta count: 8
- Correct delta: 0
- False-certainty delta: 0
- Median latency delta ms: 93.1783760000003
- P95 latency delta ms: 293.57674999999927
- Decision: `KILL` — Kill criterion hit: no fixed-truth improvement.

| Case | Control selected | Treatment selected | Control class | Treatment class | Behavior changed |
| --- | --- | --- | --- | --- | --- |
| approved-wine-004 | FAT TORIA | TORIA | OCR_RECOGNITION_MISS | OCR_RECOGNITION_MISS | true |
| approved-wine-005 | GATT | GATT | OCR_RECOGNITION_MISS | OCR_RECOGNITION_MISS | false |
| approved-wine-023 |  | Cralirtid | OCR_RECOGNITION_MISS | OCR_RECOGNITION_MISS | true |
| approved-wine-027 |  |  | OCR_RECOGNITION_MISS | OCR_RECOGNITION_MISS | true |
| approved-wine-031 | enheesO | enheesO | OCR_RECOGNITION_MISS | OCR_RECOGNITION_MISS | false |
| approved-wine-035 | Hokoniites | Aotonit | OCR_RECOGNITION_MISS | OCR_RECOGNITION_MISS | true |
| approved-wine-085 | AH sasaki |  | OCR_RECOGNITION_MISS | OCR_EMPTY | true |
| approved-wine-091 |  |  | OCR_RECOGNITION_MISS | OCR_RECOGNITION_MISS | false |
| la-fattoria-rotated | FAT TORIA | TORIA | OCR_RECOGNITION_MISS | OCR_RECOGNITION_MISS | true |
| wine-multi-artifact-04-region-1 |  |  | OCR_RECOGNITION_MISS | OCR_EMPTY | true |
| wine-multi-artifact-04-region-2 | Colles | Colla | OCR_RECOGNITION_MISS | OCR_RECOGNITION_MISS | true |
