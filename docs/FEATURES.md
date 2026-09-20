# Feature and compatibility matrix

This matrix describes code in this delivery, not a promise of complete Rebelle parity. “Implemented” means an executable code path exists. Runtime validation is independently described in `TEST_REPORT.md`.

| Area | Implemented | Boundary |
|---|---|---|
| Natural-media state | Separate mobile/fixed pigment, free/absorbed water, resist and impasto fields per layer | Heuristic model, not calibrated material science |
| Wet paint | Neighbor transport, wet diffusion, absorption, evaporation, settling, rewetting, granulation, paper tilt | No full fluid velocity/pressure solver or porous-fiber network |
| Brushes | 23 presets in eight media; pressure/tilt footprint, spacing, stabilization, shape/grain; custom preset JSON import/export | No manufacturer brush scans, programmable brush-graph editor, or brush-catalog compatibility |
| Wet media | Watercolor and ink with different settlement behavior | No proprietary Rebelle DropEngine implementation |
| Thick paint | Oil/acrylic and knife accumulation with height-derived lighting | No viscoelastic 3D paint volume or proprietary RealShader implementation |
| Utilities | Eraser, water, dryer, blend, knife, resist/unmask, smudge, blow | Sampling approximations; no guarantee of mass conservation across these tools |
| Pigments | Three-band K/S-inspired subtractive mixing and twenty display swatches | Not measured spectral paint data, artist-pigment identification, or a full spectral renderer |
| Paper | Six seeded procedural substrates; editable roughness, absorption, tint and scale | No scanned library, custom paper bitmap import, or coupled permeability solver |
| Layers | Add/delete/duplicate/reorder/rename; visibility, lock, alpha-lock, opacity; six blend modes | Up to twelve layers; no groups, adjustment layers, clipping stacks, or PSD round-trip |
| Editing | Undo/redo, selection-constrained painting/fill, rect/ellipse/polygon selection primitives, resist, transforms and grayscale | Whole-document snapshot history; no raster-vector hybrid object model |
| Canvas | Pan/zoom/view rotation, fit, zoom readout, symmetry, touch gestures, navigator | A second touch can leave the first contact's initial dab; no verified hardware palm rejection |
| Documents | New/open/save, validated lossless material-state `.pigment` files, IndexedDB autosave | No `.reb`/PSD compatibility, cloud sync, durable journal, or automatic GPU-loss migration |
| Images | Browser-decoded raster import, pinned reference, drag/drop/paste, PNG/JPEG/WebP export | No RAW/deep bit-depth/color-profile pipeline; format decoding follows the browser |
| Height | Material height and normalized 8-bit PNG export | No 16-/32-bit displacement export |
| Recording | Browser MediaRecorder canvas-process video | Real-time video, not a deterministic event replay or accelerated time-lapse format |
| Interface | Original SVG icons, media/preset/paper docks, color/mixing/layer/history controls, dark/light themes, mobile drawers | Original layout inspired by painting workstations, not a pixel-identical Rebelle interface |
| Runtime | WebGPU compute + fragment compositor, CPU fallback, no third-party runtime dependencies | GPU path not run on an adapter in the delivery environment |
| Performance | Active-tile dispatch, bounded dab batches, split rendering/simulation schedule, round-robin layers | Full-grid backing buffers/copies; no benchmark-backed frame-rate or tablet-latency guarantee |
| Packaging | Nine independently importable ESM packages, npm tarballs, static build and standalone HTML | Tarballs are not published to npm; no hosted deployment provisioned |

## Explicitly outside this delivery

There is no Rebelle project/brush compatibility, NanoPixel-style proprietary reconstruction, full spectral pigment database, ICC-managed/CMYK production pipeline, Photoshop integration, advanced print/color-proof workflow, multi-document tabs, animation timeline, plug-in ABI, online collaboration, or complete accessibility/hardware certification. The application is usable and editable without those features; it should not be represented as a complete commercial-product replacement or a compatibility clone.

## Practical operating guidance

Use modest material grids and layer counts on CPU. A high-resolution exported image does not imply an equally high-resolution simulation. Pause water or dry layers to stop evolution when testing pixel/field equality or editing a finished composition. Save project downloads regularly; autosave is a single origin-local slot and may fail under quota or privacy restrictions. The engine can attempt WebGPU on localhost/HTTPS when the browser exposes a suitable adapter, and its status UI identifies the selected backend.
