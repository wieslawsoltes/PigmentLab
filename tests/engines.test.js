import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, hash, rng, ActiveTiles, binDabs, createSelection, polygonContains } from '@pigmentlab/core';
import { rgbToKS, ksToRgb, hexToRgb, hexToKS, mixPigments, PALETTE, cellColor, rgbToHsv, hsvToRgb } from '@pigmentlab/pigments';
import { PAPERS, createPaper } from '@pigmentlab/paper';
import { Stroke, PRESETS, mirrorDabs, packDabs, validateBrush } from '@pigmentlab/brushes';
import { CPUBackend, stampCPU, stepCPU, DEFAULT_SIMULATION, transformSurface, floodFill, importPixels } from '@pigmentlab/simulation';
import { packFloats, unpackFloats, createLayer, captureDocument, encodeProject, decodeProject, materializeSnapshot, History } from '@pigmentlab/document';
import { Viewport, CommandRegistry } from '@pigmentlab/ui';
import { createDemo } from '../app/demo.js';
function backend(w = 32, h = 32) { const e = new CPUBackend(); e.configure(w, h, PAPERS[0]); return e; }
function dab(overrides = {}) { return { x: 16, y: 16, radius: 7, aspect: 1, ks: hexToKS('#435d92'), load: .5, water: .8, opacity: .8, hardness: .7, grain: .4, angle: 0, tool: 0, seed: 10, pressure: .7, dx: 2, dy: 1, thickness: .8, shape: 0, ...overrides }; }
const sum = (data, channels) => { let v = 0; for (let i = 0; i < data.length; i += 12)
    for (const c of channels)
        v += data[i + c]; return v; };
