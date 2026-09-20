# @pigmentlab/document

Lossless float-bit zero-run compression, validated binary .pigment containers, material snapshots, undo/redo orchestration, browser autosave and download helpers.

## Consumption

This is a standalone MIT-licensed ES module. Import it by package name after linking the repository workspaces or installing all delivered local package tarballs. The unbundled browser application uses an import map; no third-party runtime dependencies or application globals are required.

```js
import * as Document from '@pigmentlab/document';
```

Dependencies: `@pigmentlab/core`

## Public exports

`packFloats`, `unpackFloats`, `createLayer`, `layerMetadata`, `captureDocument`, `snapshotBytes`, `encodeProject`, `decodeProject`, `materializeSnapshot`, `History`, `AutosaveStore`, `download`.

See `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/FORMAT.md`, and `docs/TEST_REPORT.md` in the source distribution for contracts, layouts, limitations, examples, and validation evidence. `examples/headless.mjs` and `examples/minimal-paint.html` consume these packages independently of the studio.
