# Architecture and numerical model

## Separation and dependencies

The application in `app/main.js` composes nine ESM libraries. None imports application code. The browser uses an import map; Node uses workspace links. `scripts/build.mjs` is a purpose-built, zero-dependency bundler for this repository's named-import/named-export conventions, not a general ECMAScript bundler. It bundles the same package sources into the standalone HTML.

```text
HTML studio → UI commands / pointer input → application transaction boundary
                              ↓                         ↓
                    brushes → ordered dabs        document/history
                              ↓                         ↕
                    simulation surfaces  ←→  typed material fields
                       ↙            ↘
                CPU oracle       WGSL kernels
                       ↘            ↙
                   renderer → canvas / image export

core       ← used throughout
pigments   ← brushes, simulation, renderer
paper      ← simulation, renderer
UI         ← DOM/input/style only; no material-engine dependency
```

`createBackend()` tries a WebGPU adapter/device and compiles compute pipelines. Initialization failure returns a CPU backend with a diagnostic reason. `createRenderer()` selects the renderer appropriate to that backend. Runtime device loss freezes GPU work and reports recovery guidance; it does not migrate inaccessible device state automatically into a CPU engine.

## Material state: 48 bytes per grid cell

Each layer owns two full-resolution material buffers. The CPU uses two `Float32Array` instances; WebGPU uses two storage buffers. `Cell` is three `vec4<f32>` values, with identical layout on both backends:

| Float offset | Meaning |
|---|---|
| 0–2 | Mobile-pigment mass multiplied by three K/S coefficients |
| 3 | Free surface water |
| 4–6 | Deposited-pigment mass multiplied by three K/S coefficients |
| 7 | Impasto height |
| 8 | Mobile pigment mass |
| 9 | Deposited pigment mass |
| 10 | Absorbed water / saturation |
| 11 | Resist-mask coverage |

These are dimensionless artistic state variables, not SI-calibrated quantities. `material` is the shader field name for the final `vec4`. All twelve floats are persisted bit-exactly.

A shared paper array stores four floats per cell: height, absorption, permeability, and reserved. The current transport solver uses height and absorption; the permeability channel is generated for extension, not currently coupled into transport. Selection coverage is a separate one-float-per-cell field. Layer opacity and blending are metadata, not baked into pigment state.

Canvas pixel dimensions and material-grid dimensions are separate. The renderer reconstructs the grid at the output resolution. Increasing canvas/export dimensions does not create additional physical simulation detail. The reader permits up to 8192×8192 output dimensions and 1536×1536 material dimensions subject to its aggregate state budget; these are validation ceilings, not hardware or performance guarantees. Interactive presets use smaller grids, particularly on CPU.

## Brush deposition

`Stroke` turns pointer samples into seeded dabs. Pressure changes footprint/loading; pen tilt alters footprint orientation/aspect. Arc-length resampling reduces spacing dependence on pointer event density. Stabilization filters the incoming sample path, so event-rate independence should not be interpreted as exact invariance with stabilization enabled.

A dab is 80 bytes, packed as five `vec4` values: geometry; three K/S values plus load; water/opacity/hardness/grain; angle/tool/seed/pressure; motion/thickness/shape. The engine bins dabs into 32×32 tiles while retaining dab order. Each invocation owns one destination cell and iterates its tile's dabs, avoiding atomic floating-point accumulation.

Mask and selection coverage multiply deposition. Alpha lock rejects deposition into empty pigment cells. Wet media deposit mobile mass and water; ink partly settles immediately. Dry media deposit fixed mass. Oil, acrylic, and the knife add height. Eraser removes material, water adds moisture, dryer transfers mobile to fixed material, and blend/smudge/blow sample the read-only source field. These sampling tools are approximations, not a volume-conserving deformable-paint model.

GPU stamp submissions are split into at most 256 dabs. Blur/smudge-like operations read the source snapshot of each submission. A CPU caller supplying more than 256 such dabs in one `stamp()` call need not get the same result as the GPU chunked path; ordinary pointer batches are smaller. Exact cross-device float-bit identity is not promised.

## Transport and drying

Each step uses a read-only source and separate destination. For neighboring cells `i` and `j`, the heuristic potential is:

```text
speed(i→j) = 0.085 (water_i − water_j)
           + 0.025 (height_i − height_j) min(water_i + water_j, 1)
           + 0.042 dot(paperTilt, neighborDirection)

outflow = min(max(speed, 0), 0.1 water_i) · maskBarrier · tick
inflow  = min(max(−speed, 0), 0.1 water_j) · maskBarrier · tick

tick = clamp(dt · 60, 0, 1)
```

Four-neighbor donor flux transports free water, mobile mass, and weighted K/S. Additional wet-neighbor diffusion uses a coefficient bounded by `0.055`; resist masks reduce both flux and diffusion. Absorption moves surface water into saturation, evaporation removes water, and drying/granulation transfer pigment into the fixed deposit. Rewetting releases a small fraction of that deposit back to the mobile phase. State is clamped nonnegative.

