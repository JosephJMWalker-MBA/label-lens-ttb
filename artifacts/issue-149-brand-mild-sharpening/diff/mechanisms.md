# Sharpening mechanism review

Mechanism labels below are deterministic classifications from OCR words, normalized transcripts, candidate traces, confidence, and truth-distance metrics. Visual causal language is intentionally withheld unless the paired artifacts support it.

| Changed case | Classification | Metric evidence | Thin stroke | Outline/shadow | Background |
| --- | --- | --- | --- | --- | --- |
| approved-wine-004 | `SHARPENING_CHANGED_CONFIDENCE_ONLY` | Transcript and selection held while confidence or reliability changed. | yes | absent | clean |
| approved-wine-005 | `SHARPENING_CHANGED_CONFIDENCE_ONLY` | Transcript and selection held while confidence or reliability changed. | yes | absent | clean |
| approved-wine-023 | `SHARPENING_RECOVERED_CHARACTER` | Closest normalized edit distance improved 14 -> 12. | yes | absent | clean |
| approved-wine-027 | `UNDETERMINED` | The deterministic metrics do not isolate a supported mechanism. | yes | present | textured |
| approved-wine-031 | `SHARPENING_CHANGED_CONFIDENCE_ONLY` | Transcript and selection held while confidence or reliability changed. | yes | absent | clean |
| approved-wine-035 | `SHARPENING_RECOVERED_CHARACTER` | Closest normalized edit distance improved 9 -> 8. | yes | absent | textured |
| approved-wine-085 | `UNDETERMINED` | The deterministic metrics do not isolate a supported mechanism. | yes | absent | textured |
| approved-wine-091 | `SHARPENING_CHANGED_CONFIDENCE_ONLY` | Transcript and selection held while confidence or reliability changed. | yes | absent | clean |
| la-fattoria-rotated | `SHARPENING_CHANGED_CONFIDENCE_ONLY` | Transcript and selection held while confidence or reliability changed. | yes | absent | clean |
| wine-multi-artifact-04-region-1 | `SHARPENING_CHANGED_CONFIDENCE_ONLY` | Transcript and selection held while confidence or reliability changed. | yes | absent | clean |
| wine-multi-artifact-04-region-2 | `SHARPENING_CAUSED_EMPTY_OCR` | Treatment changed a non-empty control transcript into empty OCR. | yes | absent | clean |

## Paired-artifact review

All 11 control/treatment preprocessed pairs were inspected side by side.

- `approved-wine-004`, `approved-wine-005`, `approved-wine-031`, `approved-wine-091`, `la-fattoria-rotated`, and `wine-multi-artifact-04-region-1`: treatment edges are visibly darker/crisper, including thin strokes and punctuation/diacritics, but normalized transcript and candidate semantics do not improve. The recorded effect is confidence-only; the images do not support a stronger causal claim.
- `approved-wine-023`: thin script edges become crisper and normalized edit distance to truth improves from 14 to 12. Truth is still absent from the raw transcript and candidate list, so this is only metric evidence for character recovery, not a successful word recovery.
- `approved-wine-035`: thin script edges become crisper and normalized edit distance improves from 9 to 8, but the shorter treatment candidate is still wrong. The pair does not establish whether edge contrast or character merging produced the change.
- `approved-wine-027`: sharpening visibly emphasizes the decorative outline/background edges. The treatment OCR trace expands into many line/noise-like symbols and selects `AEE EEE`; this is consistent with texture/noise amplification, but the metrics cannot isolate grouping from artifact creation, so the classification remains `UNDETERMINED`.
- `approved-wine-085`: the low-contrast textured crop becomes darker and crisper, while OCR changes from one wrong candidate to different wrong fragments with no kept candidate. Noise amplification is visually plausible, but not established; classification remains `UNDETERMINED`.
- `wine-multi-artifact-04-region-2`: the paired crop remains visibly present and readable, but treatment OCR changes from `Colles Dig` / selected `Colles` to no words. This directly supports `SHARPENING_CAUSED_EMPTY_OCR`; it does not establish which anti-aliasing or edge-strength interaction caused the recognizer failure.

No paired artifact supports successful Brand recovery. There is no evidence that sharpening repaired punctuation, outline/shadow handling, character merging, or textured-background recognition.
