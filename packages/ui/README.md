# @pigmentlab/ui

Original SVG icons, DOM helpers, command registry, dialogs, range controls, viewport math, pen/touch canvas input and the studio theme stylesheet.

## Consumption

This is a standalone MIT-licensed ES module. Import it by package name after linking the repository workspaces or installing all delivered local package tarballs. The unbundled browser application uses an import map; no third-party runtime dependencies or application globals are required.

```js
import * as Ui from '@pigmentlab/ui';
```

Dependencies: `@pigmentlab/core`

## Public exports

`escapeHTML`, `icon`, `button`, `CommandRegistry`, `toast`, `dialog`, `range`, `bindRanges`, `Viewport`, `CanvasInput`.

The stylesheet is exported as `@pigmentlab/ui/style.css`. It includes global theme/reset rules for the studio DOM. Raw markup helper parameters require trusted HTML; escape external plain text with `escapeHTML()`.

See `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/FORMAT.md`, and `docs/TEST_REPORT.md` in the source distribution for contracts, layouts, limitations, examples, and validation evidence. `examples/headless.mjs` and `examples/minimal-paint.html` consume these packages independently of the studio.
