# Semantic Region Survival Diagnostic v1

Status: evaluation-only diagnostic for Issue #131

Ontology: `semantic-region-ontology.v1`

Annotation schema: `semantic-region-annotations.v1`

This diagnostic changes the evaluation unit from an expected string to an expected semantic object. It does not change production extraction. The production analyzer still exposes only `brandName` and `alcoholStatement`; no other semantic class is a production field.

## Governing sequence

```text
observe
  -> segment
  -> provisionally classify
  -> choose operation
  -> acquire content
  -> update scene
  -> redirect attention
```

OCR is one content-acquisition operation attached to an observed region. OCR tokens and field candidates are preserved as observations and projections, not promoted to the primary scene model.

## Pipeline boundary

Current production path:

```text
committed image
  -> fixed preprocessing and OCR passes
  -> OCR words and reconstructed lines
  -> brand/alcohol candidate generation
  -> deterministic filtering and ranking
  -> production analyzer response
  -> deterministic rules, evidence, provenance, export, review
```

Issue #131 shadow path:

```text
production OCR/pass/candidate artifacts        sparse adjudicated annotations
                  |                                        |
                  +-------------> evaluation adapter <-----+
                                      |
                               semantic proposal nodes
                                      |
                         provisional hypotheses + bases
                                      |
                       operation recommendation comparison
                                      |
                         one target-object survival trace
                                      |
                              generated diagnostics
```

The dependency direction is strictly:

```text
production artifacts -> evaluation adapter -> semantic diagnostic
```

Evaluation annotations, expected values, semantic hypotheses, and target traces are never imported by the production extractor. The exact serialized production analyzer response is captured before semantic diagnostic assembly and compared byte-for-byte with the immutable Issue #131 baseline.

The existing per-case harness remains bounded by default. Semantic scene assembly is an explicit full-report opt-in, so callers that need only the existing case report do not pay the diagnostic payload cost.

## Vocabulary

| Family | Classes |
| --- | --- |
| Structural | `artifact`, `display_panel`, `information_panel`, `auxiliary_panel`, `unknown_panel` |
| Identity | `brand_bearing_display`, `producer_name_address`, `class_type`, `appellation`, `vintage` |
| Regulatory | `alcohol_statement`, `government_warning`, `net_contents`, `mandatory_disclosure` |
| Commercial | `barcode`, `qr_code`, `domain`, `sku_like_region` |
| Presentation | `logo`, `illustration`, `decorative_script`, `decorative_prose`, `background_texture` |
| Unknown | `unknown_text_region`, `unknown_non_text_region`, `conflicting_classification` |

The vocabulary describes what a region might be. It does not assert that the top-ranked hypothesis is correct.

## Annotation rules

1. Annotate sparse high-value targets and hard negatives, not every visible region.
2. Derive active target geometry from the existing visually adjudicated OCR-region benchmark.
3. Store geometry as normalized coordinates in the committed original-image frame.
4. Preserve multiple classes where the artwork supports legitimate ambiguity.
5. Use `unknown` or a medium-strength annotation when the source cannot justify precision.
6. Record a short visual adjudication basis for every annotation.
7. Keep expected semantic class and operation inside evaluation truth; neither may be a classifier or OCR-search feature.
8. Never infer an annotation from the expected OCR string alone.
9. Evaluation target and panel nodes are anchors. They never count as system proposals.

## Region node semantics

Every diagnostic node has a stable ID, original-image geometry, proposal source and basis, optional parent panel, visual observations, provisional hypotheses, raw content observations, acquisition history, relationships, projected brand/alcohol candidates, and a diagnostic state.

States are `proposed`, `provisionally_classified`, `partially_read`, `resolved`, and `unresolved`.

Relationships are `contains`, `same_panel_as`, `adjacent_to`, `aligned_with`, `continuation_of`, `conflicts_with`, `alternative_to`, `supports_field`, and `contextualizes`. V1 emits only relationships supported by current recorded artifacts. A relationship type existing in the ontology does not imply that V1 inferred it.

