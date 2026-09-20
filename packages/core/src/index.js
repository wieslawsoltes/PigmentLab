/** @module @pigmentlab/core - Environment-neutral primitives, deterministic RNG and tiling. */
export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const align = (value, alignment) => Math.ceil(value / alignment) * alignment;
export function invariant(test, message) { if (!test)
    throw new Error(message); }
export function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
export function uid() { return globalThis.crypto?.randomUUID?.() ?? `pgl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
/** Integer hash shared exactly with the WGSL implementation. */
export function hash(x, y, seed = 0) {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 69069)) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function rng(seed = 1) {
    let state = seed >>> 0;
    return () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function valueNoise(x, y, seed = 0) {
    const ix = Math.floor(x), iy = Math.floor(y), u = smoothstep(0, 1, x - ix), v = smoothstep(0, 1, y - iy);
    return lerp(lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), u), lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), u), v);
}
export class Signal {
    #listeners = new Set();
    subscribe(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
    emit(value) { for (const fn of [...this.#listeners])
        fn(value); }
    clear() { this.#listeners.clear(); }
}
export class SerialQueue {
    #tail = Promise.resolve();
    pending = 0;
    run(task) { this.pending++; const result = this.#tail.then(task); this.#tail = result.catch(() => { }).finally(() => { this.pending--; }); return result; }
    idle() { return this.#tail; }
}
export class ActiveTiles {
    constructor(width, height, tileSize = 32) { this.width = width; this.height = height; this.tileSize = tileSize; this.cols = Math.ceil(width / tileSize); this.rows = Math.ceil(height / tileSize); this.tiles = new Set(); }
    mark(x0, y0, x1, y1, halo = 0) {
        const t = this.tileSize;
        for (let y = Math.max(0, Math.floor(y0 / t) - halo); y <= Math.min(this.rows - 1, Math.floor(y1 / t) + halo); y++)
            for (let x = Math.max(0, Math.floor(x0 / t) - halo); x <= Math.min(this.cols - 1, Math.floor(x1 / t) + halo); x++)
                this.tiles.add(y * this.cols + x);
    }
    all() { for (let i = 0; i < this.cols * this.rows; i++)
        this.tiles.add(i); }
    expand() { const prev = [...this.tiles]; for (const t of prev) {
        const x = t % this.cols, y = Math.floor(t / this.cols);
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
                if (x + dx >= 0 && x + dx < this.cols && y + dy >= 0 && y + dy < this.rows)
                    this.tiles.add((y + dy) * this.cols + x + dx);
    } }
    clear() { this.tiles.clear(); }
    get size() { return this.tiles.size; }
    records() { const a = new Uint32Array(this.size * 4); let i = 0; for (const t of this.tiles) {
        a[i++] = t % this.cols;
        a[i++] = Math.floor(t / this.cols);
        i += 2;
    } return a; }
}
/** Spatially bin dabs, preserving their order within each affected tile. */
export function binDabs(dabs, width, height, tileSize = 32) {
    const cols = Math.ceil(width / tileSize), rows = Math.ceil(height / tileSize), bins = new Map();
    dabs.forEach((d, index) => {
        const r = d.radius * Math.max(1, d.aspect ?? 1) + 2;
        for (let y = Math.max(0, Math.floor((d.y - r) / tileSize)); y <= Math.min(rows - 1, Math.floor((d.y + r) / tileSize)); y++)
            for (let x = Math.max(0, Math.floor((d.x - r) / tileSize)); x <= Math.min(cols - 1, Math.floor((d.x + r) / tileSize)); x++) {
                const k = y * cols + x;
                if (!bins.has(k))
                    bins.set(k, []);
                bins.get(k).push(index);
            }
    });
    const tiles = new Uint32Array(bins.size * 4), ids = [];
    let i = 0;
    for (const [k, list] of bins) {
        tiles[i++] = k % cols;
        tiles[i++] = Math.floor(k / cols);
        tiles[i++] = ids.length;
        tiles[i++] = list.length;
        ids.push(...list);
    }
    return { tiles, ids: new Uint32Array(ids) };
}
export const CELL_FLOATS = 12;
export const CELL_BYTES = CELL_FLOATS * 4;
export const TILE_SIZE = 32;
export const MAX_LAYERS = 12;
export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
export function bounds(points) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
    }
    return { x0, y0, x1, y1 };
}
export function polygonContains(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        if (((a.y > y) !== (b.y > y)) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)
            inside = !inside;
    }
    return inside;
}
export function createSelection(width, height, selection) {
    const mask = new Float32Array(width * height);
    if (!selection) {
        mask.fill(1);
        return mask;
    }
    const b = bounds(selection.points);
    for (let y = Math.max(0, Math.floor(b.y0)); y <= Math.min(height - 1, Math.ceil(b.y1)); y++)
        for (let x = Math.max(0, Math.floor(b.x0)); x <= Math.min(width - 1, Math.ceil(b.x1)); x++) {
            let yes;
            if (selection.type === 'rect')
                yes = x + .5 >= b.x0 && x + .5 <= b.x1 && y + .5 >= b.y0 && y + .5 <= b.y1;
            else if (selection.type === 'ellipse')
                yes = ((x + .5 - (b.x0 + b.x1) / 2) / Math.max(.5, (b.x1 - b.x0) / 2)) ** 2 + ((y + .5 - (b.y0 + b.y1) / 2) / Math.max(.5, (b.y1 - b.y0) / 2)) ** 2 <= 1;
            else
                yes = polygonContains(x + .5, y + .5, selection.points);
            mask[y * width + x] = yes ? 1 : 0;
        }
    return mask;
}
