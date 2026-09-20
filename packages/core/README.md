# @pigmentlab/core

Deterministic math, observables, serial work queues, ordered spatial dab binning, active tile indexing, and rasterized selection coverage.

## Consumption

This is a standalone MIT-licensed ES module. Import it by package name after linking the repository workspaces or installing all delivered local package tarballs. The unbundled browser application uses an import map; no third-party runtime dependencies or application globals are required.

```js
import * as Core from '@pigmentlab/core';
```

Dependencies: None.

## Public exports

`clamp`, `lerp`, `smoothstep`, `align`, `invariant`, `finite`, `uid`, `hash`, `rng`, `valueNoise`, `Signal`, `SerialQueue`, `ActiveTiles`, `binDabs`, `CELL_FLOATS`, `CELL_BYTES`, `TILE_SIZE`, `MAX_LAYERS`, `BLEND_MODES`, `bounds`, `polygonContains`, `createSelection`.

See `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/FORMAT.md`, and `docs/TEST_REPORT.md` in the source distribution for contracts, layouts, limitations, examples, and validation evidence. `examples/headless.mjs` and `examples/minimal-paint.html` consume these packages independently of the studio.
