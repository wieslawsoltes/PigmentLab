import { clamp, lerp, uid, createSelection, BLEND_MODES, MAX_LAYERS, Signal } from '@pigmentlab/core';
import { PALETTE, hexToRgb, rgbToHex, hexToKS, hsvToRgb, rgbToHsv, mixPigments } from '@pigmentlab/pigments';
import { PAPERS, createPaper } from '@pigmentlab/paper';
import { PRESETS, MEDIA, TOOLS, Stroke, mirrorDabs, validateBrush } from '@pigmentlab/brushes';
import { createBackend, CPUBackend, DEFAULT_SIMULATION, floodFill, transformSurface, importPixels } from '@pigmentlab/simulation';
import { createRenderer, exportImage, heightmap, layerThumbnail } from '@pigmentlab/renderer';
import { createLayer, layerMetadata, captureDocument, History, AutosaveStore, encodeProject, decodeProject, materializeSnapshot, download } from '@pigmentlab/document';
import { $, $$, icon, button, escapeHTML, CommandRegistry, toast, dialog, range, bindRanges, Viewport, CanvasInput } from '@pigmentlab/ui';
import { createDemo } from '@pigmentlab/demo';
const mediaIcons = { watercolor: 'drop', oil: 'oil', acrylic: 'brush', ink: 'ink', pastel: 'pencil', pencil: 'pencil', marker: 'ink', airbrush: 'wind' };
const mediaShort = { watercolor: 'Watercolor', oil: 'Oil', acrylic: 'Acrylic', ink: 'Ink', pastel: 'Pastel', pencil: 'Pencil', marker: 'Marker', airbrush: 'Airbrush' };
const utilities = [['eraser', 'erase', 'Eraser · E'], ['blend', 'blend', 'Blend · L'], ['smudge', 'brush', 'Smudge · U'], ['knife', 'knife', 'Palette knife · K'], ['water', 'water', 'Water brush · Q'], ['dryer', 'dryer', 'Dry brush · D'], ['blow', 'wind', 'Blow paint · F'], ['mask', 'mask', 'Masking fluid · C']];
const storage = { get(k, fallback = null) { try {
        return localStorage.getItem(k) ?? fallback;
    }
    catch {
        return fallback;
    } }, set(k, v) { try {
        localStorage.setItem(k, v);
    }
    catch { } } };
