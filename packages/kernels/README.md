# @pigmentlab/kernels

Plain WGSL compute shader source implementing stamp, step, and operate entry points over the shared 48-byte material cell. No application or WebGPU device is created by importing this module.

## Consumption

This is a standalone MIT-licensed ES module. Import it by package name after linking the repository workspaces or installing all delivered local package tarballs. The unbundled browser application uses an import map; no third-party runtime dependencies or application globals are required.

```js
import * as Kernels from '@pigmentlab/kernels';
```

Dependencies: None.

## Public exports

`simulationWGSL`.

The delivery environment verified the CPU implementation and source lint, but did not expose a WebGPU adapter. Adapter-backed pipeline/numerical tests are included at `tests/gpu-smoke.html`; shader lint is not compiler validation.

See `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/FORMAT.md`, and `docs/TEST_REPORT.md` in the source distribution for contracts, layouts, limitations, examples, and validation evidence. `examples/headless.mjs` and `examples/minimal-paint.html` consume these packages independently of the studio.
