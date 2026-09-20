# GitHub delivery and Pages deployment

## Published endpoints

- Studio: https://wieslawsoltes.github.io/PigmentLab/
- Self-contained HTML: https://wieslawsoltes.github.io/PigmentLab/PigmentLab.html
- Independent package composition: https://wieslawsoltes.github.io/PigmentLab/examples/minimal-paint.html
- Adapter-backed GPU diagnostics: https://wieslawsoltes.github.io/PigmentLab/tests/gpu-smoke.html
- Deployment identity: https://wieslawsoltes.github.io/PigmentLab/build.json

## Automatic publishing

`.github/workflows/pages.yml` runs on pushes to `main` and manual workflow dispatch. It installs only the local workspaces using npm offline, checks source syntax, runs the 42 Node tests, rebuilds the standalone studio, and uploads a GitHub Pages artifact. The deployment job has only the Pages write and OIDC permissions required for deployment.

The published artifact contains the built studio, all nine package source trees, examples, documentation, diagnostics, npm package downloads, and a `build.json` recording the deployed commit. All paths are relative to the project site, including the import maps in the independent example and GPU diagnostics. No npm token or backend secret is required to publish this static application.

After deployment, the workflow checks the public studio, example and diagnostic endpoints and compares the live build identity with the workflow commit.

`.github/workflows/ci.yml` independently runs the Node/build validation and full CPU Chromium integration suite on pushes and pull requests. Browser evidence is uploaded even when browser validation fails. CPU fallback does not imply GPU validation.

## Import validation and provenance

The [initial GitHub import run](https://github.com/wieslawsoltes/PigmentLab/actions/runs/35508237025) successfully restored the hash-verified source delivery, ran all 42 Node tests and 54 studio browser checks, checked the independent browser example, installed and imported all nine npm tarballs in an independent consumer, and committed the complete workspace directly to `main`.

All original delivery manifest paths were checked for existence before the import commit. Original UTF-8 implementation files were restored byte-for-byte; the CI configuration was adapted for repository publishing. The standalone distribution, npm tarballs, editable sample projects, and browser screenshots/video were regenerated on GitHub Actions from that source rather than copied byte-for-byte from the initial ZIP. Thus generated binary hashes can differ from the initial download while the corresponding functionality and paths remain present.

- `docs/ORIGINAL_RELEASE_MANIFEST.json` is the preserved original delivery manifest.
- `docs/SOURCE_IMPORT.json` records source hashes and the initial archive hash.
- `release-manifest.json` records the imported workspace snapshot and fresh validation reports. It is an import/release snapshot, not an assertion that later repository metadata edits retain identical hashes.
- `artifacts/browser-tests.json` and `artifacts/examples-tests.json` are fresh GitHub-run reports.
- `docs/TEST_REPORT.md` preserves the original local validation narrative. Its initial statement that GitHub Actions had not run is superseded by the successful linked GitHub run.

The temporary importer and encoded transport parts were removed after successful import. The regular repository is an ordinary readable ESM workspace; no restore step is needed to use or build it.

## Hardware boundaries

The automated browser checks use the real CPU engine. No actual WebGPU adapter execution is claimed by the import or deployment checks. Open the published GPU diagnostic page on a supported adapter to run pipeline compilation and numerical parity checks. Unsupported environments report `SKIPPED` rather than a successful GPU test.
