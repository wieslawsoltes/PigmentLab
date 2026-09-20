# @pigmentlab/paper

Deterministic procedural paper height, absorption, and extension channels for six substrates. The current simulation couples height and absorption, not the generated permeability channel.

## Consumption

This is a standalone MIT-licensed ES module. Import it by package name after linking the repository workspaces or installing all delivered local package tarballs. The unbundled browser application uses an import map; no third-party runtime dependencies or application globals are required.

```js
import * as Paper from '@pigmentlab/paper';
```

Dependencies: `@pigmentlab/core`

## Public exports

`PAPERS`, `paperAt`, `createPaper`.

See `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/FORMAT.md`, and `docs/TEST_REPORT.md` in the source distribution for contracts, layouts, limitations, examples, and validation evidence. `examples/headless.mjs` and `examples/minimal-paint.html` consume these packages independently of the studio.