Proposal sources distinguish annotation anchors, OCR pass regions, OCR token or line geometry, reconstructed brand lines and candidates, alcohol candidates, recovery crops, panel annotations, and unknown source. Full-image OCR pass and recovery-crop nodes are structural observations; they do not by themselves count as semantic object proposals.

## Uncertainty and evidence rules

- Multiple hypotheses may coexist.
- `unknown_text_region`, `unknown_non_text_region`, and `conflicting_classification` are valid outcomes.
- `rankingScore` is a deterministic ordering feature, never a calibrated probability or correctness confidence.
- Each hypothesis records its observed basis and source reference.
- Existing production filter reasons are evidence for provisional hypotheses, not semantic truth.
- A target loss is represented by one complete survival trace, including `unattributed` when the current artifacts cannot support a narrower cause.
- Candidate `observedText` is copied from existing artifacts. Production-normalized values are separately labeled and never described as OCR text generated by this diagnostic.

## Operation vocabulary

| Operation | V1 meaning |
| --- | --- |
| `generic_text_ocr` | Existing fixed production OCR produced an observation. |
| `stylized_text_ocr` | Recommended shadow operation for a plausible stylized identity display; not implemented or run. |
| `numeric_mandatory_statement_ocr` | Recommended shadow operation for a numerical alcohol statement; not implemented or run. |
| `barcode_decoder_future` | Future non-OCR reader recommendation; not implemented or run. |
| `no_read_contextual` | Preserve a contextual object without trying to project text. |
| `unresolved_operation` | Current evidence does not justify a more specific routing recommendation. |

Operation appropriateness compares the deterministic recommendation with the operation expected for the adjudicated target. Because production currently uses generic fixed OCR passes, specialized-operation gaps are reported honestly rather than treated as completed work.

## Survival trace

Each selected brand or alcohol target receives exactly one trace through:

1. target annotated;
2. overlapping system region proposed;
3. correct semantic class retained;
4. appropriate acquisition operation identified;
5. useful target content recovered;
6. content and correct class assembled in one scene object;
7. brand or alcohol candidate projected;
8. candidate selected, retained as an alternate, quarantined, filtered, or not projected;
9. trustworthy evidence produced or a terminal loss assigned.

Terminal categories preserve the distinctions required by Issue #131, including proposal loss, semantic suppression, wrong operation, content loss, assembly loss, projection loss, filtering, ranking, honest alternate, honest unresolved, trustworthy selected evidence, false certainty, and unattributed.

## Competing approaches for the next design review

The generated report ranks experiments by measured trigger count but does not select a winner before measurement.

| Boundary | Approach A | Approach B | Fixed-risk comparison |
| --- | --- | --- | --- |
| Proposal | Existing OCR/candidate regions | Deterministic connected-component or contour proposals | Semantic-object proposal recall at the same proposal budget |
| Operation routing | Existing generic fixed OCR | Shadow stylized/numeric targeted OCR | Correct content recovered per operation millisecond, with false certainty fixed |
| Object assembly | Independent OCR lines | Panel/alignment/adjacency/continuation grouping | Complete objects assembled without unsafe text joins |
| Projection timing | Current token-first filtering | Region-first provisional classification before projection | Target projection and suppression with false-certainty count fixed |

No training, cloud API, external vision model, or production behavior change is authorized by these comparisons.

## Limitations

- Sparse annotations are not dense segmentation and do not estimate whole-corpus scene recall.
- V1 adapts only artifacts already observable from the production extractor; it has no image-first component proposal stage.
- Brand candidate geometry is reconstructed only from recorded pass and line indexes. Where that is unavailable, no geometry is invented.
- Specialized reading operations are recommendations only.
- Typography is represented only through proxies already present in OCR artifacts and geometry.
- Target overlap is an evaluation matching rule, not a production decision.
- The diagnostic evaluates trustworthy evidence preservation. It does not itself improve extraction accuracy.

Future production adoption requires a separately authorized issue or ADR decision.
