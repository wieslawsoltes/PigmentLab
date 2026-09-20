# @pigmentlab/renderer

CPU and WGSL fragment compositors, material-to-color conversion, layer blending, paper/impasto lighting, diagnostic overlays, snapshots, thumbnails and browser image exports.

## Consumption

This is a standalone MIT-licensed ES module. Import it by package name after linking the repository workspaces or installing all delivered local package tarballs. The unbundled browser application uses an import map; no third-party runtime dependencies or application globals are required.

```js
import * as Renderer from '@pigmentlab/renderer';
```

Dependencies: `@pigmentlab/core`, `@pigmentlab/pigments`, `@pigmentlab/paper`

## Public exports

`compositorWGSL`, `GPURenderer`, `CPURenderer`, `createRenderer`, `exportImage`, `heightmap`, `layerThumbnail`.

The delivery environment verified the CPU implementation and source lint, but did not expose a WebGPU adapter. Adapter-backed pipeline/numerical tests are included at `tests/gpu-smoke.html`; shader lint is not compiler validation.

See `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/FORMAT.md`, and `docs/TEST_REPORT.md` in the source distribution for contracts, layouts, limitations, examples, and validation evidence. `examples/headless.mjs` and `examples/minimal-paint.html` consume these packages independently of the studio.
