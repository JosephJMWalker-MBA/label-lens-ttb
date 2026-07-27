# Post-run isolation gate failure

Status: stopped; do not publish or treat the provisional OCR result as a valid
one-variable experiment.

## Finding

The mathematical Otsu selector and custom binarizer passed their pre-treatment
unit gates, but a final encoded-artifact audit found a channel-layout
difference that was not covered by those gates:

- the custom binarizer accepts and emits one byte per grayscale pixel;
- Sharp serializes the treatment buffer as an 8-bit, three-channel sRGB PNG
  whose decoded channel values are only `0` and `255`;
- 7 of 11 control PNGs retain a fourth, fully opaque alpha channel;
- the remaining 4 control PNGs are three-channel sRGB;
- all 11 treatment PNGs are three-channel sRGB with no alpha.

The removed alpha channel contains only `255`, so the decoded visible RGB pixels
are not changed by alpha removal. Nevertheless, the encoded input passed to OCR
changes both pixel thresholding and channel layout for 7 cases. Under the
preregistered rule that thresholding must be the only changed variable, this is
an isolation failure.

## Disposition

- No adaptive thresholding, inversion, fixed threshold, CLAHE, sharpening, or
  other second treatment was run.
- The provisional behavior hashes reproduced and the provisional decision was
  `KILL`, but those results are not decision-grade because the treatment arm is
  not proven to isolate thresholding alone.
- The branch must not be committed, pushed, or opened as the requested draft PR
  without a newly preregistered implementation that preserves the control
  channel/alpha layout case by case and reruns from scratch.
- The existing preregistration is not amended after treatment; this file records
  the later audit finding separately.