const titleCase = s => s[0].toUpperCase() + s.slice(1);
function menu(label, items) { return `<div class="menu-anchor"><button class="menu-trigger" aria-haspopup="menu" aria-expanded="false">${label}</button><div class="menu" role="menu" hidden>${items.map(item => item === '-' ? '<hr>' : `<button type="button" role="menuitem" data-command="${item[0]}"><span>${item[1]}</span><kbd>${item[2] || ''}</kbd></button>`).join('')}</div></div>`; }
function topRange(label, key, value, max, unit = '%', className = '') { return `<label class="top-range ${className}"><span class="range-label">${label}</span><input aria-label="${label}" data-brush-control="${key}" type="range" min="${key === 'size' ? 1 : 0}" max="${max}" value="${value}"><output data-brush-value="${key}">${value}${unit}</output></label>`; }
function shell() {
    return `<div class="studio">
<header class="topbar"><div class="brand"><span class="brand-mark">${icon('drop', 20)}</span>PigmentLab<sup>STUDIO</sup></div><nav class="menubar" aria-label="Application menu">
${menu('File', [['new', 'New painting', '⌘ N'], ['samples', 'Sample paintings'], ['open', 'Open project…', '⌘ O'], ['import', 'Import image…'], ['reference', 'Reference image…'], '-', ['save', 'Save project…', '⌘ S'], ['recover', 'Recover autosave…'], ['export', 'Export image…', '⌘ ⇧ S'], ['heightmap', 'Export heightmap…'], ['record', 'Record painting process']])}
${menu('Edit', [['undo', 'Undo', '⌘ Z'], ['redo', 'Redo', '⌘ ⇧ Z'], '-', ['clear', 'Clear selected paint', 'Delete'], ['deselect', 'Deselect', '⌘ D'], ['mask-clear', 'Remove masking fluid'], ['grayscale', 'Grayscale layer'], '-', ['brush-settings', 'Brush creator…'], ['brush-import', 'Import brush…'], ['brush-export', 'Export brush…']])}
${menu('Canvas', [['wet', 'Wet selection / layer'], ['dry', 'Dry selection / layer'], ['pause', 'Pause / resume simulation'], '-', ['transform', 'Transform layer…'], ['flip-x', 'Flip layer horizontally'], ['flip-y', 'Flip layer vertically'], ['tilt-reset', 'Level the paper']])}
${menu('View', [['fit', 'Fit painting', '0'], ['actual', 'Actual size', '1'], ['rotate-left', 'Rotate view left'], ['rotate-right', 'Rotate view right'], ['reset-view', 'Reset view'], '-', ['grid', 'Toggle grid', 'G'], ['zen', 'Focus mode', 'Tab'], ['fullscreen', 'Full screen'], ['theme', 'Light / dark theme'], ['help', 'Studio guide', '?']])}</nav><div class="grow"></div><div class="top-actions">${button('undo', 'Undo · Ctrl/Cmd+Z', 'data-command="undo"')}${button('redo', 'Redo · Ctrl/Cmd+Shift+Z', 'data-command="redo"')}<span class="v-divider desktop-only"></span><button class="button ghost desktop-only" data-command="new">${icon('plus', 15)}<span>New</span></button><button class="button ghost" data-command="open">${icon('folder', 15)}<span>Open</span></button><button class="button" data-command="save">${icon('save', 14)}<span>Save</span></button><button class="button primary" data-command="export">${icon('export', 14)}<span>Export</span></button>${button('help', 'Studio guide', 'data-command="help" class="icon-button desktop-only"')}</div></header>
<div class="optionsbar"><div class="medium-label"><button class="icon-button mobile-toggle" data-command="brush-panel" aria-label="Toggle brush panel">${icon('brush')}</button><span class="mini-brush" id="current-medium-icon">${icon('drop', 23)}</span><div><strong id="current-brush-name">Round sable</strong><small id="current-medium-name">Watercolor · natural bristles</small></div></div>${topRange('Size', 'size', 46, 240, ' px', 'size-control')}${topRange('Opacity', 'opacity', 70, 100, '%', 'opacity-control')}${topRange('Water', 'water', 72, 160, '%', 'water-control')}${topRange('Loading', 'load', 40, 100, '%', 'load-control')}<div class="grow"></div><div class="pressure-badge"><i class="pressure-dot"></i><span id="pressure-status">Pressure ready</span></div>${button('settings', 'Brush creator', 'data-command="brush-settings" class="icon-button brush-options-button"')}<button class="icon-button mobile-toggle" aria-label="Toggle color and layers panel" data-command="color-panel">${icon('layers')}</button></div>
<div class="workspace"><nav class="tools" aria-label="Painting tools"><button class="tool active" data-tool="paint" title="Paint with selected medium · B" aria-label="Paint with selected medium">${icon('brush', 19)}</button>${utilities.map(([id, ic, name]) => `<button class="tool" data-tool="${id}" title="${name}" aria-label="${name}">${icon(ic, 18)}</button>`).join('')}<div class="tool-separator"></div>${[['rect', 'select', 'Rectangle selection · S'], ['ellipse', 'circle', 'Ellipse selection'], ['lasso', 'lasso', 'Lasso selection'], ['fill', 'fill', 'Contiguous fill · V'], ['picker', 'picker', 'Color picker · H'], ['move', 'move', 'Move active layer · T'], ['hand', 'hand', 'Pan · Space']].map(([id, ic, name]) => `<button class="tool" data-tool="${id}" title="${name}" aria-label="${name}">${icon(ic, 18)}</button>`).join('')}<div class="grow"></div><button id="tool-color" class="color-chip" data-command="mix" title="Pigment mixing palette" aria-label="Pigment mixing palette"></button>${button('image', 'Reference image', 'data-command="reference"')}${button('sun', 'Switch theme', 'data-command="theme"')}</nav>
<aside class="left-panel" aria-label="Brushes and paper"><section class="panel-section"><div class="section-heading"><h2>Paint box</h2>${icon('palette', 14)}</div><div class="media-grid">${MEDIA.map(m => `<button class="medium-button ${m.id === 'watercolor' ? 'active' : ''}" data-medium="${m.id}" title="${m.name} · ${m.key}" aria-label="${m.name}">${icon(mediaIcons[m.id])}<span>${mediaShort[m.id]}</span></button>`).join('')}</div></section><section class="panel-section"><div class="section-heading"><h2 id="brush-section-title">Watercolor brushes</h2><small id="brush-count">6</small></div><div class="brush-grid" id="brush-grid"></div><button class="small-link" data-command="brush-settings">${icon('plus', 12)} Customize a brush</button></section><section class="panel-section"><div class="section-heading"><h2>Brush behavior</h2>${icon('settings', 13)}</div>${range('Softness', 'softness', 32, 0, 100)}${range('Paper grain', 'grain', 45, 0, 100)}${range('Stabilization', 'stabilizer', 18, 0, 85)}<label class="range-field"><span>Symmetry</span><select id="symmetry" aria-label="Symmetry" style="width:100%;margin-top:6px;font-size:10px"><option value="none">Off · freehand</option><option value="vertical">Vertical mirror</option><option value="horizontal">Horizontal mirror</option><option value="both">Four-way mirror</option><option value="radial">Six-fold radial</option></select></label></section><section class="panel-section"><div class="section-heading"><h2>Paper & canvas</h2>${button('settings', 'Paper properties', 'data-command="paper-settings"')}</div><div class="paper-grid" id="paper-grid"></div><p class="paper-description" id="paper-description">Cold press · Cotton · 300 gsm</p>${range('Texture depth', 'roughness', 62, 0, 100)}${range('Absorbency', 'absorption', 66, 0, 100)}</section><div class="left-footer">${icon('spark', 15)}A little pigment. Endless possibility.</div></aside>
<main class="stage" id="stage" tabindex="0" aria-label="Painting canvas. Drag to paint, use Space to pan, and the mouse wheel to zoom."><div class="document-strip"><span class="saved-dot" id="saved-dot"></span><input id="document-name" type="text" value="Quiet morning" aria-label="Painting name" maxlength="180"><small id="document-size">1200 × 900 px</small><span class="document-kind">Natural media study</span></div><div class="paper-wrap" id="paper-wrap"><canvas id="painting" width="1200" height="900" aria-label="Pigment painting surface"></canvas><svg class="art-overlay" id="art-overlay" viewBox="0 0 1200 900"></svg></div><div class="reference-card" id="reference-card" hidden><header>REFERENCE${button('close', 'Close reference', 'id="close-reference"')}</header><img id="reference-image" alt="Your reference image"></div><div class="canvas-note"><strong id="canvas-note-title">Quiet morning</strong><span id="canvas-note-detail">An editable watercolor study</span></div><div class="canvas-controls">${button('minus', 'Zoom out', 'data-command="zoom-out"')}<button class="zoom-label" id="zoom-label" data-command="actual">50%</button>${button('plus', 'Zoom in', 'data-command="zoom-in"')}<span class="v-divider"></span>${button('fit', 'Fit painting · 0', 'data-command="fit"')}${button('rotate', 'Rotate view', 'data-command="rotate-right"')}<span class="v-divider hide-mobile"></span>${button('grid', 'Toggle grid · G', 'data-command="grid"')}${button('mirror', 'Cycle symmetry', 'data-command="symmetry"')}${button('drop', 'Show wetness', 'data-command="wet-map"')}${button('record', 'Record painting process', 'data-command="record" class="icon-button hide-mobile"')}</div></main>
<aside class="right-panel" aria-label="Pigments, simulation and layers"><section class="panel-section"><div class="section-heading"><h2>Pigments</h2>${button('palette', 'Mix pigments', 'data-command="mix"')}</div><div class="color-head"><input type="color" id="color-input" value="#538caf" aria-label="Paint color"><div><div class="pigment-name" id="pigment-name">Cobalt blue</div><div class="pigment-code" id="pigment-code">PB28 · studio swatch</div></div><input class="hex-input" id="hex-input" type="text" value="#538CAF" aria-label="Hex color" maxlength="7"></div><div class="sv-square" id="sv-square" tabindex="0" role="slider" aria-label="Saturation and value; arrow keys adjust saturation and brightness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="60"><div class="sv-handle" id="sv-handle"></div></div><input class="hue-slider" type="range" min="0" max="360" value="202" id="hue-slider" aria-label="Hue"><div class="palette-grid" id="palette-grid"></div><div class="palette-label"><span>THE ESSENTIALS · 20 COLORS</span><button data-command="mix">Mix ${icon('chevron', 10)}</button></div></section>
<section class="panel-section"><div class="section-heading"><h2>Water & flow</h2><small id="sim-status">LIVE</small></div><div class="sim-actions"><button class="button" data-command="wet">${icon('water', 14)}Wet</button><button class="button" data-command="dry">${icon('dryer', 14)}Dry</button><button class="button" data-command="pause" id="pause-button">${icon('pause', 14)}Pause</button></div><div class="sim-row"><div>${range('Diffusion', 'diffusion', 68, 0, 100)}${range('Drying speed', 'evaporation', 48, 0, 100)}</div><div><div class="tilt-pad" id="tilt-pad" role="slider" aria-label="Canvas gravity. Drag to tilt, double click to reset, arrows to adjust." tabindex="0" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0"><div class="tilt-knob" id="tilt-knob"></div></div><div class="tilt-caption" id="tilt-caption">LEVEL PAPER</div></div></div><div class="wet-view-row"><label><input type="checkbox" id="wet-map-toggle"> Show wetness</label><span class="sim-live"><i class="pressure-dot"></i>Pigment mixing</span></div></section>
<section class="panel-section"><div class="section-heading"><h2>Layers</h2><small id="layer-count">3 layers</small></div><div class="layer-options"><select id="layer-blend" aria-label="Layer blend mode">${BLEND_MODES.map(m => `<option value="${m}">${titleCase(m)}</option>`).join('')}</select><span class="opacity-label">Opacity</span><input class="layer-opacity" id="layer-opacity" type="number" min="0" max="100" value="100" aria-label="Layer opacity percent"></div><div class="layer-list" id="layer-list"></div><div class="paper-layer"><div class="paper-chip" id="paper-chip"></div><div>Paper<small id="paper-layer-name">Cold press · 300 gsm</small></div></div><div class="layer-toolbar">${button('plus', 'Add layer', 'data-command="layer-add"')}${button('copy', 'Duplicate layer', 'data-command="layer-duplicate"')}${button('up', 'Move layer up', 'data-command="layer-up"')}${button('down', 'Move layer down', 'data-command="layer-down"')}${button('lock', 'Lock alpha', 'data-command="alpha-lock"')}<div class="grow"></div>${button('trash', 'Delete layer', 'data-command="layer-delete"')}</div></section><section class="panel-section"><div class="section-heading"><h2>Navigator</h2><small id="navigator-zoom">50%</small></div><div class="navigator-wrap" id="navigator-wrap"><canvas id="navigator" width="200" height="150" aria-label="Painting overview. Click to center the viewport."></canvas></div><div class="navigator-meta"><span id="navigator-size">1200 × 900 px</span><span>RGB · 8-bit export</span></div></section><section class="panel-section"><div class="section-heading"><h2>History</h2>${icon('history', 14)}</div><div class="history-list" id="history-list"><div class="history-item">Opened watercolor study</div></div></section></aside></div>
<footer class="statusbar"><span class="engine-status" id="engine-status"><i class="dot"></i>Starting renderer</span><span id="performance">Initializing</span><span class="status-coordinates" id="coordinates">X 0 · Y 0</span><span class="status-save" id="save-status">Ready to paint</span><div class="status-right"><span>Space to pan · Scroll to zoom</span><span id="sim-resolution"></span></div></footer></div><div class="brush-cursor" id="brush-cursor"></div><div class="busy-indicator" id="busy-indicator" hidden><span id="busy-message">Working…</span></div><input id="open-file" type="file" accept=".pigment" hidden><input id="image-file" type="file" accept="image/png,image/jpeg,image/webp,image/bmp,image/gif" hidden><input id="reference-file" type="file" accept="image/*" hidden><input id="brush-file" type="file" accept="application/json,.json" hidden><div id="toasts" aria-live="polite"></div>`;
}
class PigmentLab {
    constructor() { this.brush = { ...PRESETS.find(p => p.id === 'round') }; this.color = '#538caf'; this.hsv = rgbToHsv(hexToRgb(this.color)); this.tool = 'paint'; this.symmetry = 'none'; this.pendingDabs = []; this.selection = null; this.selectionDraft = null; this.grid = false; this.wetMap = false; this.showMasks = true; this.lighting = true; this.dirty = true; this.modified = false; this.busy = false; this.lastEdit = 0; this.lastSave = performance.now(); this.revision = 0; this.lastSavedRevision = 0; this.lastDownloadedRevision = 0; this.commands = new CommandRegistry(); this.autosave = new AutosaveStore(); this.customBrushes = []; this.inputActive = false; this.metrics = { frames: 0, last: performance.now(), fps: 0, simMs: 0 }; }
    get active() { return this.doc.layers.find(l => l.id === this.doc.activeId) || this.doc.layers.at(-1); }
    async initialize() {
        document.documentElement.dataset.theme = storage.get('pigmentlab-theme', 'dark');
        $('#app').innerHTML = shell();
        try {
            this.customBrushes = JSON.parse(storage.get('pigmentlab-brushes', '[]')).map(validateBrush);
        }
        catch {
            this.customBrushes = [];
        }
        const parameters = new URLSearchParams(location.search);
        this.engine = await createBackend({ preferGPU: parameters.get('backend') !== 'cpu' });
        const width = 1200, height = 900, max = this.engine.kind === 'webgpu' ? 768 : 384, ratio = max / Math.max(width, height);
        this.engine.configure(Math.round(width * ratio), Math.round(height * ratio), PAPERS[0]);
        try {
            this.renderer = await createRenderer($('#painting'), this.engine);
        }
        catch (error) {
            if (this.engine.kind !== 'webgpu')
                throw error;
            console.error(error);
            this.engine.destroy();
            const replacement = $('#painting').cloneNode();
            $('#painting').replaceWith(replacement);
            this.engine = new CPUBackend();
            this.engine.reason = error.message;
            this.engine.configure(384, 288, PAPERS[0]);
            this.renderer = await createRenderer(replacement, this.engine);
        }
        this.doc = { name: 'Quiet morning', width, height, engine: this.engine, layers: [], activeId: null, simulation: { ...DEFAULT_SIMULATION } };
        this.loadDemoFields('quiet');
        this.renderer.resize(width, height);
        this.viewport = new Viewport($('#stage'), $('#paper-wrap'), width, height);
        this.viewport.changed.subscribe(() => { const zoom = Math.round(this.viewport.zoom * 100) + '%'; $('#zoom-label').textContent = zoom; $('#navigator-zoom').textContent = zoom; this.updateCursor(); });
        this.viewport.fit();
        this.history = new History({ capture: () => { this.flushDabs(); return captureDocument(this.doc); }, restore: s => this.restore(s) });
        this.history.changed.subscribe(() => this.updateHistory());
        this.registerCommands();
        this.bindUI();
        this.updateAll();
        this.input = new CanvasInput($('#stage'), this.viewport, { begin: (p, e) => this.strokeBegin(p, e), move: (p, e) => this.strokeMove(p, e), end: (p, cancel) => this.strokeEnd(p, cancel), hover: (p, e) => this.hover(p, e), canPaint: () => !this.busy && !this.history.busy, hand: () => this.tool === 'hand' });
        this.engine.onLost = info => { this.busy = true; toast(`Graphics device lost: ${info.message || info.reason}. Reopen the app and recover its autosave.`, 'error', 15000); $('#engine-status').textContent = 'GPU disconnected · recover autosave'; };
        this.engine.onError = error => { if (!this.reportedGPUError) {
            this.reportedGPUError = true;
            toast(`Graphics error: ${error.message}`, 'error', 12000);
        } };
        this.autosave.open().catch(() => { this.storageUnavailable = true; $('#save-status').textContent = 'Use Save to keep your painting'; });
        this.running = true;
        requestAnimationFrame(t => this.frame(t));
        window.addEventListener('beforeunload', e => { if (this.modified && this.revision !== this.lastDownloadedRevision) {
            e.preventDefault();
            e.returnValue = '';
        } });
        this.ready = true;
        return this;
    }
    loadDemoFields(variant) { const demo = createDemo(this.engine.width, this.engine.height, variant); for (const l of this.doc.layers)
        l.surface.dispose(); this.doc.layers = demo.fields.map((f, i) => { const l = createLayer(this.engine, demo.layerNames[i]); l.surface.upload(f); l.surface.wake = 0; return l; }); this.doc.name = demo.name; this.doc.activeId = this.doc.layers.at(-1).id; }
    fail(error) { console.error(error); toast(error?.message || String(error), 'error', 6500); }
    async task(message, fn) { if (this.busy || this.history.busy)
        return; this.flushDabs(); this.busy = true; $('#busy-message').textContent = message; $('#busy-indicator').hidden = false; try {
        return await fn();
    }
    catch (e) {
        this.fail(e);
        return false;
    }
    finally {
        this.busy = false;
        $('#busy-indicator').hidden = true;
        this.dirty = true;
        this.updateHistory();
    } }
    changed() { this.modified = true; this.revision++; this.lastEdit = performance.now(); this.dirty = true; $('#saved-dot').style.background = 'var(--accent)'; $('#save-status').textContent = 'Unsaved changes'; }
    checkpoint(label) { this.flushDabs(); this.history.checkpoint(label); this.changed(); }
    async mutation(label, fn) { return this.task(label, async () => { this.checkpoint(label); await fn(); this.changed(); this.updateAll(); }); }
    updateAll() { this.updateBrush(); this.updateColor(); this.updatePapers(); this.updateLayers(); this.updateSimulation(); this.updateDocumentUI(); this.updateOverlay(); this.dirty = true; }
    updateDocumentUI() { const d = this.doc; $('#document-name').value = d.name; $('#document-size').textContent = `${d.width} × ${d.height} px`; $('#navigator-size').textContent = `${d.width} × ${d.height} px`; $('#canvas-note-title').textContent = d.name; $('#sim-resolution').textContent = `${this.engine.width} × ${this.engine.height} material grid`; $('#engine-status').innerHTML = `<i class="dot"></i>${this.engine.kind === 'webgpu' ? 'WebGPU · compute' : 'CPU · compatible'}`; $('#engine-status').title = this.engine.kind === 'webgpu' ? 'GPU-resident simulation and optical compositing' : this.engine.reason; $('#art-overlay').setAttribute('viewBox', `0 0 ${d.width} ${d.height}`); document.title = `${d.name} — PigmentLab`; }
    updateBrush() {
        const b = this.brush, utility = this.tool !== 'paint' && this.tool in TOOLS;
        $('#current-brush-name').textContent = utility ? `${titleCase(this.tool)} brush` : b.name;
        $('#current-medium-name').textContent = utility ? 'Natural media tool' : `${MEDIA.find(m => m.id === b.medium)?.name || b.medium} · natural bristles`;
        $('#current-medium-icon').innerHTML = icon(utility ? utilities.find(t => t[0] === this.tool)?.[1] || 'brush' : mediaIcons[b.medium], 23);
        for (const el of $$('[data-medium]'))
            el.classList.toggle('active', el.dataset.medium === b.medium && this.tool === 'paint');
        for (const el of $$('[data-tool]')) {
            el.classList.toggle('active', el.dataset.tool === this.tool);
            el.setAttribute('aria-pressed', String(el.dataset.tool === this.tool));
        }
        for (const el of $$('[data-brush-control]')) {
            const k = el.dataset.brushControl, v = Math.round(k === 'size' ? b[k] : b[k] * 100);
            el.value = v;
            $(`[data-brush-value="${k}"]`).value = v + (k === 'size' ? ' px' : '%');
        }
        for (const [k, value] of [['softness', Math.round((1 - b.hardness) * 100)], ['grain', Math.round(b.grain * 100)], ['stabilizer', Math.round(b.stabilizer * 100)]]) {
            const el = $(`[data-range="${k}"]`);
            el.value = value;
            $(`[data-output="${k}"]`).value = value;
        }
        const brushes = [...PRESETS, ...this.customBrushes].filter(p => p.medium === b.medium);
        $('#brush-section-title').textContent = `${mediaShort[b.medium] || 'Custom'} brushes`;
        $('#brush-count').textContent = brushes.length;
        $('#brush-grid').innerHTML = brushes.map((p, index) => { const stroke = p.medium === 'pencil' ? 2 : p.medium === 'ink' ? 4 : p.shape === 1 ? 12 : 9; return `<button class="brush-card ${p.id === b.id ? 'active' : ''}" data-preset="${escapeHTML(p.id)}" title="${escapeHTML(p.name)}"><svg viewBox="0 0 90 38" aria-hidden="true"><path d="M8 25C17 ${index % 2 ? 10 : 27},24 9,38 18 S60 28,79 13" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="${p.shape === 1 ? 'butt' : 'round'}" opacity="${p.opacity}" ${p.grain > .7 ? 'stroke-dasharray="1 1.5"' : ''}/><path d="M9 29C25 12 27 13 39 22S62 30 79 17" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".26"/></svg><span>${escapeHTML(p.name)}</span>${p.id === b.id ? '<i class="preset-dot"></i>' : ''}</button>`; }).join('');
        this.updateCursor();
    }
    setColor(hex) { try {
        this.color = rgbToHex(hexToRgb(hex));
        this.hsv = rgbToHsv(hexToRgb(this.color));
        this.updateColor();
    }
    catch {
        toast('Use a six-digit color, such as #538CAF.', 'error');
    } }
    updateColor() {
        const [h, s, v] = this.hsv, pigment = PALETTE.find(p => p.hex.toLowerCase() === this.color.toLowerCase());
        $('#color-input').value = this.color;
        $('#hex-input').value = this.color.toUpperCase();
        $('#tool-color').style.background = this.color;
        $('#pigment-name').textContent = pigment?.name || 'Custom mixture';
        $('#pigment-code').textContent = pigment ? `${pigment.code} · studio swatch` : 'Three-band K/S mix';
        $('#sv-square').style.background = `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent),hsl(${h * 360} 100% 50%)`;
        $('#sv-handle').style.left = s * 100 + '%';
        $('#sv-handle').style.top = (1 - v) * 100 + '%';
        $('#sv-square').setAttribute('aria-valuenow', Math.round(s * 100));
        $('#hue-slider').value = Math.round(h * 360);
        $('#palette-grid').innerHTML = PALETTE.map(p => `<button class="swatch ${p.hex.toLowerCase() === this.color.toLowerCase() ? 'active' : ''}" style="background:${p.hex}" data-color="${p.hex}" title="${escapeHTML(p.name)} · ${p.code}" aria-label="${escapeHTML(p.name)}"></button>`).join('');
    }
    updatePapers() {
        const paper = this.engine.paperSettings;
        $('#paper-grid').innerHTML = PAPERS.map(p => `<button class="paper-tile ${p.id === paper.id ? 'active' : ''}" data-paper="${p.id}" title="${p.name} · ${p.subtitle}"><canvas width="54" height="34"></canvas><span>${p.name === 'Rough cotton' ? 'Rough' : p.name === 'Linen canvas' ? 'Linen' : p.name === 'Kraft paper' ? 'Kraft' : p.name === 'Bristol board' ? 'Bristol' : p.name}</span></button>`).join('');
        for (const el of $$('[data-paper]')) {
            const p = PAPERS.find(v => v.id === el.dataset.paper), canvas = $('canvas', el), data = createPaper(canvas.width, canvas.height, p), image = new ImageData(canvas.width, canvas.height), color = hexToRgb(p.tint);
            for (let i = 0; i < canvas.width * canvas.height; i++)
                image.data.set([...color.map(v => v * (.88 + data[i * 4] * .22) * 255), 255], i * 4);
            canvas.getContext('2d').putImageData(image, 0, 0);
        }
        $('#paper-description').textContent = `${paper.name} · ${paper.subtitle}`;
        $('#paper-layer-name').textContent = paper.name;
        $('#paper-chip').style.background = paper.tint;
        for (const k of ['roughness', 'absorption']) {
            $(`[data-range="${k}"]`).value = paper[k] * 100;
            $(`[data-output="${k}"]`).value = Math.round(paper[k] * 100);
        }
    }
    updateLayers() {
        const d = this.doc;
        $('#layer-count').textContent = `${d.layers.length} layer${d.layers.length === 1 ? '' : 's'}`;
        $('#layer-blend').value = this.active.blend;
        $('#layer-opacity').value = Math.round(this.active.opacity * 100);
        $('#layer-list').innerHTML = [...d.layers].reverse().map(l => `<div class="layer-row ${l.id === d.activeId ? 'selected' : ''}" data-layer="${l.id}" draggable="true" tabindex="0" role="button" aria-label="Select layer ${escapeHTML(l.name)}"><button class="icon-button visibility" data-visibility="${l.id}" aria-label="${l.visible ? 'Hide' : 'Show'} ${escapeHTML(l.name)}">${icon(l.visible ? 'eye' : 'hidden', 14)}</button><canvas width="40" height="31" class="layer-thumb" data-thumbnail="${l.id}"></canvas><div class="layer-name">${escapeHTML(l.name)}<small>${l.alphaLock ? 'Alpha locked · ' : ''}${l.locked ? 'Locked' : titleCase(l.blend)} · ${Math.round(l.opacity * 100)}%</small></div><button class="icon-button lock-layer" data-lock="${l.id}" aria-label="${l.locked ? 'Unlock' : 'Lock'} layer">${icon(l.locked ? 'lock' : 'unlock', 12)}</button></div>`).join('');
        $$('[data-command="alpha-lock"]').forEach(el => el.classList.toggle('active', this.active.alphaLock));
        this.scheduleThumbnails();
    }
    scheduleThumbnails() { clearTimeout(this.thumbTimer); this.thumbTimer = setTimeout(() => { for (const layer of this.doc.layers) {
        const canvas = $(`[data-thumbnail="${layer.id}"]`);
        if (canvas)
            layerThumbnail(layer.surface, canvas).catch(() => { });
    } }, 180); }
    updateSimulation() { const s = this.doc.simulation; $('#sim-status').textContent = s.paused ? 'PAUSED' : 'LIVE'; $('#pause-button').innerHTML = icon(s.paused ? 'play' : 'pause', 14) + (s.paused ? 'Resume' : 'Pause'); $('#pause-button').classList.toggle('active', s.paused); for (const k of ['diffusion', 'evaporation']) {
        $(`[data-range="${k}"]`).value = s[k] * 100;
        $(`[data-output="${k}"]`).value = Math.round(s[k] * 100);
    } $('#tilt-knob').style.left = (50 + s.tiltX * 40) + '%'; $('#tilt-knob').style.top = (50 + s.tiltY * 40) + '%'; $('#tilt-caption').textContent = Math.hypot(s.tiltX, s.tiltY) < .03 ? 'LEVEL PAPER' : `TILT ${Math.round(Math.hypot(s.tiltX, s.tiltY) * 45)}°`; $('#wet-map-toggle').checked = this.wetMap; $$('[data-command="wet-map"]').forEach(el => el.classList.toggle('active', this.wetMap)); }
    updateHistory() { if (!this.history)
        return; const h = this.history; $$('[data-command="undo"]').forEach(el => el.disabled = this.busy || h.busy || !h.undoStack.length); $$('[data-command="redo"]').forEach(el => el.disabled = this.busy || h.busy || !h.redoStack.length); $('#history-list').innerHTML = `<div class="history-item">Painting opened</div>` + h.undoStack.slice(-5).map(v => `<div class="history-item">${escapeHTML(v.label)}</div>`).join(''); }
    renderOptions(extra = {}) { return { wetMap: this.wetMap, activeId: this.doc.activeId, showMasks: this.showMasks, lighting: this.lighting, ...extra }; }
    frame(time) {
        if (!this.running)
            return;
        requestAnimationFrame(t => this.frame(t));
        const gpu = this.engine.kind === 'webgpu';
        if (!this.busy && !this.history.busy) {
            this.flushDabs();
            if (!this.doc.simulation.paused && time - (this.lastSim || 0) > (gpu ? 33 : 100)) {
                const start = performance.now(), layers = this.doc.layers, budget = gpu ? 6 : 8;
                let simulated = false;
                // Round-robin submission prevents one wet layer from starving the others.
                // CPU time is bounded between layers. A single stencil remains indivisible.
                for (let visited = 0; visited < layers.length; visited++) {
                    const index = (this.simCursor || 0) % layers.length;
                    this.simCursor = index + 1;
                    const layer = layers[index];
                    if (!layer.locked && layer.surface.wake > 0) {
                        simulated = layer.surface.step(1 / 60, this.doc.simulation) || simulated;
                        if (gpu)
                            layer.surface.step(1 / 60, this.doc.simulation);
                    }
                    if (performance.now() - start >= budget)
                        break;
                }
                if (simulated) {
                    this.dirty = true;
                    this.modified = true;
                    this.revision++;
                    $('#saved-dot').style.background = 'var(--accent)';
                }
                this.metrics.simMs = performance.now() - start;
                this.lastSim = time;
            }
        }
        if (this.dirty && time - (this.lastRender || 0) > (gpu ? 15 : 60)) {
            this.renderer.render(this.doc.layers, this.renderOptions());
            this.lastRender = time;
            this.dirty = false;
            this.metrics.frames++;
            if (time - (this.lastNavigator || 0) > 500) {
                this.updateNavigator();
                this.lastNavigator = time;
            }
        }
        if (time - this.metrics.last > 1000) {
            this.metrics.fps = Math.round(this.metrics.frames * 1000 / (time - this.metrics.last));
            this.metrics.frames = 0;
            this.metrics.last = time;
            const active = this.doc.layers.reduce((v, l) => v + (l.surface.wake > 0 ? l.surface.active.size : 0), 0);
            $('#performance').textContent = active && !this.doc.simulation.paused ? `${this.metrics.fps} fps · ${active} active tiles` : 'Idle · paint to begin';
        }
        if (!this.busy && !this.inputActive && !this.saving && !this.storageUnavailable && this.modified && time - this.lastEdit > 2500 && time - this.lastSave > 18000) {
            this.autosaveNow().catch(e => { this.storageUnavailable = true; $('#save-status').textContent = 'Autosave unavailable · use Save'; console.warn(e); });
        }
    }
    flushDabs() { if (!this.pendingDabs.length)
        return; const dabs = this.pendingDabs.splice(0); const target = this.strokeLayer || this.active; if (target && !target.locked) {
        target.surface.alphaLock = target.alphaLock;
        target.surface.stamp(dabs);
        this.dirty = true;
    } }
    toSim(p) { return { ...p, x: p.x * this.engine.width / this.doc.width, y: p.y * this.engine.height / this.doc.height }; }
    strokeBegin(p, event) {
        this.inputActive = true;
        if (this.tool === 'picker' || p.alt) {
            this.pick(p);
            this.inputActive = false;
            return;
        }
        if (['rect', 'ellipse', 'lasso'].includes(this.tool)) {
            this.selectionDraft = { type: this.tool, points: [{ x: p.x, y: p.y }, { x: p.x, y: p.y }] };
            this.updateOverlay();
            return;
        }
        if (this.active.locked) {
            toast('This layer is locked. Unlock it in the Layers panel.');
            this.inputActive = false;
            return;
        }
        if (this.tool === 'move') {
            this.moveStart = p;
            return;
        }
        if (this.tool === 'fill') {
            const s = this.toSim(p);
            this.mutation('Fill region', () => floodFill(this.active.surface, s.x, s.y, hexToKS(this.color), { opacity: this.brush.opacity * 2 }));
            this.inputActive = false;
            return;
        }
        this.strokeLayer = this.active;
        const label = this.tool === 'paint' ? `${mediaShort[this.brush.medium]} · ${this.brush.name}` : titleCase(this.tool);
        this.checkpoint(label);
        const medium = this.tool === 'paint' ? this.brush.medium : this.tool, b = { ...this.brush, medium, size: this.brush.size * this.engine.width / this.doc.width };
        if (medium === 'water')
            b.water = Math.max(.7, b.water);
        if (medium === 'mask')
            b.hardness = .9;
        if (medium === 'knife') {
            b.shape = 1;
            b.aspect = .4;
            b.thickness = 1;
        }
        this.currentStroke = new Stroke(b, this.color, Math.floor(performance.now() * 100));
        this.strokeLast = p;
        if (p.shift && this.lastStrokeEnd) {
            this.pendingDabs.push(...this.currentStroke.point(this.toSim(this.lastStrokeEnd)));
            this.pendingDabs.push(...this.currentStroke.point(this.toSim(p), true));
        }
        else
            this.pendingDabs.push(...this.currentStroke.point(this.toSim(p)));
        this.pendingDabs = mirrorDabs(this.pendingDabs, this.symmetry, this.engine.width, this.engine.height);
        this.flushDabs();
    }
    strokeMove(p) {
        if (this.selectionDraft) {
            if (this.selectionDraft.type === 'lasso')
                this.selectionDraft.points.push({ x: p.x, y: p.y });
            else
                this.selectionDraft.points[1] = { x: p.x, y: p.y };
            this.updateOverlay();
            return;
        }
        if (this.moveStart) {
            this.moveEnd = p;
            this.updateOverlay();
            return;
        }
        if (!this.currentStroke)
            return;
        this.strokeLast = p;
        const dabs = this.currentStroke.point(this.toSim(p));
        this.pendingDabs.push(...mirrorDabs(dabs, this.symmetry, this.engine.width, this.engine.height));
    }
    strokeEnd(p, cancel = false) {
        this.inputActive = false;
        if (this.selectionDraft) {
            if (cancel)
                this.selectionDraft = null;
            else {
                this.selection = this.selectionDraft;
                this.selectionDraft = null;
                this.applySelection();
            }
            this.updateOverlay();
            return;
        }
        if (this.moveStart) {
            const start = this.moveStart, end = p || this.moveEnd || start;
            this.moveStart = this.moveEnd = null;
            this.updateOverlay();
            if (!cancel)
                this.mutation('Move layer', () => transformSurface(this.active.surface, { dx: (end.x - start.x) * this.engine.width / this.doc.width, dy: (end.y - start.y) * this.engine.height / this.doc.height }));
            return;
        }
        if (!this.currentStroke)
            return;
        if (p && !cancel) {
            this.pendingDabs.push(...mirrorDabs(this.currentStroke.point(this.toSim(p), true), this.symmetry, this.engine.width, this.engine.height));
            this.lastStrokeEnd = p;
        }
        this.flushDabs();
        this.currentStroke = null;
        this.strokeLayer = null;
        this.changed();
        this.scheduleThumbnails();
    }
    hover(p, e) { this.hoverPoint = { p, e: { clientX: e.clientX, clientY: e.clientY } }; $('#coordinates').textContent = `X ${Math.round(p.x)} · Y ${Math.round(p.y)}`; if (e.pointerType === 'pen')
        $('#pressure-status').textContent = `Pen ${Math.round((e.pressure || 0) * 100)}%`; this.updateCursor(); }
    updateCursor() { const cursor = $('#brush-cursor'); if (!cursor || !this.viewport || !this.hoverPoint)
        return; const { p, e } = this.hoverPoint, painting = this.tool === 'paint' || this.tool in TOOLS; if (!painting || p.x < 0 || p.y < 0 || p.x > this.doc.width || p.y > this.doc.height) {
        cursor.style.display = 'none';
        return;
    } const size = Math.max(3, this.brush.size * this.viewport.zoom); cursor.style.width = size + 'px'; cursor.style.height = size * this.brush.aspect + 'px'; cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px'; cursor.style.display = 'block'; cursor.style.borderRadius = this.brush.shape === 1 ? '2px' : '50%'; cursor.style.transform = `translate(-50%,-50%) rotate(${this.brush.angle + this.viewport.rotation}rad)`; }
    applySelection() { const s = this.selection ? { type: this.selection.type, points: this.selection.points.map(p => this.toSim(p)) } : null; this.engine.setSelection(createSelection(this.engine.width, this.engine.height, s)); this.updateOverlay(); }
    updateOverlay() {
        if (!this.doc)
            return;
        const w = this.doc.width, h = this.doc.height, parts = [];
        if (this.grid) {
            for (let x = 0; x < w; x += w / 12)
                parts.push(`<path class="grid-line" d="M${x} 0V${h}"/>`);
            for (let y = 0; y < h; y += w / 12)
                parts.push(`<path class="grid-line" d="M0 ${y}H${w}"/>`);
        }
        if (['vertical', 'both'].includes(this.symmetry))
            parts.push(`<path class="symmetry-line" d="M${w / 2} 0V${h}"/>`);
        if (['horizontal', 'both'].includes(this.symmetry))
            parts.push(`<path class="symmetry-line" d="M0 ${h / 2}H${w}"/>`);
        if (this.symmetry === 'radial')
            for (let a = 0; a < 3; a++)
                parts.push(`<path class="symmetry-line" d="M${w / 2 - Math.cos(a * Math.PI / 3) * w} ${h / 2 - Math.sin(a * Math.PI / 3) * w}L${w / 2 + Math.cos(a * Math.PI / 3) * w} ${h / 2 + Math.sin(a * Math.PI / 3) * w}"/>`);
        const selection = this.selectionDraft || this.selection;
        if (selection?.points.length) {
            const points = selection.points, first = points[0], last = points.at(-1), x = Math.min(first.x, last.x), y = Math.min(first.y, last.y), width = Math.abs(last.x - first.x), height = Math.abs(last.y - first.y);
            if (selection.type === 'rect')
                parts.push(`<rect class="selection-outline" x="${x}" y="${y}" width="${width}" height="${height}"/>`);
            else if (selection.type === 'ellipse')
                parts.push(`<ellipse class="selection-outline" cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}"/>`);
            else
                parts.push(`<path class="selection-outline" d="M${points.map(p => `${p.x},${p.y}`).join('L')}Z"/>`);
        }
        if (this.moveStart && this.moveEnd)
            parts.push(`<path class="selection-outline" d="M${this.moveStart.x} ${this.moveStart.y}L${this.moveEnd.x} ${this.moveEnd.y}"/>`);
        $('#art-overlay').innerHTML = parts.join('');
        $$('[data-command="grid"]').forEach(el => el.classList.toggle('active', this.grid));
        $$('[data-command="symmetry"]').forEach(el => el.classList.toggle('active', this.symmetry !== 'none'));
    }
    updateNavigator() { const c = $('#navigator'), ctx = c.getContext('2d'); c.height = Math.round(c.width * this.doc.height / this.doc.width); ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(this.renderer.canvas, 0, 0, c.width, c.height); }
    async pick(p) { try {
        this.flushDabs();
        this.renderer.render(this.doc.layers, this.renderOptions({ wetMap: false, showMasks: false }));
        const image = await this.renderer.pixels(), x = Math.floor(clamp(p.x, 0, image.width - 1)), y = Math.floor(clamp(p.y, 0, image.height - 1)), i = (y * image.width + x) * 4;
        this.setColor(rgbToHex([...image.data.slice(i, i + 3)].map(v => v / 255)));
        this.dirty = true;
    }
    catch (e) {
        this.fail(e);
    } }
    registerCommands() {
        const reg = (id, label, run, shortcut = '') => this.commands.register(id, { label, shortcut, enabled: () => !this.busy && !this.history.busy, run });
        reg('undo', 'Undo', () => this.task('Restoring painting…', () => this.history.undo()), 'Mod+Z');
        reg('redo', 'Redo', () => this.task('Restoring painting…', () => this.history.redo()), 'Mod+Shift+Z');
        reg('new', 'New painting', () => this.newPainting(), 'Mod+N');
        reg('samples', 'Sample paintings', () => this.chooseSample());
        reg('open', 'Open project', () => $('#open-file').click(), 'Mod+O');
        reg('import', 'Import image', () => $('#image-file').click());
        reg('reference', 'Reference image', () => $('#reference-file').click());
        reg('save', 'Save project', () => this.saveProject(), 'Mod+S');
        reg('recover', 'Recover autosave', () => this.recover());
        reg('export', 'Export image', () => this.exportPainting(), 'Mod+Shift+S');
        reg('heightmap', 'Export heightmap', () => this.task('Exporting impasto heightmap…', async () => download(await heightmap(this.active.surface), `${this.safeName()}-height.png`)));
        reg('record', 'Record painting process', () => this.toggleRecording());
        reg('wet', 'Wet layer', () => this.paintOperation('Wet paper', 2, 1));
        reg('dry', 'Dry layer', () => this.paintOperation('Dry paint', 1));
        reg('clear', 'Clear selected paint', () => this.paintOperation('Clear paint', 3), 'Delete');
        reg('mask-clear', 'Remove masking fluid', () => this.paintOperation('Remove masking fluid', 4));
        reg('grayscale', 'Grayscale layer', () => this.paintOperation('Grayscale layer', 5));
        reg('deselect', 'Deselect', () => { this.selection = this.selectionDraft = null; this.applySelection(); }, 'Mod+D');
        reg('pause', 'Pause simulation', () => { this.doc.simulation.paused = !this.doc.simulation.paused; this.updateSimulation(); this.changed(); });
        reg('tilt-reset', 'Level paper', () => { this.doc.simulation.tiltX = this.doc.simulation.tiltY = 0; this.updateSimulation(); this.changed(); });
        reg('fit', 'Fit painting', () => this.viewport.fit(), '0');
        reg('actual', 'Actual size', () => { const r = $('#stage').getBoundingClientRect(); this.viewport.zoomAt(1, r.left + r.width / 2, r.top + r.height / 2); }, '1');
        for (const [id, factor] of [['zoom-in', 1.25], ['zoom-out', .8]])
            reg(id, id, () => { const r = $('#stage').getBoundingClientRect(); this.viewport.zoomAt(this.viewport.zoom * factor, r.left + r.width / 2, r.top + r.height / 2); });
        reg('rotate-left', 'Rotate view left', () => this.viewport.rotate(this.viewport.rotation - Math.PI / 12));
        reg('rotate-right', 'Rotate view right', () => this.viewport.rotate(this.viewport.rotation + Math.PI / 12));
        reg('reset-view', 'Reset view', () => { this.viewport.rotation = 0; this.viewport.fit(); });
        reg('grid', 'Toggle grid', () => { this.grid = !this.grid; this.updateOverlay(); }, 'G');
        reg('wet-map', 'Show wetness', () => { this.wetMap = !this.wetMap; this.updateSimulation(); this.dirty = true; });
        reg('symmetry', 'Cycle symmetry', () => { const modes = ['none', 'vertical', 'horizontal', 'both', 'radial']; this.symmetry = modes[(modes.indexOf(this.symmetry) + 1) % modes.length]; $('#symmetry').value = this.symmetry; this.updateOverlay(); });
        reg('zen', 'Focus mode', () => { $('.studio').classList.toggle('zen'); setTimeout(() => this.viewport.fit(), 0); }, 'Tab');
        reg('fullscreen', 'Full screen', async () => { try {
            if (document.fullscreenElement)
                await document.exitFullscreen();
            else
                await document.documentElement.requestFullscreen();
        }
        catch {
            $('.studio').classList.add('zen');
            this.viewport.fit();
            toast('Full screen is blocked by this browser. Focus mode is enabled instead.');
        } });
        reg('theme', 'Switch theme', () => { const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme; storage.set('pigmentlab-theme', theme); });
        reg('brush-panel', 'Toggle brush panel', () => { $('.left-panel').classList.toggle('open'); $('.right-panel').classList.remove('open'); });
        reg('color-panel', 'Toggle pigment panel', () => { $('.right-panel').classList.toggle('open'); $('.left-panel').classList.remove('open'); });
        reg('brush-settings', 'Brush creator', () => this.brushSettings());
        reg('brush-import', 'Import brush', () => $('#brush-file').click());
        reg('brush-export', 'Export brush', () => download(new Blob([JSON.stringify({ ...this.brush, format: 'pigmentlab-brush', version: 1 }, null, 2)], { type: 'application/json' }), `${this.brush.name.replace(/[^a-z0-9-]+/gi, '-')}.brush.json`));
        reg('paper-settings', 'Paper properties', () => this.paperSettings());
        reg('mix', 'Pigment mixing palette', () => this.mixingPalette());
        reg('layer-add', 'Add layer', () => this.mutation('Add layer', () => { if (this.doc.layers.length >= MAX_LAYERS)
            throw new Error(`A project supports up to ${MAX_LAYERS} layers.`); const layer = createLayer(this.engine, `Paint layer ${this.doc.layers.length + 1}`); this.doc.layers.push(layer); this.doc.activeId = layer.id; }));
        reg('layer-duplicate', 'Duplicate layer', () => this.mutation('Duplicate layer', async () => { if (this.doc.layers.length >= MAX_LAYERS)
            throw new Error(`A project supports up to ${MAX_LAYERS} layers.`); const old = this.active, data = await old.surface.read(), layer = createLayer(this.engine, old.name + ' copy'); Object.assign(layer, { opacity: old.opacity, blend: old.blend, alphaLock: old.alphaLock }); layer.surface.upload(data); layer.surface.wake = old.surface.wake; const index = this.doc.layers.indexOf(old); this.doc.layers.splice(index + 1, 0, layer); this.doc.activeId = layer.id; }));
        reg('layer-delete', 'Delete layer', async () => { if (this.doc.layers.length <= 1) {
            toast('Keep at least one paint layer. Use Clear to empty it.');
            return;
        } const answer = await dialog({ title: 'Delete layer?', body: `<p>Delete <strong>${escapeHTML(this.active.name)}</strong>? This operation can be undone.</p>`, submit: 'Delete layer' }); if (answer)
            await this.mutation('Delete layer', () => { const index = this.doc.layers.indexOf(this.active), [layer] = this.doc.layers.splice(index, 1); layer.surface.dispose(); this.doc.activeId = this.doc.layers[Math.min(index, this.doc.layers.length - 1)].id; }); });
        reg('layer-up', 'Move layer up', () => this.reorderLayer(1));
        reg('layer-down', 'Move layer down', () => this.reorderLayer(-1));
        reg('alpha-lock', 'Lock alpha', () => this.mutation('Toggle alpha lock', () => { this.active.alphaLock = !this.active.alphaLock; this.active.surface.alphaLock = this.active.alphaLock; }));
        reg('transform', 'Transform layer', () => this.transformDialog());
        reg('flip-x', 'Flip layer horizontally', () => this.transformActive({ flipX: true }, 'Flip layer horizontally'));
        reg('flip-y', 'Flip layer vertically', () => this.transformActive({ flipY: true }, 'Flip layer vertically'));
        reg('help', 'Studio guide', () => this.help(), '?');
        this.commands.bind(document, e => this.fail(e));
    }
    bindUI() {
        document.addEventListener('click', e => {
            const trigger = e.target.closest('.menu-trigger');
            for (const menu of $$('.menu-anchor')) {
                const b = $('.menu-trigger', menu), panel = $('.menu', menu);
                if (b === trigger) {
                    panel.hidden = !panel.hidden;
                    b.setAttribute('aria-expanded', String(!panel.hidden));
                }
                else {
                    panel.hidden = true;
                    b.setAttribute('aria-expanded', 'false');
                }
            }
            const tool = e.target.closest('[data-tool]');
            if (tool) {
                this.tool = tool.dataset.tool;
                this.updateBrush();
            }
            const medium = e.target.closest('[data-medium]');
            if (medium) {
                this.brush = { ...PRESETS.find(p => p.medium === medium.dataset.medium) };
                this.tool = 'paint';
                this.updateBrush();
            }
            const preset = e.target.closest('[data-preset]');
            if (preset) {
                const value = [...PRESETS, ...this.customBrushes].find(p => p.id === preset.dataset.preset);
                if (value) {
                    this.brush = { ...value };
                    this.tool = 'paint';
                    this.updateBrush();
                }
            }
            const color = e.target.closest('[data-color]');
            if (color)
                this.setColor(color.dataset.color);
            const paper = e.target.closest('[data-paper]');
            if (paper)
                this.mutation('Change paper', () => { this.engine.setPaper({ ...PAPERS.find(p => p.id === paper.dataset.paper) }); });
            const visible = e.target.closest('[data-visibility]'), lock = e.target.closest('[data-lock]'), layer = e.target.closest('[data-layer]');
            if (visible)
                this.mutation('Toggle layer visibility', () => { const l = this.doc.layers.find(v => v.id === visible.dataset.visibility); l.visible = !l.visible; });
            else if (lock)
                this.mutation('Toggle layer lock', () => { const l = this.doc.layers.find(v => v.id === lock.dataset.lock); l.locked = !l.locked; });
            else if (layer) {
                // Keep row nodes stable between click and dblclick; replacing them prevents native rename gestures.
                this.doc.activeId = layer.dataset.layer;
                for (const row of $$('[data-layer]'))
                    row.classList.toggle('selected', row.dataset.layer === this.doc.activeId);
                $('#layer-blend').value = this.active.blend;
                $('#layer-opacity').value = Math.round(this.active.opacity * 100);
                $$('[data-command="alpha-lock"]').forEach(el => el.classList.toggle('active', this.active.alphaLock));
                this.dirty = true;
            }
        });
        $('#layer-list').addEventListener('dblclick', e => { const el = e.target.closest('[data-layer]'); if (el && !e.target.closest('button'))
            this.renameLayer(el.dataset.layer); });
        $('#layer-list').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.layer) {
            this.doc.activeId = e.target.dataset.layer;
            this.updateLayers();
            this.dirty = true;
        } });
        $('#layer-list').addEventListener('dragstart', e => { const el = e.target.closest('[data-layer]'); if (el) {
            e.dataTransfer.setData('application/x-pigmentlab-layer', el.dataset.layer);
            e.dataTransfer.effectAllowed = 'move';
        } });
        $('#layer-list').addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('application/x-pigmentlab-layer'))
            e.preventDefault(); });
        $('#layer-list').addEventListener('drop', e => { const id = e.dataTransfer.getData('application/x-pigmentlab-layer'), target = e.target.closest('[data-layer]'); if (id && target) {
            e.preventDefault();
            this.mutation('Reorder layers', () => { const from = this.doc.layers.findIndex(l => l.id === id), to = this.doc.layers.findIndex(l => l.id === target.dataset.layer); if (from < 0 || to < 0)
                return; const [item] = this.doc.layers.splice(from, 1); this.doc.layers.splice(to, 0, item); });
        } });
        for (const el of $$('[data-brush-control]'))
            el.addEventListener('input', () => { const k = el.dataset.brushControl; this.brush[k] = Number(el.value) / (k === 'size' ? 1 : 100); this.updateBrush(); });
        bindRanges(document, (key, value) => { if (key === 'softness')
            this.brush.hardness = 1 - value / 100;
        else if (key === 'grain')
            this.brush.grain = value / 100;
        else if (key === 'stabilizer')
            this.brush.stabilizer = value / 100;
        else if (key === 'diffusion' || key === 'evaporation') {
            this.doc.simulation[key] = value / 100;
            this.changed();
        } });
        for (const key of ['roughness', 'absorption'])
            $(`[data-range="${key}"]`).addEventListener('change', e => this.mutation(`Paper ${key}`, () => this.engine.setPaper({ ...this.engine.paperSettings, [key]: Number(e.target.value) / 100 })));
        $('#symmetry').addEventListener('change', e => { this.symmetry = e.target.value; this.updateOverlay(); });
        $('#color-input').addEventListener('input', e => this.setColor(e.target.value));
        $('#hex-input').addEventListener('change', e => this.setColor(e.target.value));
        $('#hue-slider').addEventListener('input', e => { this.hsv[0] = Number(e.target.value) / 360; this.color = rgbToHex(hsvToRgb(...this.hsv)); this.updateColor(); });
        const sv = $('#sv-square'), svPoint = e => { const r = sv.getBoundingClientRect(); this.hsv[1] = clamp((e.clientX - r.left) / r.width); this.hsv[2] = 1 - clamp((e.clientY - r.top) / r.height); this.color = rgbToHex(hsvToRgb(...this.hsv)); this.updateColor(); };
        sv.addEventListener('pointerdown', e => { sv.setPointerCapture(e.pointerId); svPoint(e); });
        sv.addEventListener('pointermove', e => { if (sv.hasPointerCapture(e.pointerId))
            svPoint(e); });
        sv.addEventListener('keydown', e => { if (!e.key.startsWith('Arrow'))
            return; e.preventDefault(); if (e.key === 'ArrowLeft')
            this.hsv[1] = clamp(this.hsv[1] - .02); if (e.key === 'ArrowRight')
            this.hsv[1] = clamp(this.hsv[1] + .02); if (e.key === 'ArrowUp')
            this.hsv[2] = clamp(this.hsv[2] + .02); if (e.key === 'ArrowDown')
            this.hsv[2] = clamp(this.hsv[2] - .02); this.color = rgbToHex(hsvToRgb(...this.hsv)); this.updateColor(); });
        const tilt = $('#tilt-pad'), tiltPoint = e => { const r = tilt.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width * .4), y = (e.clientY - r.top - r.height / 2) / (r.height * .4), len = Math.max(1, Math.hypot(x, y)); this.doc.simulation.tiltX = clamp(x / len, -1, 1); this.doc.simulation.tiltY = clamp(y / len, -1, 1); this.updateSimulation(); this.changed(); };
        tilt.addEventListener('pointerdown', e => { tilt.setPointerCapture(e.pointerId); tiltPoint(e); });
        tilt.addEventListener('pointermove', e => { if (tilt.hasPointerCapture(e.pointerId))
            tiltPoint(e); });
        tilt.addEventListener('dblclick', () => this.commands.invoke('tilt-reset'));
        tilt.addEventListener('keydown', e => { const s = this.doc.simulation; if (!e.key.startsWith('Arrow'))
            return; e.preventDefault(); if (e.key === 'ArrowLeft')
            s.tiltX = clamp(s.tiltX - .1, -1, 1); if (e.key === 'ArrowRight')
            s.tiltX = clamp(s.tiltX + .1, -1, 1); if (e.key === 'ArrowUp')
            s.tiltY = clamp(s.tiltY - .1, -1, 1); if (e.key === 'ArrowDown')
            s.tiltY = clamp(s.tiltY + .1, -1, 1); this.updateSimulation(); this.changed(); });
        $('#wet-map-toggle').addEventListener('change', e => { this.wetMap = e.target.checked; this.updateSimulation(); this.dirty = true; });
        $('#layer-blend').addEventListener('change', e => this.mutation('Layer blend mode', () => { this.active.blend = e.target.value; }));
        $('#layer-opacity').addEventListener('change', e => this.mutation('Layer opacity', () => { this.active.opacity = clamp(Number(e.target.value) / 100); }));
        $('#document-name').addEventListener('change', e => this.mutation('Rename painting', () => { this.doc.name = e.target.value.trim().slice(0, 180) || 'Untitled painting'; this.updateDocumentUI(); }));
        $('#navigator-wrap').addEventListener('pointerdown', e => { const r = $('#navigator').getBoundingClientRect(); this.viewport.centerOn(clamp((e.clientX - r.left) / r.width) * this.doc.width, clamp((e.clientY - r.top) / r.height) * this.doc.height); });
        $('#stage').addEventListener('pointerleave', () => { $('#brush-cursor').style.display = 'none'; });
        $('#open-file').addEventListener('change', e => { const file = e.target.files[0]; e.target.value = ''; if (file)
            this.openProject(file); });
        $('#image-file').addEventListener('change', e => { const file = e.target.files[0]; e.target.value = ''; if (file)
            this.importImage(file); });
        $('#reference-file').addEventListener('change', e => { const file = e.target.files[0]; e.target.value = ''; if (file)
            this.setReference(file); });
        $('#brush-file').addEventListener('change', async (e) => { const file = e.target.files[0]; e.target.value = ''; if (!file)
            return; try {
            if (file.size > 100000)
                throw new Error('Brush files must be smaller than 100 KB.');
            const b = validateBrush(JSON.parse(await file.text()));
            b.id = uid();
            this.customBrushes.push(b);
            this.brush = { ...b };
            this.tool = 'paint';
            this.persistBrushes();
            this.updateBrush();
            toast('Brush imported.', 'success');
        }
        catch (error) {
            this.fail(error);
        } });
        $('#close-reference').addEventListener('click', () => { $('#reference-card').hidden = true; if (this.referenceURL) {
            URL.revokeObjectURL(this.referenceURL);
            this.referenceURL = null;
        } });
        const stage = $('#stage');
        stage.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) {
            e.preventDefault();
            stage.classList.add('drag-over');
        } });
        stage.addEventListener('dragleave', e => { if (!stage.contains(e.relatedTarget))
            stage.classList.remove('drag-over'); });
        stage.addEventListener('drop', e => { stage.classList.remove('drag-over'); const file = e.dataTransfer.files[0]; if (!file)
            return; e.preventDefault(); if (file.name.toLowerCase().endsWith('.pigment'))
            this.openProject(file);
        else if (file.type.startsWith('image/'))
            this.importImage(file);
        else
            toast('Drop a .pigment project or a PNG, JPEG, or WebP image.'); });
        document.addEventListener('paste', e => { if (/INPUT|TEXTAREA/.test(e.target.tagName))
            return; const item = [...e.clipboardData.items].find(x => x.type.startsWith('image/')); if (item) {
            e.preventDefault();
            this.importImage(item.getAsFile());
        } });
        window.addEventListener('keydown', e => this.key(e));
        let resizeTimer;
        new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => this.viewport.fit(), 120); }).observe(stage);
    }
    key(e) {
        if ($('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.getAttribute?.('role') === 'slider')
            return;
        const key = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
        let command;
        if (mod) {
            if (key === 'z')
                command = e.shiftKey ? 'redo' : 'undo';
            else if (key === 'y')
                command = 'redo';
            else if (key === 's')
                command = e.shiftKey ? 'export' : 'save';
            else if (key === 'o')
                command = 'open';
            else if (key === 'n')
                command = 'new';
            else if (key === 'd')
                command = 'deselect';
        }
        else {
            const commands = { '0': 'fit', '1': 'actual', 'g': 'grid', '?': 'help', 'tab': 'zen', 'delete': 'clear', 'backspace': 'clear', 'escape': 'deselect', '+': 'zoom-in', '=': 'zoom-in', '-': 'zoom-out' };
            command = commands[key];
            if (key === '[' || key === ']') {
                this.brush.size = clamp(this.brush.size * (key === '[' ? .85 : 1.18), 1, 400);
                this.updateBrush();
                e.preventDefault();
                return;
            }
            const shortcuts = { b: 'paint', e: 'eraser', l: 'blend', u: 'smudge', k: 'knife', q: 'water', d: 'dryer', f: 'blow', c: 'mask', s: 'rect', v: 'fill', h: 'picker', t: 'move' };
            if (shortcuts[key]) {
                this.tool = shortcuts[key];
                this.updateBrush();
                e.preventDefault();
                return;
            }
            const media = MEDIA.find(m => m.key.toLowerCase() === key);
            if (media) {
                this.brush = { ...PRESETS.find(p => p.medium === media.id) };
                this.tool = 'paint';
                this.updateBrush();
                e.preventDefault();
                return;
            }
        }
        if (command) {
            e.preventDefault();
            this.commands.invoke(command).catch(error => this.fail(error));
        }
    }
    async reorderLayer(direction) { const index = this.doc.layers.indexOf(this.active), target = index + direction; if (target < 0 || target >= this.doc.layers.length)
        return; return this.mutation('Reorder layers', () => { const [item] = this.doc.layers.splice(index, 1); this.doc.layers.splice(target, 0, item); }); }
    async renameLayer(id) { const layer = this.doc.layers.find(l => l.id === id); if (!layer)
        return; const values = await dialog({ title: 'Rename layer', body: `<label class="form-field"><span>Layer name</span><input type="text" name="name" required maxlength="150" value="${escapeHTML(layer.name)}" autofocus></label>`, submit: 'Rename' }); if (values)
        await this.mutation('Rename layer', () => { layer.name = values.name.trim() || 'Paint layer'; }); }
    async paintOperation(label, mode, value = 1) { if (this.active.locked) {
        toast('Unlock the active layer to edit its paint.');
        return;
    } return this.mutation(label, () => this.active.surface.operate(mode, value)); }
    async transformActive(transform, label = 'Transform layer') { if (this.active.locked) {
        toast('Unlock the active layer to transform it.');
        return;
    } return this.mutation(label, () => transformSurface(this.active.surface, transform)); }
    async transformDialog() { const v = await dialog({ title: 'Transform active layer', body: `<p>Transform every material field on <strong>${escapeHTML(this.active.name)}</strong>, including water, pigment, impasto, and masking fluid. The entire layer is transformed.</p><div class="form-grid"><label class="form-field"><span>Horizontal offset (canvas px)</span><input name="dx" type="number" value="0" min="-8192" max="8192" required></label><label class="form-field"><span>Vertical offset (canvas px)</span><input name="dy" type="number" value="0" min="-8192" max="8192" required></label><label class="form-field"><span>Scale (%)</span><input name="scale" type="number" value="100" min="5" max="800" required></label><label class="form-field"><span>Rotation (degrees)</span><input name="angle" type="number" value="0" min="-360" max="360" required></label></div><p class="form-note">Material outside the canvas is cropped. Bilinear reconstruction is used; Undo restores the exact original fields.</p>`, submit: 'Transform' }); if (v)
        await this.transformActive({ dx: Number(v.dx) * this.engine.width / this.doc.width, dy: Number(v.dy) * this.engine.height / this.doc.height, scale: Number(v.scale) / 100, angle: Number(v.angle) * Math.PI / 180 }); }
    async restore(snapshot) {
        // Decode every run before allocation. Retain live surfaces until their
        // replacements exist; malformed input must never erase the current painting.
        const fields = materializeSnapshot(snapshot), d = this.doc, e = this.engine;
        const old = { width: e.width, height: e.height, paper: e.paperSettings, selection: e.selection };
        const next = [];
        try {
            e.configure(snapshot.simWidth, snapshot.simHeight, snapshot.paper);
            for (let i = 0; i < snapshot.layers.length; i++) {
                const meta = snapshot.layers[i], layer = createLayer(e, meta.name);
                next.push(layer);
                Object.assign(layer, layerMetadata(meta));
                layer.surface.upload(fields[i]);
                layer.surface.alphaLock = layer.alphaLock;
                let wet = false;
                for (let o = 3; o < fields[i].length; o += 12)
                    if (fields[i][o] > .001) {
                        wet = true;
                        break;
                    }
                layer.surface.wake = wet ? 30 : 0;
            }
            this.renderer.resize(snapshot.width, snapshot.height);
        }
        catch (error) {
            for (const layer of next)
                layer.surface.dispose();
            e.configure(old.width, old.height, old.paper);
            e.setSelection(old.selection);
            throw error;
        }
        for (const layer of d.layers)
            layer.surface.dispose();
        Object.assign(d, { name: snapshot.name, width: snapshot.width, height: snapshot.height,
            simulation: { ...DEFAULT_SIMULATION, ...snapshot.simulation }, layers: next, activeId: snapshot.activeId });
        this.selection = this.selectionDraft = null;
        e.setSelection(createSelection(e.width, e.height, null));
        this.viewport.width = d.width;
        this.viewport.height = d.height;
        this.viewport.update();
        this.changed();
        this.updateAll();
    }
    safeName() { return this.doc.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'Painting'; }
    async confirmReplace() { if (!this.modified || this.revision === this.lastDownloadedRevision)
        return true; return !!await dialog({ title: 'Replace this painting?', body: '<p>Your current painting will be replaced. Save a .pigment project first to keep a separate editable copy.</p>', submit: 'Continue' }); }
    async newPainting() {
        const values = await dialog({ title: 'A fresh sheet of paper', body: `<label class="form-field"><span>Painting name</span><input type="text" name="name" value="Untitled painting" maxlength="180" required autofocus></label><div class="form-grid"><label class="form-field"><span>Width (px)</span><input name="width" type="number" min="64" max="4096" value="1200" required></label><label class="form-field"><span>Height (px)</span><input name="height" type="number" min="64" max="4096" value="900" required></label></div><label class="form-field"><span>Paper</span><select name="paper">${PAPERS.map(p => `<option value="${p.id}">${p.name} · ${p.subtitle}</option>`).join('')}</select></label><label class="form-field"><span>Material grid · longest side</span><select name="quality">${(this.engine.kind === 'webgpu' ? [384, 512, 768, 1024] : [256, 384, 512]).map(n => `<option value="${n}" ${n === (this.engine.kind === 'webgpu' ? 768 : 384) ? 'selected' : ''}>${n} cells${n >= 1024 ? ' · more GPU memory' : ''}</option>`).join('')}</select></label><p class="form-note">The material grid controls paint detail and simulation cost. Export uses the canvas dimensions. Canvas size is not a claim of native simulation resolution.</p>`, submit: 'Create painting' });
        if (!values || !await this.confirmReplace())
            return;
        await this.task('Preparing paper…', () => { for (const l of this.doc.layers)
            l.surface.dispose(); const width = Number(values.width), height = Number(values.height), scale = Math.min(1, Number(values.quality) / Math.max(width, height)); this.engine.configure(Math.max(16, Math.round(width * scale)), Math.max(16, Math.round(height * scale)), PAPERS.find(p => p.id === values.paper)); this.doc.width = width; this.doc.height = height; this.doc.name = values.name.trim() || 'Untitled painting'; this.doc.simulation = { ...DEFAULT_SIMULATION }; const l = createLayer(this.engine, 'Paint layer 1'); this.doc.layers = [l]; this.doc.activeId = l.id; this.selection = null; this.renderer.resize(width, height); this.viewport.width = width; this.viewport.height = height; this.viewport.rotation = 0; this.viewport.fit(); this.history.clear(); this.modified = false; this.revision++; this.updateAll(); $('#canvas-note-detail').textContent = 'Your next painting starts here'; $('#save-status').textContent = 'New painting · ready'; });
    }
    async chooseSample() { const v = await dialog({ title: 'A starting point, not a flattened image', body: '<p>Explore a complete painting made from editable pigment fields. Try rewetting the shoreline, lifting color, or adding a new wash.</p><label class="form-field"><span>Studio study</span><select name="sample"><option value="quiet">Quiet morning · blue-green watercolor</option><option value="autumn">Autumn stillness · warm earth pigments</option></select></label>', submit: 'Open study' }); if (!v || !await this.confirmReplace())
        return; await this.task('Preparing watercolor study…', () => { this.loadDemoFields(v.sample); this.history.clear(); this.selection = null; this.applySelection(); this.modified = false; this.updateAll(); $('#canvas-note-detail').textContent = 'An editable watercolor study'; this.viewport.fit(); }); }
    async openProject(file) { if (!await this.confirmReplace())
        return; await this.task('Opening material fields…', async () => { const snapshot = await decodeProject(file); await this.restore(snapshot); this.history.clear(); this.modified = false; this.lastSavedRevision = this.revision; this.lastDownloadedRevision = this.revision; $('#save-status').textContent = 'Project opened'; $('#saved-dot').style.background = 'var(--green)'; this.viewport.fit(); toast('Editable painting restored.', 'success'); }); }
    async saveProject() { return this.task('Saving pigment, water, and layers…', async () => { const revision = this.revision, snapshot = await captureDocument(this.doc), blob = await encodeProject(snapshot); download(blob, `${this.safeName()}.pigment`); this.lastSavedRevision = revision; this.lastDownloadedRevision = revision; $('#save-status').textContent = 'Project downloaded'; $('#saved-dot').style.background = 'var(--green)'; toast('Editable .pigment project saved.', 'success'); }); }
    async autosaveNow() { this.saving = true; this.lastSave = performance.now(); const revision = this.revision; try {
        const snapshot = await captureDocument(this.doc), blob = await encodeProject(snapshot);
        await this.autosave.write(blob, this.doc.name);
        this.lastSavedRevision = revision;
        $('#save-status').textContent = `Saved locally · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        $('#saved-dot').style.background = 'var(--green)';
    }
    finally {
        this.saving = false;
    } }
    async recover() { let saved; try {
        saved = await this.autosave.read();
    }
    catch (error) {
        this.fail(new Error('Local browser storage is unavailable. Open a saved .pigment file instead.'));
        return;
    } if (!saved) {
        toast('There is no autosaved painting in this browser yet.');
        return;
    } const answer = await dialog({ title: 'Recover local painting', body: `<p><strong>${escapeHTML(saved.name)}</strong><br>Saved ${new Date(saved.date).toLocaleString()}.</p><p>This replaces the painting currently open in the studio.</p>`, submit: 'Recover painting' }); if (answer)
        await this.task('Recovering painting…', async () => { await this.restore(await decodeProject(saved.blob)); this.history.clear(); this.modified = false; this.lastSavedRevision = this.revision; this.viewport.fit(); toast('Autosave recovered.', 'success'); }); }
    async exportPainting() { const v = await dialog({ title: 'Export your painting', body: `<label class="form-field"><span>Format</span><select name="type"><option value="image/png">PNG · lossless image</option><option value="image/jpeg">JPEG · smaller file</option><option value="image/webp">WebP · compressed image</option></select></label><label class="form-field"><input name="transparent" type="checkbox"> Transparent background (PNG / WebP)</label><label class="form-field"><input name="lighting" type="checkbox" checked> Include impasto lighting</label><p class="form-note">${this.doc.width} × ${this.doc.height} pixels. Wetness and mask overlays are not included. Use Save for editable pigment fields and layers.</p>`, submit: 'Export image' }); if (!v)
        return; await this.task('Rendering image export…', async () => { const type = v.type, extension = type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1]; const blob = await exportImage(this.renderer, this.doc.layers, { ...this.renderOptions(), type, transparent: !!v.transparent && type !== 'image/jpeg', lighting: !!v.lighting }); download(blob, `${this.safeName()}.${extension}`); this.dirty = true; toast(`${extension.toUpperCase()} exported. Your editable painting is unchanged.`, 'success'); }); }
    async importImage(file) { if (this.doc.layers.length >= MAX_LAYERS) {
        toast('The project already has the maximum number of layers.', 'error');
        return;
    } if (file.size > 100 * 1024 * 1024) {
        toast('Image files must be smaller than 100 MiB.', 'error');
        return;
    } await this.mutation('Import image', async () => { const bitmap = await createImageBitmap(file); try {
        if (bitmap.width > 16384 || bitmap.height > 16384)
            throw new Error('The imported image is too large.');
        const canvas = document.createElement('canvas');
        canvas.width = this.engine.width;
        canvas.height = this.engine.height;
        const ctx = canvas.getContext('2d'), scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height), w = bitmap.width * scale, h = bitmap.height * scale;
        ctx.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        const layer = createLayer(this.engine, (file.name || 'Pasted image').replace(/\.[^.]+$/, '').slice(0, 150));
        await importPixels(layer.surface, ctx.getImageData(0, 0, canvas.width, canvas.height));
        this.doc.layers.push(layer);
        this.doc.activeId = layer.id;
        toast('Image imported into an editable pigment layer.', 'success');
    }
    finally {
        bitmap.close();
    } }); }
    setReference(file) { if (this.referenceURL)
        URL.revokeObjectURL(this.referenceURL); this.referenceURL = URL.createObjectURL(file); $('#reference-image').src = this.referenceURL; $('#reference-card').hidden = false; $('#reference-image').onerror = () => { toast('This reference image could not be decoded.', 'error'); $('#reference-card').hidden = true; }; }
    persistBrushes() { storage.set('pigmentlab-brushes', JSON.stringify(this.customBrushes)); }
    async brushSettings() {
        const b = this.brush;
        const values = await dialog({ title: 'Brush creator', wide: true, body: `<div class="form-grid"><label class="form-field"><span>Preset name</span><input name="name" type="text" value="${escapeHTML(b.name)}" required maxlength="80"></label><label class="form-field"><span>Medium</span><select name="medium">${MEDIA.map(m => `<option value="${m.id}" ${m.id === b.medium ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label></div><div class="form-grid">${range('Size · canvas px', 'size', b.size, 1, 400)}${range('Opacity', 'opacity', Math.round(b.opacity * 100), 0, 100)}${range('Water loading', 'water', Math.round(b.water * 100), 0, 160)}${range('Pigment loading', 'load', Math.round(b.load * 100), 1, 100)}${range('Edge hardness', 'hardness', Math.round(b.hardness * 100), 0, 98)}${range('Paper grain', 'grain', Math.round(b.grain * 100), 0, 100)}${range('Dab spacing', 'spacing', Math.round(b.spacing * 100), 4, 60)}${range('Tip aspect ratio', 'aspect', Math.round(b.aspect * 100), 10, 100)}${range('Tip angle · degrees', 'angle', Math.round(b.angle * 180 / Math.PI), -180, 180)}${range('Impasto thickness', 'thickness', Math.round(b.thickness * 100), 0, 160)}${range('Pressure response', 'pressure', Math.round(b.pressure * 100), 0, 100)}${range('Stabilization', 'stabilizer', Math.round(b.stabilizer * 100), 0, 85)}</div><label class="form-field"><span>Tip structure</span><select name="shape">${['Round', 'Flat', 'Bristle', 'Spatter'].map((s, i) => `<option value="${i}" ${i === b.shape ? 'selected' : ''}>${s}</option>`).join('')}</select></label><p class="form-note">Saved presets are reusable in the brush library and can be exported as JSON. Water affects watercolor and ink; thickness affects oil, acrylic, and the palette knife.</p>`, submit: 'Save brush preset', initialize: el => bindRanges(el) });
        if (values) {
            const preset = { ...b, id: uid(), name: values.name, medium: values.medium, shape: Number(values.shape) };
            for (const k of ['size', 'opacity', 'water', 'load', 'hardness', 'grain', 'spacing', 'aspect', 'angle', 'thickness', 'pressure', 'stabilizer'])
                preset[k] = Number(values[k]) / (k === 'size' ? 1 : k === 'angle' ? 180 / Math.PI : 100);
            this.brush = validateBrush(preset);
            this.customBrushes.push({ ...this.brush });
            this.persistBrushes();
            this.tool = 'paint';
            this.updateBrush();
            toast('Brush preset saved to your library.', 'success');
        }
    }
    async paperSettings() { const p = this.engine.paperSettings; const values = await dialog({ title: 'Paper properties', body: `<p>${escapeHTML(p.name)} · ${escapeHTML(p.subtitle)}</p><label class="form-field"><span>Paper tint</span><input type="color" name="tint" value="${p.tint}" style="height:38px;width:100%"></label>${range('Surface relief', 'roughness', Math.round(p.roughness * 100), 0, 100)}${range('Water absorbency', 'absorption', Math.round(p.absorption * 100), 0, 100)}${range('Pigment granulation', 'granulation', Math.round(this.doc.simulation.granulation * 100), 0, 100)}<p class="form-note">The surface texture participates in capillary transport and pigment deposition. These are not just display filters.</p>`, submit: 'Apply paper', initialize: el => bindRanges(el) }); if (values)
        await this.mutation('Paper properties', () => { this.engine.setPaper({ ...p, tint: values.tint, roughness: Number(values.roughness) / 100, absorption: Number(values.absorption) / 100 }); this.doc.simulation.granulation = Number(values.granulation) / 100; }); }
    async mixingPalette() { let result = this.color; const values = await dialog({ title: 'Pigment mixing palette', body: `<div class="mix-palette"><div class="mix-well"><input type="color" id="mix-a" name="a" value="${this.color}" aria-label="First pigment"></div><span>+</span><div class="mix-well"><input type="color" id="mix-b" name="b" value="#f2d753" aria-label="Second pigment"></div><span>=</span><div class="mix-result" id="mix-result"></div></div>${range('Mixing ratio', 'ratio', 50, 0, 100)}<p id="mix-hex" style="text-align:center"></p><p class="form-note">Absorption-to-scattering coefficients are mixed rather than RGB values. This is an approximate three-band Kubelka–Munk model, not measured full-spectrum pigment data.</p>`, submit: 'Use this mixture', initialize: el => { const update = () => { result = rgbToHex(mixPigments(hexToRgb($('#mix-a', el).value), hexToRgb($('#mix-b', el).value), Number($('[name="ratio"]', el).value) / 100)); $('#mix-result', el).style.background = result; $('#mix-hex', el).textContent = result.toUpperCase(); }; bindRanges(el, update); $('#mix-a', el).oninput = update; $('#mix-b', el).oninput = update; update(); } }); if (values)
        this.setColor(result); }
    async toggleRecording() {
        if (this.recorder?.state === 'recording') {
            this.recorder.stop();
            return;
        }
        if (!globalThis.MediaRecorder || !this.renderer.canvas.captureStream) {
            toast('Canvas video recording is not supported by this browser.', 'error');
            return;
        }
        try {
            const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'], mimeType = types.find(type => MediaRecorder.isTypeSupported(type));
            if (!mimeType)
                throw new Error('No supported browser video encoder was found.');
            const stream = this.renderer.canvas.captureStream(30), recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 }), chunks = [];
            this.recorder = recorder;
            recorder.ondataavailable = e => { if (e.data.size)
                chunks.push(e.data); };
            recorder.onstop = () => { for (const track of stream.getTracks())
                track.stop(); download(new Blob(chunks, { type: mimeType }), `${this.safeName()}-process.${mimeType.includes('mp4') ? 'mp4' : 'webm'}`); this.recorder = null; $$('[data-command="record"]').forEach(el => el.classList.remove('recording')); toast('Painting process video exported.', 'success'); };
            recorder.onerror = e => { for (const track of stream.getTracks())
                track.stop(); this.fail(e.error || new Error('Video recording failed.')); };
            recorder.start(1000);
            $$('[data-command="record"]').forEach(el => el.classList.add('recording'));
            toast('Recording your canvas. Press Record again to export the video.', 'success', 6000);
        }
        catch (error) {
            this.fail(error);
        }
    }
    async help() { await dialog({ title: 'Welcome to PigmentLab', wide: true, submit: 'Start painting', cancel: 'Close', body: `<p>A natural-media studio built from independent JavaScript engines. The sample is a real, layered pigment painting—not a background image. Add a fresh layer to explore it.</p><h3>A watercolor workflow</h3><p>Choose a paper and a watercolor brush. Add water with <strong>Wet</strong> or the water brush, paint into it, and watch pigment spread. Drag the tilt control to move water downhill. Use <strong>Dry</strong> to settle the pigment, or <strong>Pause</strong> to hold a wet state. <strong>Show wetness</strong> reveals water in blue.</p><h3>Paint and shape</h3><p>Oil and acrylic build an impasto height field. Pencil and pastel pick up paper grain. The blend, smudge, knife, eraser, and blow tools act on the actual material fields. Masking fluid resists brush paint and lateral flow. Selection tools constrain brush and wet/dry/fill operations. Shift-click connects to the previous stroke endpoint.</p><h3>Essential shortcuts</h3><div class="help-grid">${[['Paint', 'B'], ['Watercolor / oil', 'W / O'], ['Eraser', 'E'], ['Water / dry', 'Q / D'], ['Blend / smudge', 'L / U'], ['Mask / knife', 'C / K'], ['Selection / fill', 'S / V'], ['Picker / move', 'H / T'], ['Pan', 'Space + drag'], ['Zoom', 'Scroll'], ['Brush size', '[ / ]'], ['Fit / actual size', '0 / 1'], ['Undo', '⌘ / Ctrl Z'], ['Redo', '⌘ / Ctrl ⇧ Z'], ['Save project', '⌘ / Ctrl S'], ['Deselect', '⌘ / Ctrl D'], ['Grid / focus mode', 'G / Tab'], ['Layer rename', 'Double-click']].map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div><h3>Keep your painting editable</h3><p><strong>Save</strong> creates a .pigment file with all layers, pigment, water, saturation, masking fluid, and height fields. PNG, JPEG, and WebP exports flatten the visible painting. Browser autosave is a recovery aid, not a substitute for downloading your project.</p><h3>Touch and pen</h3><p>One finger paints. Two fingers pan, zoom, and rotate. Pen pressure and tilt affect the brush; coalesced pointer samples preserve fine motion. Touch hardware and driver behavior vary by device.</p><h3>Engine boundaries</h3><p>The model uses three-band pigment absorption/scattering, a conservative mobile-pigment transport stencil, and procedural paper. It is an original approximation, not Rebelle’s proprietary DropEngine, spectral dataset, NanoPixel, or RealShader. The material grid is separate from export resolution. The CPU compatibility backend favors smaller grids. Transforms and image imports are reconstructed at material-grid resolution.</p><p class="form-note">PigmentLab 1.0 · Independent software · No external assets, analytics, accounts, or paid APIs. All painting stays in your browser.</p>` }); }
    getState() { return { ready: this.ready, backend: this.engine.kind, name: this.doc.name, width: this.doc.width, height: this.doc.height, simulationWidth: this.engine.width, simulationHeight: this.engine.height, layers: this.doc.layers.map(({ id, name, visible, locked, alphaLock, opacity, blend }) => ({ id, name, visible, locked, alphaLock, opacity, blend })), activeId: this.doc.activeId, brush: { ...this.brush }, tool: this.tool, color: this.color, selection: this.selection, simulation: { ...this.doc.simulation }, history: { undo: this.history.undoStack.length, redo: this.history.redoStack.length, bytes: this.history.bytes }, view: { zoom: this.viewport.zoom, rotation: this.viewport.rotation, panX: this.viewport.panX, panY: this.viewport.panY }, modified: this.modified, busy: this.busy, metrics: { ...this.metrics }, gpuErrors: this.engine.errors || [] }; }
}
const app = new PigmentLab();
window.PigmentLab = { version: '1.0.0', app, ready: app.initialize(), getState: () => app.getState(), commands: () => app.commands.list(), invoke: (id, args) => app.commands.invoke(id, args) };
window.PigmentLab.ready.catch(error => { console.error(error); $('#app').innerHTML = `<div class="boot"><div class="boot-logo">P</div><h1>PigmentLab</h1><p>The studio could not start.</p><p>${escapeHTML(error.message)}</p><p>Serve the source over localhost, or open the bundled PigmentLab.html file.</p></div>`; });
