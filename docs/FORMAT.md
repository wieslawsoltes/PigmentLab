# `.pigment` project format, version 1

MIME type: `application/x-pigmentlab`. All integer file fields are little-endian. There is no encryption, checksum, external resource reference, embedded script, or compatibility with `.reb`/PSD files.

## Container

| Offset | Size | Meaning |
|---|---|---|
| 0 | 8 bytes | ASCII `PGLAB001` |
| 8 | 4 bytes | Unsigned manifest byte length |
| 12 | Variable | UTF-8 JSON manifest |
| 12 + manifest bytes | Variable | Concatenated per-layer compressed fields in layer order |

The JSON manifest contains:

```json
{
  "version": 1,
  "name": "Untitled painting",
  "width": 1024,
  "height": 768,
  "simWidth": 256,
  "simHeight": 192,
  "paper": {
    "id": "cold", "name": "Cold press", "subtitle": "Procedural paper",
    "tint": "#f5f0e6", "roughness": 0.6, "absorption": 0.5, "scale": 1
  },
  "activeId": "paint-1",
  "simulation": {
    "evaporation": 0.48, "diffusion": 0.68, "granulation": 0.6,
    "tiltX": 0, "tiltY": 0, "paused": false
  },
  "layers": [{
    "id": "paint-1", "name": "Paint", "visible": true,
    "locked": false, "alphaLock": false, "opacity": 1, "blend": "normal"
  }],
  "fieldLengths": [1234]
}
```

The `fieldLengths` example is illustrative; each real value is the **encoded 32-bit word count**, not bytes or decoded float count. Each layer decodes to exactly `simWidth × simHeight × 12` IEEE-754 float32 values in row-major cell order. The twelve channel meanings are documented in `ARCHITECTURE.md`.

## Zero-run codec

The codec reinterprets float32 bits as uint32 without quantization. A run begins with a uint32 token. Bit 31 distinguishes the run type; bits 0–30 are the run length.

- Bit 31 set: output that many zero-bit float words. There is no payload.
- Bit 31 clear: copy that many following literal uint32 words into the output.

Zero runs are emitted for at least three consecutive all-zero words; shorter runs remain literals. Negative zero is a literal with bits `0x80000000`, so signed zero round-trips exactly. Tokens have nonzero lengths. Runs cannot overflow the target field, and literal payloads cannot run beyond the encoded input. Decoding requires exactly the declared field length and rejects trailing container bytes.

The encoder uses a typed-array allocation bounded by `N + 1` words for `N` input words. Compression is particularly effective for untouched cells; dense paintings may be near raw size. This is not a general image compressor.

## Validation boundary

`decodeProject(blob)` validates the container, manifest, field lengths, dimensions, and whitelisted metadata and returns a compressed snapshot. `materializeSnapshot(snapshot)` invokes `unpackFloats()` to validate and allocate decoded material. **Call both before trusting imported fields.** The app does so before restoring live surfaces.

Current checks include:

- File at least 12 bytes and at most 512 MiB; JSON manifest at most 1 MiB.
- Canvas dimensions 32–8192; material dimensions 16–1536, integers only.
- One to twelve layers; aggregate raw decoded fields at most 512 MiB.
- Exact field count, bounded run lengths, complete payloads, no trailing bytes.
- Finite, nonnegative decoded material values. This is not a physically calibrated upper-bound check.
- Layer IDs limited to 1–100 ASCII letters/digits/underscore/hyphen, with uniqueness enforced; bounded names; known blend modes; finite opacity in `[0,1]`; actual boolean flags.
- Known paper substrate IDs and valid tint/roughness/absorption/scale; finite bounded simulation parameters and a boolean pause state.
- Whitelisted object reconstruction before DOM/layer assignment. Unknown serialized members cannot overwrite live surface objects.

If the active layer ID is not present it is normalized to the last layer. Unknown format versions are rejected. Decompression and material allocation can still consume substantial memory below the validation ceiling, especially with two live simulation buffers and history. Treat the limits as defensive bounds, not a guarantee every valid file fits every device.

## What is and is not saved

Saved: all twelve state channels for every layer, order, visibility, locking, alpha lock, opacity/blend mode, active layer, project and grid dimensions, paper parameters, and simulation settings.

Not saved: undo stack, viewport pan/zoom/rotation, active brush, local custom-preset collection, current selection, pinned raster reference, UI theme, recording session, pointer stroke events, or active-tile scheduling metadata. Resist masks **are** material state and are saved. Selection masks are transient editing state and are not.

Paper is regenerated from parameters with the current fixed deterministic seed. No independent paper bitmap or user paper asset is embedded.

## Minimal decode

```js
import { decodeProject, materializeSnapshot } from '@pigmentlab/document';
const snapshot = await decodeProject(blob);
const fields = materializeSnapshot(snapshot);
// fields[i] is an independent Float32Array for snapshot.layers[i].
```

Snapshots used by history have the same compressed fields and metadata but are ordinary in-memory objects rather than the binary container. History checkpoints preserve material bits; later resumed simulation can change the restored state again, so equality tests pause simulation before comparison.
