# @pigmentlab/pigments

Three-band RGB-derived K/S surrogate mixing, transfer functions, HSV/RGB helpers, twenty illustrative swatches, and material/blend color reconstruction. This is not a measured spectral-pigment database.

## Consumption

This is a standalone MIT-licensed ES module. Import it by package name after linking the repository workspaces or installing all delivered local package tarballs. The unbundled browser application uses an import map; no third-party runtime dependencies or application globals are required.

```js
import * as Pigments from '@pigmentlab/pigments';
```

Dependencies: `@pigmentlab/core`

## Public exports

`srgbToLinear`, `linearToSrgb`, `hexToRgb`, `rgbToHex`, `rgbToKS`, `ksToRgb`, `hexToKS`, `mixPigments`, `hsvToRgb`, `rgbToHsv`, `PALETTE`, `cellColor`, `blendChannel`.

See `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/FORMAT.md`, and `docs/TEST_REPORT.md` in the source distribution for contracts, layouts, limitations, examples, and validation evidence. `examples/headless.mjs` and `examples/minimal-paint.html` consume these packages independently of the studio.
