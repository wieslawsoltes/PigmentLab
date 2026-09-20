# Delivery validation report

This report distinguishes executable CPU verification from source checks and unexecuted hardware-dependent paths. No WebGPU pass is inferred from successful CPU fallback.

## Results

| Check | Result | Evidence |
|---|---|---|
| Authored JavaScript syntax | PASS | `npm run check` scans app, packages, scripts, tests and Node example |
| Node engine and WGSL-source tests | **42 passed, 0 failed** | `artifacts/unit-tests.txt` |
| Chromium studio integration | **54 passed, 0 failed** | `artifacts/browser-tests.json`, `artifacts/browser-run.txt` |
| Standalone build | PASS | `npm run build`; `node --check dist/pigmentlab.js` |
| Independent browser example | PASS, nine packages and no studio loaded | `artifacts/examples-tests.json` |
| Independent npm consumption | PASS, all nine tarballs installed outside the workspace | `artifacts/package-consumer.json`, `artifacts/package-pack.json` |
| Headless project generation and decoding | PASS | `examples/Headless-study.pigment`, `artifacts/package-consumer.json` |
| GPU harness unsupported-context reporting | PASS: correctly reports SKIPPED | `artifacts/examples-tests.json` |
| Real GPU compute/render execution | **NOT VERIFIED — no exposed adapter** | Harness records `SKIPPED`, with zero GPU checks executed |
| Prepared GitHub Actions | Not executed on GitHub in this delivery | `.github/workflows/ci.yml` |

## Test environment and execution

The browser tests ran in Chromium 144.0.7559.96 on Linux, using Python Playwright and an inline about:blank document containing the complete built HTML. This environment blocks normal browser navigations and does not expose WebGPU to that inline document. The suite did not change browser policies. Mouse input, HTML dialogs, file chooser injection, downloads, canvas image encoding, and MediaRecorder were exercised in the browser. Tests executed the actual CPU engine and studio code, not DOM-only stubs.

Node version: v22.16.0. The source application and bundler have no third-party runtime dependencies. The optional browser test runner requires Playwright and a browser installation.

```sh
npm install --offline --ignore-scripts
npm run check
npm test
npm run build
node --check dist/pigmentlab.js
node examples/headless.mjs examples/Headless-study.pigment
python tests/browser_test.py --inline --chromium /usr/bin/chromium
python tests/examples_test.py --chromium /usr/bin/chromium
```

Omit `--chromium` to use Playwright's installed Chromium instead. To run the main browser suite against a normally served application, use `--url http://localhost:4173/dist/` without `--inline`; device/backend behavior then depends on the browser environment. The main suite is designed around exact CPU field comparisons. Use the dedicated adapter-backed suite for GPU validation and floating-point tolerances.

## Covered browser workflows

The 54 studio checks below are copied from the machine-readable passing result, not an inferred feature inventory.

1. Application boot and three editable sample layers.
2. Nine independent package exports are present.
3. Sample pigment fields are nonzero and finite.
4. Light theme switches at runtime.
5. Mobile layout does not overflow horizontally.
6. Mobile brush drawer opens.
7. Mobile pigment drawer opens exclusively.
8. New-document dialog creates requested editable dimensions.
9. Simulation pause toggles.
10. Real mouse input deposits wet pigment.
11. Undo restores exact empty fields.
12. Redo restores exact IEEE-754 fields.
13. Dry transfers pigment without deleting it.
14. Wet adds water to material fields.
15. Eraser removes actual material.
16. Masking fluid writes the resist channel.
17. Remove masking fluid clears resist channel.
18. Rectangle selection is rasterized.
19. Selection rejects paint outside its bounds.
20. Selection permits paint inside its bounds.
21. Deselect restores full editing area.
22. Oil brush creates impasto.
23. Double horizontal flip preserves exact material state.
24. Duplicate layer copies all material channels.
25. Native double-click layer rename works.
26. Layer ordering is editable.
27. Layer visibility toggles.
28. Layer opacity applies.
29. Layer blend mode applies.
30. Locked layer rejects brush input.
31. Alpha lock rejects paint on transparent cells.
32. Contiguous fill adds material to a blank layer.
33. Fill participates in document undo.
34. Brush creator adds a reusable preset.
35. Pigment-mixing palette selects its computed mixture.
36. Paper properties affect the engine substrate.
37. Browser project serialization is bit-exact across all layers.
38. Saved project reopens with editable fields.
39. PNG, JPEG, and WebP exports decode at requested canvas resolution.
40. Heightmap exports a material-resolution PNG.
41. Raster image import creates a pigment layer.
42. Layer deletion applies through confirmation.
43. Undo restores deleted layer and data.
44. Save button downloads an editable .pigment file.
45. File picker restores a downloaded project.
46. Export dialog downloads a real PNG.
47. Reference image loads into the pinned panel.
48. Reference panel can be closed.
49. Brush JSON export/import preserves the editable preset.
50. Canvas rotation changes only the view.
51. Keyboard tool shortcuts dispatch.
52. Painting process records to a nonempty browser-encoded video.
53. No unhandled JavaScript exceptions.
54. No unexpected browser console errors.

## Independent example

`tests/examples_test.py` removes the app and demo modules from the bundled closures, then composes the nine packages with the authored minimal browser example. It verifies that no `window.PigmentLab` studio exists; performs real pointer painting; confirms material is deposited; runs dry/clear controls; and confirms the GPU harness reports its actual status. This exercises package composition independently of the studio, although the browser input is inline rather than a navigated import-map page.

The headless Node example writes an editable one-layer 256×192 material grid with a 1024×768 canvas. A separate consumer installed every delivered `.tgz` using npm offline, imported their public APIs, deposited pigment, and decoded that example file. Package archives were not published to a registry.

## GPU verification provided but not run

Serve the repository and open:

```text
http://localhost:4173/tests/gpu-smoke.html
```

The harness explicitly requests a GPU device instead of accepting a CPU fallback. It compiles all material compute pipelines and all optical compositor pipelines, compares seventeen tool paths and five material operations to the CPU oracle, compares one hundred transport steps, exercises six blend modes, and checks for uncaptured GPU validation errors. The current tolerances are scaled absolute error `abs(gpu−cpu)/(1+abs(cpu)) ≤ 0.002` for tool/operation results and `≤ 0.005` after transport. These tolerances are test criteria, not a measured error guarantee until the suite runs.

Static WGSL checks in Node reject reserved-word identifiers, verify the shared three-vec4 cell layout, and check workgroup declarations and separate source/destination bindings. They do **not** validate all WGSL typing, uniformity, resource limits, shader compilation, numerical parity, rendering output, device loss, or performance.

## Other unverified boundaries

Physical pen pressure/tilt delivery, palm rejection, two-finger interaction on actual devices, Safari/Firefox behavior, persistent-origin IndexedDB autosave/recovery, fullscreen permissions, maximum-size scenes, long sessions and memory pressure, context/device loss, GPU driver variance, touch latency, frame-rate targets, and a full keyboard/screen-reader accessibility audit were not established by these tests. A tiny process-video recording proves browser encoding/download functionality, not a long-session recording endurance benchmark.

The screens in `artifacts/desktop-dark.png`, `desktop-light.png`, and `mobile.png` are real application screenshots. `integration-roundtrip.pigment`, `integration-export.png`, `integration.brush.json`, and `integration-process.webm` were produced by actual integration-test workflows; these small artifacts are evidence, not comprehensive sample asset libraries.
