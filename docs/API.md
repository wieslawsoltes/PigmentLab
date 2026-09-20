# Package API and embedding

All nine packages are native ESM with named exports, version `1.0.0`, and an MIT license. They have no third-party runtime dependencies. Their dependencies refer only to other `@pigmentlab/*` packages. The source package READMEs enumerate public exports. These are small JavaScript libraries, not TypeScript declaration packages; TypeScript consumers can generate or supply declarations as needed.

## Install the delivered packages

At the repository root, `npm install --offline --ignore-scripts` links the local workspaces. In a separate application, install all delivered archives in one command:

```sh
npm install /path/to/PigmentLab/release/packages/*.tgz
```

The archives have not been uploaded to a package registry. Do not assume `npm install @pigmentlab/simulation` resolves to this delivery until you publish or configure your own registry. For unbundled browser usage, map each package name to its `src/index.js` URL, as shown in `index.html` and `examples/minimal-paint.html`.

## Paint without the studio

```js
import { createBackend, DEFAULT_SIMULATION } from '@pigmentlab/simulation';
import { Stroke, PRESETS } from '@pigmentlab/brushes';
import { PAPERS } from '@pigmentlab/paper';
import { createRenderer } from '@pigmentlab/renderer';
import { createLayer } from '@pigmentlab/document';

const engine = await createBackend(); // GPU initialization or explicit CPU fallback
engine.configure(384, 256, PAPERS[0]);
const layer = createLayer(engine, 'Watercolor');
const renderer = await createRenderer(canvas, engine);
renderer.resize(768, 512);

const stroke = new Stroke({ ...PRESETS[1], size: 20, stabilizer: 0 }, '#538caf', 123);
for (let x = 35; x < 340; x += 2) {
  layer.surface.stamp(stroke.point({ x, y: 128 + Math.sin(x / 35) * 28, pressure: 0.8 }));
}
for (let tick = 0; tick < 60; tick++) {
  layer.surface.step(1 / 60, DEFAULT_SIMULATION);
}
renderer.render([layer]);

// When the owning view is destroyed:
// renderer.dispose();
// layer.surface.dispose();
// engine.destroy();
```

Pointer coordinates and brush size passed to `Stroke` are in **material-grid units**. Convert from view coordinates after accounting for viewport transform and the canvas-to-material scale. `examples/minimal-paint.html` is an independent browser shell using the same packages but not the studio application. `examples/headless.mjs` uses the CPU engine and document codec without a DOM and writes an editable project.

## Backend / surface contract

`CPUBackend` and `GPUBackend` expose `kind`, `configure(width, height, paper)`, `createSurface()`, `setSelection(...)`, and `destroy()`. Prefer `createBackend({preferGPU: true})` in general application code; use explicit `GPUBackend` initialization when failure must not silently select CPU. The adapter-backed test page follows the latter pattern.

A surface owns its material storage and implements:

| Operation | Contract |
|---|---|
| `stamp(dabs)` | Deposit or modify material in ordered dabs; an empty list is a no-op |
| `step(dt, settings)` | Advance active material; returns whether stepping occurred |
| `operate(mode, value=1)` | Apply a selected material operation; modes below |
| `read()` | Promise of a copied, independent Float32Array snapshot |
| `upload(data)` | Replace all twelve channels; dimensions must match |
| `dispose()` | Release surface resources; do not call other operations afterward |

Material operation IDs are `1=dry`, `2=wet`, `3=clear`, `4=remove resist`, and `5=grayscale`. Selections constrain operations. `alphaLock` on a surface is synchronized from its layer by the app. Flood fill and transforms use asynchronous readback helpers (`floodFill`, `transformSurface`, `importPixels`) and are not GPU-resident flood-fill algorithms.

Dimensions/paper belong to a backend shared by all its surfaces. Changing backend dimensions while retaining old-sized surfaces is not supported. Dispose old surfaces or construct a replacement document transaction. Lower-level functions assume normalized dab/settings input; use `validateBrush()` for untrusted presets and the document validation pipeline for external projects. Direct low-level API calls are not a substitute for application validation.

`read()` queues a WebGPU copy before returning; later queue submissions cannot alter that staged snapshot. Always await readback before destroying the corresponding device. Dispose surfaces and renderer before destroying the backend. A lost GPU device cannot provide authoritative current fields; recovery requires an earlier saved snapshot.

## Project export

```js
import { createLayer, captureDocument, encodeProject } from '@pigmentlab/document';
const project = {
  engine, name: 'My study', width: 768, height: 512,
  layers: [layer], activeId: layer.id,
  simulation: { ...DEFAULT_SIMULATION }
};
const blob = await encodeProject(await captureDocument(project));
// Download blob in a browser, or write its arrayBuffer in Node.
```

An application must serialize its editing transactions while reading or replacing documents. `History` takes application-provided asynchronous `capture` and `restore` functions and provides checkpoint/undo/redo. The document package does not own your UI, renderer, device lifetime, or frame loop.

## Rendering and assets

`createRenderer(canvas, engine)` creates a matching compositor. `resize(width,height)` establishes output dimensions. `render(layers, options)` composites in array order. `pixels()` returns an independent ImageData result. `exportImage(renderer,layers,options)` uses browser image encoding; `heightmap(surface)` produces a normalized 8-bit height PNG. Browser-dependent codec availability still applies.

`compositorWGSL` is exported by the renderer package; `simulationWGSL` is exported by the kernels package. Hosts may compile those directly after supplying the documented bindings and packed state. There is no hidden binary shader asset or remote compilation service.

## UI integration

`Viewport` handles canvas/document-to-view transforms. `CanvasInput` routes pointer/coalesced-pointer and touch-gesture input to `begin`, `move`, and `end` callbacks. `CommandRegistry` stores command metadata, enabled conditions, and callbacks. The default package stylesheet is available at `@pigmentlab/ui/style.css`; it styles the PigmentLab studio DOM and includes global theme/reset rules, so a host should scope or adapt those rules when embedding in a different design system.

DOM helper parameters accepting raw HTML or attribute fragments (`dialog` content, button extras) are **trusted-markup APIs**. Apply `escapeHTML()` to untrusted plain text before interpolating it. The app validates project metadata and escapes displayed names; a host application must retain the equivalent boundary.

The complete studio additionally exposes:

```js
await window.PigmentLab.ready;
window.PigmentLab.getState();
window.PigmentLab.commands();
await window.PigmentLab.invoke('save');
```

Command identifiers should be enumerated from `commands()` rather than assumed. The standalone bundle also exposes `window.PigmentLab.packages` for exploratory integration and browser testing. Use ordinary package imports for production consumers; `window.PigmentLab.app` is the studio's internal mutable state, not a stable serialization API.
