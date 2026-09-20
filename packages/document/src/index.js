import { uid, Signal, MAX_LAYERS, CELL_FLOATS, BLEND_MODES, clamp } from '@pigmentlab/core';
const encoder = new TextEncoder(), decoder = new TextDecoder(), MAGIC = encoder.encode('PGLAB001');
const MAX_BYTES = 512 * 1024 * 1024;
/** Lossless IEEE-754 bitwise zero-run encoding. No float16 quantization is used for history or files. */
export function packFloats(floats) {
    const data = new Uint32Array(floats.buffer, floats.byteOffset, floats.length);
    // A zero run replaces at least three words with one. Its savings cover each
    // additional literal-run header, so N+1 words is a strict allocation bound.
    const out = new Uint32Array(data.length + 1);
    let i = 0, o = 0;
    while (i < data.length) {
        let z = i;
        while (z < data.length && data[z] === 0)
            z++;
        if (z - i >= 3) {
            out[o++] = (0x80000000 | (z - i)) >>> 0;
            i = z;
            continue;
        }
        let end = i;
        while (end < data.length) {
            if (data[end] === 0 && data[end + 1] === 0 && data[end + 2] === 0)
                break;
            end++;
        }
        out[o++] = end - i;
        out.set(data.subarray(i, end), o);
        o += end - i;
        i = end;
    }
    return out.slice(0, o);
}
export function unpackFloats(packed, length) {
    if (!Number.isSafeInteger(length) || length < 0 || length * 4 > MAX_BYTES)
        throw new Error('Invalid decoded field size.');
    const out = new Uint32Array(length);
    let i = 0, o = 0;
    while (i < packed.length) {
        const token = packed[i++], count = token & 0x7fffffff;
        if (!count || o + count > length)
            throw new Error('Corrupt pigment field run.');
        if (token >>> 31)
            o += count;
        else {
            if (i + count > packed.length)
                throw new Error('Truncated pigment field.');
            out.set(packed.subarray(i, i + count), o);
            i += count;
            o += count;
        }
    }
    if (o !== length)
        throw new Error('Pigment field size does not match the manifest.');
    const floats = new Float32Array(out.buffer);
    for (let k = 0; k < floats.length; k++)
        if (!Number.isFinite(floats[k]) || floats[k] < 0)
            throw new Error('Non-finite or negative material state.');
    return floats;
}
export function createLayer(engine, name = 'Paint layer') { return { id: uid(), name, visible: true, locked: false, alphaLock: false, opacity: 1, blend: 'normal', surface: engine.createSurface() }; }
export const layerMetadata = ({ id, name, visible, locked, alphaLock, opacity, blend }) => ({ id, name, visible, locked, alphaLock, opacity, blend });
/** GPU snapshots are queued synchronously at invocation time, before subsequent brush submissions. */
export function captureDocument(doc) {
    const meta = { version: 1, name: doc.name, width: doc.width, height: doc.height, simWidth: doc.engine.width, simHeight: doc.engine.height, paper: { ...doc.engine.paperSettings }, activeId: doc.activeId, simulation: { ...doc.simulation }, layers: doc.layers.map(layerMetadata) };
    const reads = doc.layers.map(l => l.surface.read());
    return Promise.all(reads).then(fields => ({ ...meta, fields: fields.map(packFloats) }));
}
export function snapshotBytes(snapshot) { return snapshot.fields.reduce((sum, f) => sum + f.byteLength, 0) + JSON.stringify({ ...snapshot, fields: undefined }).length; }
export async function encodeProject(snapshot) {
    const { fields, ...meta } = snapshot, manifest = encoder.encode(JSON.stringify({ ...meta, fieldLengths: fields.map(f => f.length) }));
    const size = 12 + manifest.length + fields.reduce((s, f) => s + f.byteLength, 0);
    if (size > MAX_BYTES)
        throw new Error('Project exceeds the 512 MiB file limit.');
    const out = new Uint8Array(size);
    out.set(MAGIC);
    new DataView(out.buffer).setUint32(8, manifest.length, true);
    out.set(manifest, 12);
    let offset = 12 + manifest.length;
    const outputView = new DataView(out.buffer);
    for (const field of fields) {
        for (let i = 0; i < field.length; i++)
            outputView.setUint32(offset + i * 4, field[i], true);
        offset += field.byteLength;
    }
    return new Blob([out], { type: 'application/x-pigmentlab' });
}
export async function decodeProject(blob) {
    if (blob.size > MAX_BYTES || blob.size < 12)
        throw new Error('Invalid PigmentLab project size.');
    const raw = await blob.arrayBuffer(), view = new DataView(raw), bytes = new Uint8Array(raw);
    if (MAGIC.some((b, i) => b !== bytes[i]))
        throw new Error('This is not a PigmentLab .pigment project.');
    const len = view.getUint32(8, true);
    if (len > 1024 * 1024 || 12 + len > raw.byteLength)
        throw new Error('Invalid project manifest.');
    const meta = JSON.parse(decoder.decode(bytes.subarray(12, 12 + len)));
    validateManifest(meta);
    let offset = 12 + len;
    const fields = [];
    for (const count of meta.fieldLengths) {
        if (!Number.isSafeInteger(count) || count < 1 || offset + count * 4 > raw.byteLength)
            throw new Error('Truncated project fields.');
        const f = new Uint32Array(count);
        for (let i = 0; i < count; i++)
            f[i] = view.getUint32(offset + i * 4, true);
        fields.push(f);
        offset += count * 4;
    }
    if (offset !== raw.byteLength)
        throw new Error('Unexpected trailing project data.');
    delete meta.fieldLengths;
    // Whitelist metadata before it reaches DOM attributes or live layer objects.
    return { version: 1, name: meta.name, width: meta.width, height: meta.height, simWidth: meta.simWidth, simHeight: meta.simHeight, activeId: meta.activeId,
        paper: { id: meta.paper.id, name: meta.paper.name, subtitle: meta.paper.subtitle, tint: meta.paper.tint, roughness: meta.paper.roughness, absorption: meta.paper.absorption, scale: meta.paper.scale },
        simulation: { evaporation: meta.simulation.evaporation, diffusion: meta.simulation.diffusion, granulation: meta.simulation.granulation, tiltX: meta.simulation.tiltX, tiltY: meta.simulation.tiltY, paused: meta.simulation.paused },
        layers: meta.layers.map(layerMetadata), fields };
}
function validateManifest(m) {
    if (m.version !== 1)
        throw new Error('Unsupported project version.');
    for (const key of ['width', 'height'])
        if (!Number.isSafeInteger(m[key]) || m[key] < 32 || m[key] > 8192)
            throw new Error('Invalid canvas dimensions.');
    for (const key of ['simWidth', 'simHeight'])
        if (!Number.isSafeInteger(m[key]) || m[key] < 16 || m[key] > 1536)
            throw new Error('Invalid simulation dimensions.');
    if (!Array.isArray(m.layers) || m.layers.length < 1 || m.layers.length > MAX_LAYERS || m.fieldLengths?.length !== m.layers.length)
        throw new Error('Invalid layer count.');
    if (m.simWidth * m.simHeight * m.layers.length * CELL_FLOATS * 4 > MAX_BYTES)
        throw new Error('Project requires too much uncompressed material storage.');
    if (typeof m.name !== 'string' || m.name.length > 200)
        throw new Error('Invalid project name.');
    if (!m.paper || !/^#[0-9a-f]{6}$/i.test(m.paper.tint))
        throw new Error('Invalid paper.');
    for (const k of ['roughness', 'absorption'])
        if (!Number.isFinite(m.paper[k]) || m.paper[k] < 0 || m.paper[k] > 1)
            throw new Error('Invalid paper parameter.');
    if (!Number.isFinite(m.paper.scale) || m.paper.scale <= 0 || m.paper.scale > 10)
        throw new Error('Invalid paper scale.');
    const ids = new Set();
    for (const l of m.layers) {
        if (typeof l.id !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(l.id) || ids.has(l.id) || typeof l.name !== 'string' || l.name.length > 200 || !Number.isFinite(l.opacity) || l.opacity < 0 || l.opacity > 1 || !BLEND_MODES.includes(l.blend))
            throw new Error('Invalid layer metadata.');
        ids.add(l.id);
    }
    for (const l of m.layers)
        for (const key of ['visible', 'locked', 'alphaLock'])
            if (typeof l[key] !== 'boolean')
                throw new Error('Invalid layer flags.');
    if (!ids.has(m.activeId))
        m.activeId = m.layers.at(-1).id;
    for (const key of ['name', 'subtitle'])
        if (typeof m.paper[key] !== 'string' || m.paper[key].length > 200)
            throw new Error('Invalid paper description.');
    if (!['cold', 'hot', 'rough', 'linen', 'kraft', 'white'].includes(m.paper.id))
        throw new Error('Unknown paper substrate.');
    if (typeof m.simulation?.paused !== 'boolean')
        throw new Error('Invalid simulation pause state.');
    for (const k of ['evaporation', 'diffusion', 'granulation', 'tiltX', 'tiltY'])
        if (!Number.isFinite(m.simulation?.[k]) || Math.abs(m.simulation[k]) > 1 || (!k.startsWith('tilt') && m.simulation[k] < 0))
            throw new Error('Invalid simulation settings.');
}
/** Restores atomically at the application boundary; caller should retain the previous doc on failure. */
export function materializeSnapshot(snapshot) { return snapshot.fields.map(f => unpackFloats(f, snapshot.simWidth * snapshot.simHeight * 12)); }
export class History {
    constructor({ capture, restore, budget = 192 * 1024 * 1024, limit = 40 }) { this.capture = capture; this.restore = restore; this.budget = budget; this.limit = limit; this.undoStack = []; this.redoStack = []; this.changed = new Signal(); this.busy = false; this.bytes = 0; }
    checkpoint(label) {
        if (this.busy)
            throw new Error('History transaction is in progress.');
        const item = { label, promise: this.capture(), bytes: 0 };
        this.undoStack.push(item);
        this.redoStack = [];
        item.promise.then(s => { item.bytes = snapshotBytes(s); this.trim(); this.changed.emit(this); }, e => { this.undoStack = this.undoStack.filter(v => v !== item); console.error('History capture failed:', e); this.changed.emit(this); });
        this.trim();
        this.changed.emit(this);
        return item;
    }
    trim() { this.bytes = [...this.undoStack, ...this.redoStack].reduce((s, x) => s + x.bytes, 0); while (this.undoStack.length > 1 && (this.bytes > this.budget || this.undoStack.length > this.limit)) {
        const item = this.undoStack.shift();
        this.bytes -= item.bytes;
    } }
    async undo() { return this.move(this.undoStack, this.redoStack); }
    async redo() { return this.move(this.redoStack, this.undoStack); }
    async move(from, to) { if (this.busy || !from.length)
        return false; this.busy = true; this.changed.emit(this); const item = from.at(-1); try {
        const current = this.capture(), next = await item.promise;
        await this.restore(next);
        from.pop();
        const reverse = { label: item.label, promise: current, bytes: 0 };
        to.push(reverse);
        reverse.promise.then(s => { reverse.bytes = snapshotBytes(s); this.trim(); this.changed.emit(this); });
        return true;
    }
    finally {
        this.busy = false;
        this.changed.emit(this);
    } }
    clear() { this.undoStack = []; this.redoStack = []; this.bytes = 0; this.changed.emit(this); }
}
export class AutosaveStore {
    constructor() { this.db = null; }
    async open() { if (!globalThis.indexedDB)
        throw new Error('Browser storage is unavailable.'); this.db = await new Promise((resolve, reject) => { const request = indexedDB.open('pigmentlab-studio', 1); request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); return this; }
    async write(blob, name) { if (!this.db)
        await this.open(); return new Promise((resolve, reject) => { const tx = this.db.transaction('projects', 'readwrite'); tx.objectStore('projects').put({ id: 'autosave', name, blob, date: Date.now() }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Autosave aborted.')); }); }
    async read() { if (!this.db)
        await this.open(); return new Promise((resolve, reject) => { const r = this.db.transaction('projects').objectStore('projects').get('autosave'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
    async clear() { if (!this.db)
        await this.open(); return new Promise((resolve, reject) => { const tx = this.db.transaction('projects', 'readwrite'); tx.objectStore('projects').delete('autosave'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
}
export function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