This is a finite-grid donor/diffusion heuristic for interactive painting. It has no pressure projection, velocity field, lattice-Boltzmann solver, Navier–Stokes solve, contact-angle model, or calibrated paper-fiber network. Brush deletion, saturation/height clamps, smudging, transformations, and absorption/evaporation mean not every operation conserves every quantity. Conservation assertions apply to specified transport tests, not arbitrary tools.

## GPU dispatch and memory

The three compute entry points are `stamp`, `step`, and `operate`, each with an 8×8×1 workgroup. A tile dispatch uses `dispatchWorkgroups(4, 4, tileCount)`.

| Binding | Resource |
|---|---|
| 0 | Read-only source cells |
| 1 | Read/write destination cells |
| 2 | Packed dabs |
| 3 | Tile records `(tileX, tileY, indexStart, indexCount)` |
| 4 | Ordered dab indices |
| 5 | Shared paper field |
| 6 | Shared selection field |
| 7 | 64-byte uniform block |

The backend requests a storage-buffer-per-stage limit of eight; this layout uses seven storage buffers plus a uniform. Device storage and buffer-size limits are checked when configuring material dimensions.

Before a compute pass, the full current layer buffer is copied to its alternate buffer. The pass only changes selected tiles, then buffers swap. This preserves untouched state but consumes full-grid copy bandwidth. Active tiles are therefore a compute-domain optimization, **not sparse allocation or a fully bandwidth-sparse solver**.

A surface marks impacted tiles and a halo. Its active set expands every eighth simulation step and remains monotonic until reset. Wake time is a bounded thirty simulation seconds, not thirty wall-clock seconds. There is no per-tile dry deactivation. A newly loaded field wakes the full grid; dry-all disables future stepping for that surface.

Two material buffers cost `96 × simWidth × simHeight` bytes per layer, before paper, selection, GPU compositor textures, thumbnails, readbacks, or history. At 512×512 that is 24 MiB per layer. At 1024×1024 it is 96 MiB per layer. The format's 512 MiB decoded-field budget does not cap the complete live application footprint; duplicating decoded fields into ping-pong buffers can roughly double that component.

## Scheduling and ordering

Input handling stamps immediately at the transaction boundary. The animation loop performs simulation and rendering separately, with round-robin layer selection and bounded CPU submission work between layers. GPU stepping targets roughly a 33 ms scheduling interval with two 1/60 steps; CPU stepping uses a coarser interval and a single 1/60 step. Rendering is throttled separately. A large individual layer step is not preemptible. The GPU work budget measures CPU submission time, not GPU execution time; it is not a frame-rate guarantee. Heavy scenes progress more slowly rather than running an unbounded catch-up loop.

Each user edit checkpoints the prior document. GPU `read()` submits copies synchronously before returning its asynchronous mapping promise, so the snapshot's command-queue position precedes later brush work. Application save/open/history operations use a serial transaction boundary. Shader submissions use source/destination separation; each layer's compositor uniform storage is distinct.

## Optical reconstruction

The engine uses three absorption/scattering-ratio surrogates derived from linear RGB reflectance:

```text
K/S = (1 − R)² / (2R), with input R bounded away from zero
R   = 1 / (1 + K/S + sqrt((K/S)² + 2 K/S))
alpha = 1 − exp(−1.8 · totalPigmentMass)
```

Material mixing combines mass-weighted K/S, not display RGB. This gives subtractive-style color behavior, but three RGB-derived bands are not a measured spectral representation, pigment identification, or proof of physically accurate mixtures. Named palette colors are illustrative display colors, not licensed manufacturers' measured pigment data.

The GPU compositor reconstructs material fields, shades the paper and impasto height gradient, composites visible layers through ping-pong RGBA8 textures, and presents the result. The CPU compositor uses ImageData and Canvas 2D. Six blend modes are supported. Wetness and mask overlays are diagnostic displays. Output is conventional browser-encoded raster; there is no ICC transform pipeline, HDR/16-bit export, or CMYK separation.

## Persistence and recovery

Project files and history use zero-run compression of raw float bits, not half floats or an exported image. History retains up to forty checkpoints under a nominal 192 MiB encoded-state budget, always retaining at least one undo snapshot. It is whole-document checkpoint history, not per-tile delta storage; a single large retained checkpoint can exceed the nominal budget.

Import first validates metadata and encoded bounds, then materializes all fields before replacing live surfaces. The application retains the old document through setup failures when possible. Device-loss/OOM recovery cannot be guaranteed by this strategy. See `FORMAT.md` for the untrusted-input boundary.

Autosave is one IndexedDB project slot. It is origin-scoped, storage-permission/quota dependent, and not a cloud backup or write-ahead journal. Downloading a project establishes the separate manual-save revision. Autosave does not silently waive unsaved-edit replacement warnings.
