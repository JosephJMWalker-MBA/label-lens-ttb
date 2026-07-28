# Frozen slice definitions

Slices are evaluated on the 50 recovery-bearing governed cases and may overlap.

- **bottom-positioned**: `inspection.visualStrata` contains `alcohol-at-bottom`.
- **side**: `inspection.visualStrata` contains `alcohol-at-side-or-rotated`.
- **rotated**: fixed Alcohol truth orientation is `rotated-180`.
- **vertical**: fixed Alcohol truth orientation is `vertical-clockwise`, `vertical-counterclockwise`, or `vertical-stacked`.
- **ordinary horizontal**: truth is present, orientation is `horizontal`, and neither bottom-positioned nor side applies.
- **governed Alcohol absence**: fixed Alcohol truth presence is `absent`.

Frozen counts:

| Slice | Cases |
| --- | ---: |
| bottom-positioned | 24 |
| side | 12 |
| rotated | 0 |
| vertical | 8 |
| ordinary horizontal | 2 |
| governed Alcohol absence | 12 |

Detection recall is `selected state != NOT_OBSERVED` divided by present-truth cases in the slice. An empty slice reports `n=0` and no rate; it is never silently omitted or assigned zero recall.
