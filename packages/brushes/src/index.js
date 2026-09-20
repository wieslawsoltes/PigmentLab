import { clamp, lerp, rng } from '@pigmentlab/core';
import { hexToKS } from '@pigmentlab/pigments';
export const TOOLS = { watercolor: 0, oil: 1, acrylic: 2, ink: 3, pastel: 4, pencil: 5, marker: 6, airbrush: 7, eraser: 8, water: 9, dryer: 10, blend: 11, knife: 12, mask: 13, unmask: 14, smudge: 15, blow: 16 };
export const MEDIA = [
    ['watercolor', 'Watercolor', 'W'], ['oil', 'Oil paint', 'O'], ['acrylic', 'Acrylic', 'A'], ['ink', 'Ink', 'I'], ['pastel', 'Pastel', 'P'], ['pencil', 'Pencil', 'N'], ['marker', 'Marker', 'M'], ['airbrush', 'Airbrush', 'J']
].map(([id, name, key]) => ({ id, name, key }));
const base = { medium: 'watercolor', size: 56, opacity: .7, water: .75, load: .34, hardness: .6, grain: .45, spacing: .15, aspect: 1, angle: 0, shape: 0, thickness: .1, jitter: .04, pressure: .65, stabilizer: .18 };
const preset = (id, name, medium, values = {}) => ({ ...base, id, name, medium, ...values });
export const PRESETS = [
    preset('mop', 'Soft wash', 'watercolor', { size: 100, opacity: .4, water: 1, load: .22, hardness: .2, grain: .35, spacing: .18 }),
    preset('round', 'Round sable', 'watercolor', { size: 46, hardness: .68, water: .72, load: .4 }),
    preset('bloom', 'Bloom & bleed', 'watercolor', { size: 82, opacity: .45, water: 1.4, load: .3, hardness: .45, grain: .68 }),
    preset('flat-wash', 'Flat wash', 'watercolor', { size: 72, aspect: .42, angle: -.5, shape: 1, hardness: .68, water: .8 }),
    preset('rigger', 'Fine rigger', 'watercolor', { size: 12, load: .58, opacity: .9, water: .4, hardness: .8, pressure: .85 }),
    preset('dry-brush', 'Dry brush', 'watercolor', { size: 60, water: .06, grain: .94, hardness: .9, shape: 2, load: .48 }),
    preset('oils-flat', 'Bristle flat', 'oil', { size: 48, water: 0, load: .56, opacity: .85, hardness: .88, shape: 2, aspect: .48, thickness: .75, grain: .25 }),
    preset('oils-round', 'Round filbert', 'oil', { size: 40, water: 0, load: .6, opacity: .9, hardness: .78, aspect: .62, thickness: .65, grain: .18 }),
    preset('oils-impasto', 'Heavy impasto', 'oil', { size: 68, water: 0, load: .8, opacity: .94, hardness: .8, shape: 2, thickness: 1.2, grain: .4 }),
    preset('oils-fan', 'Fan brush', 'oil', { size: 76, water: 0, load: .4, opacity: .8, hardness: .75, aspect: .25, shape: 2, thickness: .5, grain: .55 }),
    preset('acrylic-flat', 'Flat acrylic', 'acrylic', { size: 46, water: .04, load: .65, opacity: .9, hardness: .82, aspect: .5, shape: 1, thickness: .4 }),
    preset('acrylic-dry', 'Scumble', 'acrylic', { size: 64, water: 0, load: .5, opacity: .7, hardness: .9, grain: .85, shape: 2, thickness: .3 }),
    preset('ink-pen', 'Technical pen', 'ink', { size: 5, water: .1, load: .85, opacity: 1, hardness: .95, spacing: .12, grain: .05 }),
    preset('ink-brush', 'Sumi brush', 'ink', { size: 34, water: .42, load: .75, opacity: .9, hardness: .85, pressure: .95, grain: .4 }),
    preset('pastel-soft', 'Soft pastel', 'pastel', { size: 40, water: 0, opacity: .58, load: .4, hardness: .75, grain: .88, spacing: .14 }),
    preset('pastel-side', 'Pastel edge', 'pastel', { size: 56, water: 0, opacity: .55, load: .4, hardness: .92, grain: .95, aspect: .25, shape: 1 }),
    preset('pencil-2b', 'Graphite 2B', 'pencil', { size: 4, water: 0, opacity: .7, load: .42, hardness: .9, grain: .7, pressure: .8 }),
    preset('pencil-6b', 'Graphite 6B', 'pencil', { size: 8, water: 0, opacity: .85, load: .6, hardness: .8, grain: .85 }),
    preset('pencil-color', 'Color pencil', 'pencil', { size: 7, water: 0, opacity: .72, load: .5, hardness: .85, grain: .75 }),
    preset('marker-chisel', 'Chisel marker', 'marker', { size: 26, water: 0, load: .4, opacity: .55, hardness: .94, aspect: .35, shape: 1, angle: -.65, grain: .02 }),
    preset('marker-fine', 'Fineliner', 'marker', { size: 6, water: 0, load: .5, opacity: .9, hardness: .94, grain: .03 }),
    preset('airbrush-soft', 'Soft airbrush', 'airbrush', { size: 110, water: 0, load: .14, opacity: .25, hardness: .02, grain: .1, spacing: .1 }),
    preset('airbrush-grain', 'Spatter', 'airbrush', { size: 130, water: .15, load: .3, opacity: .65, hardness: .1, grain: .98, shape: 3, jitter: .06 })
];
export const utilityBrush = (tool, current) => ({ ...base, ...current, medium: tool, water: tool === 'water' ? 1 : current.water, opacity: tool === 'water' ? .65 : current.opacity });
/** Arc-length resampling: independent of pointer event frequency; coalesced input supported by UI. */
export class Stroke {
    constructor(brush, color, seed = 1) { this.brush = { ...brush }; this.ks = hexToKS(color); this.random = rng(seed); this.last = null; this.filtered = null; this.distance = 0; this.seed = seed; }
    point(p, force = false) {
        const b = this.brush;
        p = { ...p, pressure: clamp(p.pressure ?? .65, .03, 1) };
        if (!this.last) {
            this.last = p;
            this.filtered = p;
            return [this.dab(p, 0, 0)];
        }
        const prior = this.filtered, t = force ? 1 : 1 - clamp(b.stabilizer, 0, .9);
        p = { x: lerp(prior.x, p.x, t), y: lerp(prior.y, p.y, t), pressure: lerp(prior.pressure, p.pressure, t), tiltX: p.tiltX || 0, tiltY: p.tiltY || 0 };
        this.filtered = p;
        const dx = p.x - this.last.x, dy = p.y - this.last.y, len = Math.hypot(dx, dy), step = Math.max(.65, b.size * b.spacing * .55);
        const dabs = [];
        if (len < 1e-5)
            return dabs;
        const origin = this.last;
        let next = step - this.distance;
        while (next <= len) {
            const u = next / len, q = { x: origin.x + dx * u, y: origin.y + dy * u, pressure: lerp(origin.pressure, p.pressure, u), tiltX: p.tiltX, tiltY: p.tiltY };
            dabs.push(this.dab(q, dx / len * step, dy / len * step));
            next += step;
        }
        this.distance = (this.distance + len) % step;
        this.last = p;
        if (force && dabs.length === 0 && len > step * .25)
            dabs.push(this.dab(p, dx, dy));
        return dabs;
    }
    dab(p, dx, dy) {
        const b = this.brush, pr = lerp(1, Math.pow(p.pressure, .65), b.pressure), angle = b.angle + (p.tiltX || p.tiltY ? Math.atan2(p.tiltY, p.tiltX) * .5 : 0);
        return { x: p.x + (this.random() - .5) * b.size * b.jitter, y: p.y + (this.random() - .5) * b.size * b.jitter, radius: Math.max(.5, b.size * .5 * pr), aspect: b.aspect, ks: this.ks, load: b.load, water: b.water, opacity: b.opacity * lerp(.55, 1, p.pressure), hardness: b.hardness, grain: b.grain, angle, tool: TOOLS[b.medium] ?? 0, seed: Math.floor(this.random() * 100000), pressure: p.pressure, dx, dy, thickness: b.thickness, shape: b.shape };
    }
}
export function packDabs(dabs) {
    const a = new Float32Array(dabs.length * 20);
    dabs.forEach((d, i) => a.set([d.x, d.y, d.radius, d.aspect, ...d.ks, d.load, d.water, d.opacity, d.hardness, d.grain, d.angle, d.tool, d.seed, d.pressure, d.dx, d.dy, d.thickness, d.shape], i * 20));
    return a;
}
export function mirrorDabs(dabs, mode, width, height) {
    if (mode === 'none')
        return dabs;
    const out = [];
    for (const d of dabs) {
        out.push(d);
        if (mode === 'vertical' || mode === 'both')
            out.push({ ...d, x: width - d.x, dx: -d.dx, angle: Math.PI - d.angle });
        if (mode === 'horizontal' || mode === 'both')
            out.push({ ...d, y: height - d.y, dy: -d.dy, angle: -d.angle });
        if (mode === 'both')
            out.push({ ...d, x: width - d.x, y: height - d.y, dx: -d.dx, dy: -d.dy, angle: Math.PI + d.angle });
        if (mode === 'radial')
            for (let k = 1; k < 6; k++) {
                const a = k * Math.PI / 3, c = Math.cos(a), s = Math.sin(a), x = d.x - width / 2, y = d.y - height / 2;
                out.push({ ...d, x: width / 2 + x * c - y * s, y: height / 2 + x * s + y * c, dx: d.dx * c - d.dy * s, dy: d.dx * s + d.dy * c, angle: d.angle + a });
            }
    }
    return out;
}
export function validateBrush(value) {
    if (!value || typeof value !== 'object' || !(value.medium in TOOLS))
        throw new Error('Unsupported brush medium.');
    const result = { ...base, ...value };
    for (const k of ['size', 'opacity', 'water', 'load', 'hardness', 'grain', 'spacing', 'aspect', 'angle', 'shape', 'thickness', 'jitter', 'pressure', 'stabilizer'])
        if (!Number.isFinite(result[k]))
            throw new Error(`Invalid brush property: ${k}`);
    result.size = clamp(result.size, 1, 400);
    result.opacity = clamp(result.opacity);
    result.water = clamp(result.water, 0, 2);
    result.load = clamp(result.load, 0, 2);
    result.spacing = clamp(result.spacing, .04, 1);
    result.aspect = clamp(result.aspect, .08, 1.5);
    result.name = String(result.name || 'Custom brush').slice(0, 80);
    for (const k of ['hardness', 'grain', 'pressure'])
        result[k] = clamp(result[k]);
    result.stabilizer = clamp(result.stabilizer, 0, .85);
    result.jitter = clamp(result.jitter, 0, 1);
    result.thickness = clamp(result.thickness, 0, 2);
    result.shape = Math.round(clamp(result.shape, 0, 3));
    result.angle = Math.atan2(Math.sin(result.angle), Math.cos(result.angle));
    result.id = String(result.id || 'custom').replace(/[^a-z0-9_-]/gi, '-').slice(0, 100);
    return result;
}
