# @pigmentlab/brushes

Twenty-three natural-media presets, seventeen tool identifiers, pressure/tilt-sensitive dab generation, stroke resampling, packed dab layout, symmetry and preset validation.

## Consumption

This is a standalone MIT-licensed ES module. Import it by package name after linking the repository workspaces or installing all delivered local package tarballs. The unbundled browser application uses an import map; no third-party runtime dependencies or application globals are required.

```js
import * as Brushes from '@pigmentlab/brushes';
```

Dependencies: `@pigmentlab/core`, `@pigmentlab/pigments`

## Public exports

`TOOLS`, `MEDIA`, `PRESETS`, `utilityBrush`, `Stroke`, `packDabs`, `mirrorDabs`, `validateBrush`.

See `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/FORMAT.md`, and `docs/TEST_REPORT.md` in the source distribution for contracts, layouts, limitations, examples, and validation evidence. `examples/headless.mjs` and `examples/minimal-paint.html` consume these packages independently of the studio.