const close = (a, b, tol = 1e-5) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tolerance ${tol})`);
test('integer noise and PRNG are deterministic and bounded', () => { const a = rng(73), b = rng(73); for (let i = 0; i < 1000; i++) {
    assert.equal(a(), b());
    const v = hash(i, i * 3, 37);
    assert.ok(v >= 0 && v <= 1);
} });
test('tile activation clips boundaries and expands a halo', () => { const t = new ActiveTiles(65, 65); t.mark(-5, -5, 8, 8); assert.equal(t.size, 1); t.expand(); assert.equal(t.size, 4); t.all(); assert.equal(t.size, 9); t.clear(); assert.equal(t.size, 0); });
test('dab binning preserves order and covers rotated brush bounds', () => { const b = binDabs([dab({ x: 30, y: 30, radius: 10 }), dab({ x: 33, y: 34, radius: 5 })], 64, 64); assert.equal(b.tiles.length, 16); for (let t = 0; t < b.tiles.length; t += 4) {
    const values = b.ids.slice(b.tiles[t + 2], b.tiles[t + 2] + b.tiles[t + 3]);
    assert.deepEqual([...values], [0, 1]);
} });
test('rectangle, ellipse and polygon selections rasterize correctly', () => { const points = [{ x: 8, y: 8 }, { x: 24, y: 24 }], rect = createSelection(32, 32, { type: 'rect', points }), ellipse = createSelection(32, 32, { type: 'ellipse', points }); assert.equal(rect.reduce((s, v) => s + v, 0), 256); assert.ok(ellipse.reduce((s, v) => s + v, 0) < 256); assert.equal(ellipse[16 * 32 + 16], 1); assert.ok(polygonContains(10, 10, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }])); assert.equal(createSelection(32, 32, null).reduce((s, v) => s + v, 0), 1024); });
test('K/S conversion reconstructs studio swatch RGB values', () => { for (const p of PALETTE) {
    const rgb = hexToRgb(p.hex), out = ksToRgb(rgbToKS(rgb));
    for (let i = 0; i < 3; i++)
        close(out[i], rgb[i], 1e-6);
} });
test('pigment mixing is symmetric and differs from additive RGB blending', () => { const a = hexToRgb('#435d92'), b = hexToRgb('#f2d753'), x = mixPigments(a, b, .32), y = mixPigments(b, a, .68); for (let i = 0; i < 3; i++)
    close(x[i], y[i]); assert.ok(x.some((v, i) => Math.abs(v - (a[i] * .68 + b[i] * .32)) > .05)); });
test('HSV conversions retain hue and brightness', () => { for (const p of PALETTE) {
    const a = hexToRgb(p.hex), b = hsvToRgb(...rgbToHsv(a));
    a.forEach((v, i) => close(v, b[i]));
} });
test('all paper presets are deterministic and finite', () => { for (const p of PAPERS) {
    const a = createPaper(17, 19, p), b = createPaper(17, 19, p);
    assert.deepEqual(a, b);
    for (let i = 0; i < a.length; i++)
        assert.ok(Number.isFinite(a[i]) && a[i] >= 0 && a[i] <= 1);
} });
test('stroke resampling is invariant to event rate on a straight unfiltered stroke', () => { const brush = { ...PRESETS[1], size: 20, spacing: .2, stabilizer: 0, jitter: 0 }, a = new Stroke(brush, '#435d92', 10), b = new Stroke(brush, '#435d92', 10); const p = { x: 0, y: 10, pressure: .7 }, x = a.point(p).concat(a.point({ ...p, x: 100 })), y = b.point(p); for (let i = 1; i <= 100; i++)
    y.push(...b.point({ ...p, x: i })); assert.equal(x.length, y.length); x.forEach((v, i) => { close(v.x, y[i].x); close(v.radius, y[i].radius); assert.equal(v.seed, y[i].seed); }); });
test('radial symmetry emits six copies and reflects stroke motion', () => { const d = dab({ x: 10, y: 12, dx: 2 }), out = mirrorDabs([d], 'vertical', 32, 32); assert.equal(out.length, 2); assert.equal(out[1].x, 22); assert.equal(out[1].dx, -2); assert.equal(mirrorDabs([d], 'radial', 32, 32).length, 6); assert.equal(packDabs([d]).length, 20); });
test('brush preset validation rejects non-finite input', () => { assert.throws(() => validateBrush({ ...PRESETS[0], size: NaN })); assert.throws(() => validateBrush({ medium: 'unrecognized' })); assert.equal(validateBrush({ ...PRESETS[0], size: 900 }).size, 400); });
test('watercolor stamping creates distinct water and mobile pigment fields', () => { const e = backend(), s = e.createSurface(); s.stamp([dab()]); assert.ok(sum(s.data, [8]) > 0); assert.ok(sum(s.data, [3]) > 0); assert.equal(sum(s.data, [9]), 0); assert.equal(sum(s.data, [7]), 0); });
test('oil stamping creates deposited pigment and impasto without water', () => { const e = backend(), s = e.createSurface(); s.stamp([dab({ tool: 1, water: 0 })]); assert.ok(sum(s.data, [9]) > 0); assert.ok(sum(s.data, [7]) > 0); assert.equal(sum(s.data, [8]), 0); assert.equal(sum(s.data, [3]), 0); });
test('selection and masking fluid resist brush deposition', () => { const e = backend(), s = e.createSurface(); e.selection.fill(0); s.stamp([dab()]); assert.equal(sum(s.data, [8, 9]), 0); e.selection.fill(1); for (let i = 11; i < s.data.length; i += 12)
    s.data[i] = 1; s.stamp([dab()]); assert.equal(sum(s.data, [8, 9]), 0); });
test('alpha lock prevents pigment on an empty layer', () => { const e = backend(), s = e.createSurface(); s.alphaLock = true; s.stamp([dab()]); assert.equal(sum(s.data, [8, 9]), 0); });
test('eraser removes pigment mass', () => { const s = backend().createSurface(); s.stamp([dab()]); const before = sum(s.data, [8, 9]); s.stamp([dab({ tool: 8, opacity: 1 })]); assert.ok(sum(s.data, [8, 9]) < before); });
test('dry operation preserves pigment while removing surface water', () => { const s = backend().createSurface(); s.stamp([dab()]); const mass = sum(s.data, [8, 9]); s.operate(1); close(sum(s.data, [8, 9]), mass, 1e-5); assert.equal(sum(s.data, [8]), 0); assert.equal(sum(s.data, [3]), 0); });
test('transport + deposition conserve total pigment over 100 steps', () => { const e = backend(), s = e.createSurface(); s.stamp([dab(), dab({ x: 20, y: 20, ks: hexToKS('#b34462') })]); const mass = sum(s.data, [8, 9]), channels = [0, 1, 2].map(k => sum(s.data, [k, k + 4])); const settings = { ...DEFAULT_SIMULATION, tiltX: .3, tiltY: .2 }; for (let i = 0; i < 100; i++)
    s.step(1 / 60, settings); close(sum(s.data, [8, 9]), mass, 2e-5); channels.forEach((v, k) => close(sum(s.data, [k, k + 4]), v, 5e-4)); for (const f of s.data)
    assert.ok(Number.isFinite(f) && f >= 0); });
test('dry watercolor can be rewetted', () => { const e = backend(), s = e.createSurface(); s.stamp([dab()]); s.operate(1); s.operate(2); assert.equal(sum(s.data, [8]), 0); s.step(1 / 60, DEFAULT_SIMULATION); assert.ok(sum(s.data, [8]) > 0); });
test('mask blocks lateral pigment transport', () => { const e = backend(), s = e.createSurface(); s.stamp([dab({ x: 12, y: 16, radius: 4 })]); for (let y = 0; y < 32; y++)
    s.data[(y * 32 + 17) * 12 + 11] = 1; for (let n = 0; n < 50; n++)
    s.step(1 / 60, { ...DEFAULT_SIMULATION, tiltX: 1 }); let beyond = 0; for (let y = 0; y < 32; y++)
    for (let x = 18; x < 32; x++)
        beyond += s.data[(y * 32 + x) * 12 + 8]; assert.equal(beyond, 0); });
test('all 17 brush tool kernels preserve finite non-negative state', () => { for (let tool = 0; tool <= 16; tool++) {
    const s = backend().createSurface();
    s.stamp([dab()]);
    s.stamp([dab({ tool })]);
    for (const f of s.data)
        assert.ok(Number.isFinite(f) && f >= 0, `Tool ${tool} produced ${f}`);
} });
test('lossless packed fields survive zero runs and IEEE-754 bit patterns', () => { const input = new Float32Array(4096); const random = rng(91); for (let i = 0; i < input.length; i++)
    if (random() > .6)
        input[i] = Math.fround(random() * 10); const output = unpackFloats(packFloats(input), input.length); assert.deepEqual(new Uint32Array(output.buffer), new Uint32Array(input.buffer)); assert.ok(packFloats(new Float32Array(4096)).byteLength === 4); });
test('corrupt field streams are rejected instead of over-allocating', () => { assert.throws(() => unpackFloats(new Uint32Array([0]), 32)); assert.throws(() => unpackFloats(new Uint32Array([0xffffffff]), 32)); assert.throws(() => unpackFloats(new Uint32Array([2, 1]), 32)); assert.throws(() => unpackFloats(new Uint32Array([1, 0x7fc00000]), 1)); });
test('editable project binary round-trip preserves fields and metadata', async () => { const e = backend(), layer = createLayer(e, '水彩 test'); layer.surface.stamp([dab()]); const doc = { engine: e, name: 'Round trip', width: 1200, height: 900, layers: [layer], activeId: layer.id, simulation: { ...DEFAULT_SIMULATION } }, snapshot = await captureDocument(doc), blob = await encodeProject(snapshot), decoded = await decodeProject(blob), fields = materializeSnapshot(decoded); assert.equal(decoded.layers[0].name, '水彩 test'); assert.equal(decoded.name, 'Round trip'); assert.deepEqual(fields[0], layer.surface.data); });
test('non-project and truncated files are rejected', async () => { await assert.rejects(decodeProject(new Blob(['Not a PigmentLab file']))); const e = backend(), l = createLayer(e), snapshot = await captureDocument({ engine: e, name: 'Test', width: 1200, height: 900, layers: [l], activeId: l.id, simulation: { ...DEFAULT_SIMULATION } }), blob = await encodeProject(snapshot); await assert.rejects(decodeProject(blob.slice(0, blob.size - 1))); });
test('history provides exact undo/redo across async capture', async () => { let value = 0; const h = new History({ capture: () => Promise.resolve({ value, fields: [new Uint32Array([value])] }), restore: s => { value = s.value; } }); h.checkpoint('One'); value = 1; h.checkpoint('Two'); value = 2; await h.undo(); assert.equal(value, 1); await h.undo(); assert.equal(value, 0); await h.redo(); assert.equal(value, 1); await h.redo(); assert.equal(value, 2); });
test('identity affine transform is exact and horizontal flip has no off-by-one loss', async () => { const s = backend().createSurface(); s.stamp([dab({ x: 8 })]); const initial = s.data.slice(); await transformSurface(s, {}); assert.deepEqual(s.data, initial); await transformSurface(s, { flipX: true }); for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++)
        for (let k = 0; k < 12; k++)
            close(s.data[(y * 32 + x) * 12 + k], initial[(y * 32 + (31 - x)) * 12 + k], 1e-6); });
test('flood fill honors region boundaries and selection', async () => { const e = backend(), s = e.createSurface(); for (let y = 0; y < 32; y++) {
    const i = (y * 32 + 16) * 12;
    s.data[i + 9] = 2;
    s.data[i + 4] = 3;
    s.data[i + 5] = 3;
    s.data[i + 6] = 3;
} await floodFill(s, 4, 4, hexToKS('#b34462')); assert.ok(s.data[(4 * 32 + 4) * 12 + 9] > 0); assert.equal(s.data[(4 * 32 + 20) * 12 + 9], 0); });
test('RGBA image import reconstructs opacity and color', async () => { const e = backend(16, 16), s = e.createSurface(), data = new Uint8ClampedArray(16 * 16 * 4); for (let i = 0; i < 256; i++)
    data.set([83, 140, 175, 128], i * 4); await importPixels(s, { width: 16, height: 16, data }); const c = cellColor(s.data, 0); close(c[0], 83 / 255, 1e-5); close(c[1], 140 / 255, 1e-5); close(c[2], 175 / 255, 1e-5); close(c[3], 128 / 255, 1e-5); });
test('demo paintings contain three finite independently editable layers', () => { const a = createDemo(96, 72), b = createDemo(96, 72); assert.equal(a.fields.length, 3); for (let j = 0; j < 3; j++) {
    assert.deepEqual(a.fields[j], b.fields[j]);
    assert.ok(sum(a.fields[j], [9]) > 0);
    for (const f of a.fields[j])
        assert.ok(Number.isFinite(f) && f >= 0);
} });
test('viewport zoom remains anchored to the cursor under rotation', () => { const stage = { getBoundingClientRect: () => ({ left: 10, top: 30, width: 800, height: 600 }) }, paper = { style: {} }, v = new Viewport(stage, paper, 1200, 900); v.zoom = .5; v.rotation = .7; v.panX = 20; v.panY = -10; const before = v.toWorld(280, 320); v.zoomAt(1.7, 280, 320); const after = v.toWorld(280, 320); close(after.x, before.x); close(after.y, before.y); });
test('semantic commands expose metadata and honor enabled state', async () => { let calls = 0; const c = new CommandRegistry(); c.register('paint', { label: 'Paint', enabled: () => false, run: () => calls++ }); assert.equal(await c.invoke('paint'), false); assert.equal(calls, 0); assert.equal(c.list()[0].enabled, false); await assert.rejects(c.invoke('missing')); });
test('Drying a selection does not suspend wet material outside it', () => { const e = backend(), s = e.createSurface(); s.operate(2); e.setSelection(createSelection(32, 32, { type: 'rect', points: [{ x: 0, y: 0 }, { x: 16, y: 32 }] })); s.operate(1); assert(s.wake > 0); assert(s.data[(20 * 32 + 20) * 12 + 3] > 0); assert(s.step(1 / 60, DEFAULT_SIMULATION)); });
test('Alpha-locked fill does not create material in transparent cells', async () => { const e = backend(), s = e.createSurface(); s.alphaLock = true; await floodFill(s, 16, 16, hexToKS('#538caf')); assert.equal(sum(s.data, [8, 9]), 0); });
test('Imported brush dynamics are clamped to supported domains', () => { const b = validateBrush({ ...PRESETS[0], grain: -100, hardness: 15, shape: 70, stabilizer: 100, thickness: -1, jitter: 50 }); assert.equal(b.grain, 0); assert.equal(b.hardness, 1); assert.equal(b.shape, 3); assert.equal(b.stabilizer, .85); assert.equal(b.thickness, 0); assert.equal(b.jitter, 1); });
test('Project decoder rejects HTML-injection layer identifiers', async () => { const e = backend(), l = createLayer(e), d = { name: 'Safe', width: 32, height: 32, engine: e, layers: [l], activeId: l.id, simulation: DEFAULT_SIMULATION }; const snap = await captureDocument(d); snap.layers[0].id = '\"><img src=x onerror=alert(1)>'; await assert.rejects(() => encodeProject(snap).then(decodeProject), /layer metadata/); });
test('Project decoder whitelists metadata rather than restoring arbitrary object properties', async () => { const e = backend(), l = createLayer(e), d = { name: 'Safe', width: 32, height: 32, engine: e, layers: [l], activeId: l.id, simulation: DEFAULT_SIMULATION }; const snap = await captureDocument(d); snap.layers[0].surface = { arbitrary: true }; snap.layers[0].unexpected = 'no'; const decoded = await decodeProject(await encodeProject(snap)); assert.equal(decoded.layers[0].surface, undefined); assert.equal(decoded.layers[0].unexpected, undefined); });
