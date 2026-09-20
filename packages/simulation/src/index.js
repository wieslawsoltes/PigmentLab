import { ActiveTiles, binDabs, clamp, hash, smoothstep, CELL_FLOATS, CELL_BYTES } from '@pigmentlab/core';
import { cellColor, rgbToKS } from '@pigmentlab/pigments';
import { createPaper, PAPERS } from '@pigmentlab/paper';
import { simulationWGSL } from '@pigmentlab/kernels';
export const DEFAULT_SIMULATION = Object.freeze({ evaporation: .48, diffusion: .68, granulation: .6, tiltX: 0, tiltY: 0, paused: false });
const DEFAULT_CELL = new Float32Array(CELL_FLOATS);
const pack = dabs => { const a = new Float32Array(dabs.length * 20); dabs.forEach((d, i) => a.set([d.x, d.y, d.radius, d.aspect, ...d.ks, d.load, d.water, d.opacity, d.hardness, d.grain, d.angle, d.tool, d.seed, d.pressure, d.dx, d.dy, d.thickness, d.shape], i * 20)); return a; };
/** CPU oracle for brush and simulation kernels. Explicit input/output separation prevents read/write races. */
export function stampCPU(source, target, width, height, paper, selection, dabs, alphaLock = false) {
    target.set(source);
    const { tiles, ids } = binDabs(dabs, width, height);
    const sample = (x, y) => Math.round(clamp(y, 0, height - 1)) * width + Math.round(clamp(x, 0, width - 1));
    for (let t = 0; t < tiles.length; t += 4)
        for (let y = tiles[t + 1] * 32; y < Math.min(height, tiles[t + 1] * 32 + 32); y++)
            for (let x = tiles[t] * 32; x < Math.min(width, tiles[t] * 32 + 32); x++) {
                const i = y * width + x, o = i * 12;
                let c = target.subarray(o, o + 12);
                for (let j = 0; j < tiles[t + 3]; j++) {
                    const d = dabs[ids[tiles[t + 2] + j]], cs = Math.cos(d.angle), sn = Math.sin(d.angle), vx = x + .5 - d.x, vy = y + .5 - d.y;
                    const qx = (vx * cs + vy * sn) / d.radius, qy = (-vx * sn + vy * cs) / (d.radius * d.aspect), r = d.shape === 1 ? Math.max(Math.abs(qx), Math.abs(qy)) : Math.hypot(qx, qy);
                    if (r >= 1)
                        continue;
                    const n = hash(x, y, d.seed), grain = d.grain;
                    let a = (1 - smoothstep(clamp(d.hardness, 0, .98), 1, r)) * d.opacity * selection[i];
                    a *= 1 - grain + grain * smoothstep(grain * .64, 1, paper[i * 4] + n * .32);
                    if (d.shape === 2)
                        a *= .34 + .66 * Math.abs(Math.sin(qy * d.radius * 2.1 + Math.sin(qx * 7))) ** .55;
                    if (d.shape === 3)
                        a *= n > .94 ? 2 : 0;
                    if (d.tool !== 13 && d.tool !== 14)
                        a *= 1 - c[11];
                    if (alphaLock && c[8] + c[9] < .001 && d.tool !== 13 && d.tool !== 14)
                        a = 0;
                    a = clamp(a);
                    if (a <= 0)
                        continue;
                    const m = d.load * a * .3;
                    switch (d.tool) {
                        case 8:
                            for (let k = 0; k < 11; k++)
                                c[k] *= 1 - a * .48;
                            break;
                        case 9:
                            c[3] = Math.min(4, c[3] + a * d.water * .4);
                            break;
                        case 10: {
                            const f = a * .5;
                            for (let k = 0; k < 3; k++) {
                                c[4 + k] += c[k] * f;
                                c[k] *= 1 - f;
                            }
                            c[9] += c[8] * f;
                            c[8] *= 1 - f;
                            c[3] *= 1 - f;
                            c[10] *= 1 - f;
                            break;
                        }
                        case 13:
                            c[11] = Math.min(1, c[11] + a * .55);
                            break;
                        case 14:
                            c[11] *= 1 - a * .7;
                            break;
                        case 11:
                        case 15:
                        case 16: {
                            const stride = Math.max(1, Math.trunc(d.radius * .12)), samples = d.tool === 11 ? [sample(x - stride, y), sample(x + stride, y), sample(x, y - stride), sample(x, y + stride)] : [sample(Math.trunc(x - d.dx * 2), Math.trunc(y - d.dy * 2))];
                            for (let k = 0; k < 11; k++) {
                                if (d.tool === 16 && k >= 4 && k !== 8)
                                    continue;
                                let v = 0;
                                for (const si of samples)
                                    v += source[si * 12 + k];
                                v /= samples.length;
                                c[k] += (v - c[k]) * a * (d.tool === 16 ? .5 : .35);
                            }
                            break;
                        }
                        case 0:
                        case 3: {
                            const settle = d.tool === 3 ? .65 : 0;
                            for (let k = 0; k < 3; k++) {
                                c[k] += d.ks[k] * m * (1 - settle);
                                c[4 + k] += d.ks[k] * m * settle;
                            }
                            c[3] = Math.min(4, c[3] + a * d.water * .22);
                            c[8] += m * (1 - settle);
                            c[9] += m * settle;
                            break;
                        }
                        default: {
                            if (d.tool === 12) {
                                const si = sample(Math.trunc(x - d.dx), Math.trunc(y - d.dy)) * 12;
                                for (let k = 0; k < 11; k++)
                                    c[k] += (source[si + k] - c[k]) * a * .12;
                            }
                            for (let k = 0; k < 3; k++)
                                c[4 + k] += d.ks[k] * m;
                            c[9] += m;
                            if (d.tool === 1 || d.tool === 2 || d.tool === 12)
                                c[7] = Math.min(8, c[7] + m * d.thickness * 2);
                            break;
                        }
                    }
                }
            }
    return target;
}
export function stepCPU(source, target, width, height, paper, dt, settings = DEFAULT_SIMULATION, tiles = null) {
    target.set(source);
    const tick = clamp(dt * 60, 0, 1), evap = settings.evaporation, diff = settings.diffusion, gran = settings.granulation;
    const process = (x, y) => {
        const i = y * width + x, o = i * 12, w = source[o + 3], mask = source[o + 11];
        for (let j = 0; j < 4; j++) {
            const dx = j === 0 ? 1 : j === 1 ? -1 : 0, dy = j === 2 ? 1 : j === 3 ? -1 : 0, nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height)
                continue;
            const ni = ny * width + nx, no = ni * 12, nw = source[no + 3], barrier = (1 - mask) * (1 - source[no + 11]);
            const speed = (w - nw) * .085 + (paper[i * 4] - paper[ni * 4]) * Math.min(w + nw, 1) * .025 + (settings.tiltX * dx + settings.tiltY * dy) * .042;
            const fo = Math.min(Math.max(speed, 0), w * .1) * barrier * tick, fi = Math.min(Math.max(-speed, 0), nw * .1) * barrier * tick;
            const ro = fo / Math.max(w, .00001), ri = fi / Math.max(nw, .00001), df = clamp(diff) * .055 * Math.min(w, nw, 1) * barrier * tick;
            for (let k = 0; k < 3; k++)
                target[o + k] += source[no + k] * (ri + df) - source[o + k] * (ro + df);
            target[o + 3] += fi - fo;
            target[o + 8] += source[no + 8] * (ri + df) - source[o + 8] * (ro + df);
        }
        for (let k = 0; k < 4; k++)
            target[o + k] = Math.max(0, target[o + k]);
        target[o + 8] = Math.max(0, target[o + 8]);
        const absorbed = Math.min(target[o + 3], paper[i * 4 + 1] * .008 * tick * (1 - Math.min(source[o + 10], .95)));
        target[o + 3] = Math.max(0, target[o + 3] - absorbed - (.0004 + evap * .007) * tick);
        target[o + 10] = clamp(source[o + 10] + absorbed * .6 - (.0003 + evap * .0015) * tick);
        const rewet = Math.min(.005 * tick * Math.max(target[o + 3] - .15, 0), .04) * Math.exp(-source[o + 7] * 30) * (1 - mask);
        for (let k = 0; k < 3; k++) {
            target[o + k] += source[o + 4 + k] * rewet;
            target[o + 4 + k] -= source[o + 4 + k] * rewet;
        }
        target[o + 8] += source[o + 9] * rewet;
        target[o + 9] -= source[o + 9] * rewet;
        let deposit = clamp((.009 + paper[i * 4 + 1] * .016 + (1 - paper[i * 4]) * gran * .04) * tick, 0, .4);
        if (target[o + 3] < .025)
            deposit = Math.max(deposit, 1 - target[o + 3] / .025);
        for (let k = 0; k < 3; k++) {
            target[o + 4 + k] += target[o + k] * deposit;
            target[o + k] *= 1 - deposit;
        }
        target[o + 9] += target[o + 8] * deposit;
        target[o + 8] *= 1 - deposit;
    };
    if (tiles) {
        for (const t of tiles.tiles) {
            const tx = t % tiles.cols, ty = Math.floor(t / tiles.cols);
            for (let y = ty * 32; y < Math.min(height, ty * 32 + 32); y++)
                for (let x = tx * 32; x < Math.min(width, tx * 32 + 32); x++)
                    process(x, y);
        }
    }
    else
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++)
                process(x, y);
    return target;
}
function operateCPU(data, selection, mode, value = 1) {
    for (let i = 0; i < selection.length; i++) {
        const s = selection[i], o = i * 12;
        if (!s)
            continue;
        if (mode === 1) {
            for (let k = 0; k < 3; k++) {
                data[o + 4 + k] += data[o + k] * s;
                data[o + k] *= 1 - s;
            }
            data[o + 9] += data[o + 8] * s;
            data[o + 8] *= 1 - s;
            data[o + 3] *= 1 - s;
            data[o + 10] *= 1 - s;
        }
        else if (mode === 2)
            data[o + 3] = Math.min(4, data[o + 3] + s * (1 - data[o + 11]) * value);
        else if (mode === 3) {
            for (let k = 0; k < 11; k++)
                data[o + k] *= 1 - s;
        }
        else if (mode === 4)
            data[o + 11] *= 1 - s;
        else if (mode === 5) {
            const a = data[o] * .2126 + data[o + 1] * .7152 + data[o + 2] * .0722, b = data[o + 4] * .2126 + data[o + 5] * .7152 + data[o + 6] * .0722;
            for (let k = 0; k < 3; k++) {
                data[o + k] += (a - data[o + k]) * s;
                data[o + 4 + k] += (b - data[o + 4 + k]) * s;
            }
        }
    }
}
export class CPUBackend {
    kind = 'cpu';
    device = null;
    reason = '';
    configure(width, height, paper = PAPERS[0]) { this.width = width; this.height = height; this.paperSettings = { ...paper }; this.paper = createPaper(width, height, paper); this.selection = new Float32Array(width * height).fill(1); }
    setPaper(paper) { this.paperSettings = { ...paper }; this.paper = createPaper(this.width, this.height, paper); }
    setSelection(selection) { this.selection = selection; }
    createSurface() { return new CPUSurface(this); }
    destroy() { }
}
class BaseSurface {
    constructor(engine) { this.engine = engine; this.width = engine.width; this.height = engine.height; this.active = new ActiveTiles(this.width, this.height); this.wake = 0; this.steps = 0; this.revision = 0; this.alphaLock = false; }
    mark(dabs) { for (const d of dabs) {
        this.active.mark(d.x - d.radius, d.y - d.radius, d.x + d.radius, d.y + d.radius, 1);
        if (d.water > .001 || d.tool === 9)
            this.wake = 30;
    } this.revision++; }
}
export class CPUSurface extends BaseSurface {
    constructor(engine) { super(engine); this.data = new Float32Array(this.width * this.height * 12); this.scratch = new Float32Array(this.data.length); }
    stamp(dabs) { if (!dabs.length)
        return; stampCPU(this.data, this.scratch, this.width, this.height, this.engine.paper, this.engine.selection, dabs, this.alphaLock); [this.data, this.scratch] = [this.scratch, this.data]; this.mark(dabs); }
    step(dt, settings) { if (this.wake <= 0 || !this.active.size)
        return false; if ((this.steps++ % 8) === 0)
        this.active.expand(); stepCPU(this.data, this.scratch, this.width, this.height, this.engine.paper, dt, settings, this.active); [this.data, this.scratch] = [this.scratch, this.data]; this.wake -= dt; this.revision++; return true; }
    operate(mode, value = 1) { operateCPU(this.data, this.engine.selection, mode, value); this.active.all(); if (mode === 2)
        this.wake = 30; if (mode === 1 && this.engine.selection.every(v => v === 1))
        this.wake = 0; this.revision++; }
    read() { return Promise.resolve(this.data.slice()); }
    upload(data) { if (data.length !== this.data.length)
        throw new Error('Surface dimensions do not match.'); this.data.set(data); this.scratch.set(data); this.active.all(); this.wake = 30; this.revision++; }
    dispose() { this.data = null; this.scratch = null; }
}
export class GPUBackend {
    kind = 'webgpu';
    reason = '';
    constructor(device, adapter) { this.device = device; this.adapter = adapter; this.lost = false; this.errors = []; device.lost.then(info => { this.lost = true; this.onLost?.(info); }); device.addEventListener('uncapturederror', e => { this.errors.push(e.error.message); console.error('WebGPU:', e.error.message); this.onError?.(e.error); }); }
    async initialize() {
        const d = this.device, module = d.createShaderModule({ label: 'PigmentLab · material simulation', code: simulationWGSL });
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter(m => m.type === 'error');
        if (errors.length)
            throw new Error(errors.map(e => `${e.lineNum}: ${e.message}`).join('\n'));
        this.layout = d.createBindGroupLayout({ entries: [0, 1, 2, 3, 4, 5, 6].map(binding => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: binding === 1 ? 'storage' : 'read-only-storage' } })).concat([{ binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }]) });
        const layout = d.createPipelineLayout({ bindGroupLayouts: [this.layout] });
        this.pipelines = {};
        for (const entryPoint of ['stamp', 'step', 'operate'])
            this.pipelines[entryPoint] = await d.createComputePipelineAsync({ label: entryPoint, layout, compute: { module, entryPoint } });
    }
    configure(width, height, paper = PAPERS[0]) {
        const bytes = width * height * CELL_BYTES;
        if (bytes > this.device.limits.maxStorageBufferBindingSize)
            throw new Error('Simulation surface exceeds the adapter storage-buffer limit.');
        this.paperBuffer?.destroy();
        this.selectionBuffer?.destroy();
        this.width = width;
        this.height = height;
        this.paperSettings = { ...paper };
        this.paper = createPaper(width, height, paper);
        this.selection = new Float32Array(width * height).fill(1);
        this.paperBuffer = this.buffer(this.paper.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'Paper topography');
        this.selectionBuffer = this.buffer(this.selection.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'Selection');
        this.device.queue.writeBuffer(this.paperBuffer, 0, this.paper);
        this.device.queue.writeBuffer(this.selectionBuffer, 0, this.selection);
    }
    buffer(size, usage, label) { return this.device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage, label }); }
    setPaper(paper) { this.paperSettings = { ...paper }; this.paper = createPaper(this.width, this.height, paper); this.device.queue.writeBuffer(this.paperBuffer, 0, this.paper); }
    setSelection(selection) { this.selection = selection; this.device.queue.writeBuffer(this.selectionBuffer, 0, selection); }
    createSurface() { if (this.lost)
        throw new Error('GPU device lost. Recover the last autosave or reopen your project.'); return new GPUSurface(this); }
    destroy() { this.paperBuffer?.destroy(); this.selectionBuffer?.destroy(); this.device.destroy(); }
}
export class GPUSurface extends BaseSurface {
    constructor(engine) {
        super(engine);
        const e = engine;
        this.bytes = this.width * this.height * CELL_BYTES;
        this.buffers = [0, 1].map(i => e.buffer(this.bytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, `Pigment state ${i}`));
        this.front = 0;
        this.tileBuffer = e.buffer(this.active.cols * this.active.rows * 16, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'Active tiles');
        this.dabCapacity = 256;
        this.idCapacity = 4096;
        this.dabBuffer = e.buffer(this.dabCapacity * 80, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'Brush dabs');
        this.idBuffer = e.buffer(this.idCapacity * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'Binned dab indices');
        this.uniform = e.buffer(64, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'Simulation parameters');
    }
    get buffer() { return this.buffers[this.front]; }
    dispatch(entry, tiles, settings = DEFAULT_SIMULATION, dt = 1 / 60, mode = 0, value = 1) {
        if (!tiles.length || this.engine.lost)
            return;
        const e = this.engine, d = e.device;
        d.queue.writeBuffer(this.tileBuffer, 0, tiles);
        const mem = new ArrayBuffer(64), u = new Uint32Array(mem), f = new Float32Array(mem);
        u.set([this.width, this.height, mode, this.alphaLock ? 1 : 0]);
        f.set([dt, settings.evaporation, settings.diffusion, settings.granulation], 4);
        f.set([settings.tiltX, settings.tiltY, e.paperSettings.roughness, e.paperSettings.absorption], 8);
        f[12] = value;
        d.queue.writeBuffer(this.uniform, 0, mem);
        const buffers = [this.buffer, this.buffers[1 - this.front], this.dabBuffer, this.tileBuffer, this.idBuffer, e.paperBuffer, e.selectionBuffer, this.uniform];
        const group = d.createBindGroup({ layout: e.layout, entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })) });
        const encoder = d.createCommandEncoder({ label: `Material ${entry}` });
        encoder.copyBufferToBuffer(this.buffer, 0, this.buffers[1 - this.front], 0, this.bytes);
        const pass = encoder.beginComputePass();
        pass.setPipeline(e.pipelines[entry]);
        pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(4, 4, tiles.length / 4);
        pass.end();
        d.queue.submit([encoder.finish()]);
        this.front = 1 - this.front;
    }
    stamp(dabs) {
        if (!dabs.length)
            return;
        // Bounded dispatches keep individual storage buffers and shader loops small.
        for (let offset = 0; offset < dabs.length; offset += 256) {
            const chunk = dabs.slice(offset, offset + 256), bins = binDabs(chunk, this.width, this.height);
            if (!bins.tiles.length)
                continue;
            if (bins.ids.length > this.idCapacity) {
                this.idBuffer.destroy();
                this.idCapacity = 2 ** Math.ceil(Math.log2(bins.ids.length));
                this.idBuffer = this.engine.buffer(this.idCapacity * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'Binned dab indices');
            }
            this.engine.device.queue.writeBuffer(this.dabBuffer, 0, pack(chunk));
            this.engine.device.queue.writeBuffer(this.idBuffer, 0, bins.ids);
            this.dispatch('stamp', bins.tiles);
        }
        this.mark(dabs);
    }
    step(dt, settings) { if (this.wake <= 0 || !this.active.size)
        return false; if ((this.steps++ % 8) === 0)
        this.active.expand(); this.dispatch('step', this.active.records(), settings, dt); this.wake -= dt; this.revision++; return true; }
    operate(mode, value = 1) { const all = new ActiveTiles(this.width, this.height); all.all(); this.dispatch('operate', all.records(), DEFAULT_SIMULATION, 0, mode, value); this.active.all(); if (mode === 2)
        this.wake = 30; if (mode === 1 && this.engine.selection.every(v => v === 1))
        this.wake = 0; this.revision++; }
    read() {
        const e = this.engine, d = e.device;
        if (e.lost)
            return Promise.reject(new Error('GPU device lost during readback.'));
        const staging = e.buffer(this.bytes, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ, 'Snapshot readback');
        const encoder = d.createCommandEncoder();
        encoder.copyBufferToBuffer(this.buffer, 0, staging, 0, this.bytes);
        d.queue.submit([encoder.finish()]);
        return staging.mapAsync(GPUMapMode.READ).then(() => { const data = new Float32Array(staging.getMappedRange()).slice(); staging.unmap(); staging.destroy(); return data; }, error => { staging.destroy(); throw error; });
    }
    upload(data) { if (data.byteLength !== this.bytes)
        throw new Error('Surface dimensions do not match.'); for (const b of this.buffers)
        this.engine.device.queue.writeBuffer(b, 0, data); this.active.all(); this.wake = 30; this.revision++; }
    dispose() { for (const b of [...this.buffers, this.tileBuffer, this.dabBuffer, this.idBuffer, this.uniform])
        b.destroy(); }
}
export async function createBackend({ preferGPU = true } = {}) {
    let reason = 'WebGPU is not available in this browser.';
    if (preferGPU && globalThis.navigator?.gpu) {
        let device;
        try {
            const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
            if (!adapter)
                throw new Error('No WebGPU adapter was returned.');
            device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 8 } });
            const backend = new GPUBackend(device, adapter);
            await backend.initialize();
            return backend;
        }
        catch (error) {
            reason = error.message;
            device?.destroy();
            console.warn('Using CPU painting backend:', reason);
        }
    }
    const cpu = new CPUBackend();
    cpu.reason = preferGPU ? reason : 'CPU backend explicitly selected.';
    return cpu;
}
/** Contiguous fill through a four-connected region. Pigment fields, not flattened RGB, are edited. */
export async function floodFill(surface, x, y, hexKS, { tolerance = .12, selection = surface.engine.selection, opacity = 1 } = {}) {
    const data = await surface.read(), w = surface.width, h = surface.height;
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= w || y >= h)
        return;
    const start = y * w + x, ref = cellColor(data, start * 12), visited = new Uint8Array(w * h), queue = new Uint32Array(w * h);
    let head = 0, tail = 1;
    queue[0] = start;
    visited[start] = 1;
    while (head < tail) {
        const i = queue[head++], o = i * 12;
        if (!selection[i] || data[o + 11] > .5 || (surface.alphaLock && data[o + 8] + data[o + 9] < .001))
            continue;
        const c = cellColor(data, o);
        if (Math.max(...c.map((v, k) => Math.abs(v - ref[k]))) > tolerance)
            continue;
        for (let k = 0; k < 3; k++)
            data[o + 4 + k] = hexKS[k] * opacity;
        data[o + 9] = opacity;
        data[o + 8] = 0;
        data[o] = data[o + 1] = data[o + 2] = 0;
        data[o + 3] = 0;
        const px = i % w, py = Math.floor(i / w);
        for (const ni of [px > 0 ? i - 1 : -1, px < w - 1 ? i + 1 : -1, py > 0 ? i - w : -1, py < h - 1 ? i + w : -1])
            if (ni >= 0 && !visited[ni]) {
                visited[ni] = 1;
                queue[tail++] = ni;
            }
    }
    surface.upload(data);
}
/** Affine layer transform of every material field. Bilinear reconstruction and transparent boundaries. */
export async function transformSurface(surface, { dx = 0, dy = 0, scale = 1, angle = 0, flipX = false, flipY = false } = {}) {
    if (!(scale > 0))
        throw new Error('Scale must be positive.');
    const input = await surface.read(), w = surface.width, h = surface.height, output = new Float32Array(input.length), cs = Math.cos(angle), sn = Math.sin(angle);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const vx = x - (w - 1) / 2 - dx, vy = y - (h - 1) / 2 - dy, px = (vx * cs + vy * sn) / scale * (flipX ? -1 : 1) + (w - 1) / 2, py = (-vx * sn + vy * cs) / scale * (flipY ? -1 : 1) + (h - 1) / 2, x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
            if (px < 0 || py < 0 || px > w - 1 || py > h - 1)
                continue;
            for (let k = 0; k < 12; k++) {
                let v = 0;
                for (let oy = 0; oy < 2; oy++)
                    for (let ox = 0; ox < 2; ox++) {
                        const xx = Math.min(w - 1, x0 + ox), yy = Math.min(h - 1, y0 + oy);
                        v += input[(yy * w + xx) * 12 + k] * (ox ? fx : 1 - fx) * (oy ? fy : 1 - fy);
                    }
                output[(y * w + x) * 12 + k] = v;
            }
        }
    surface.upload(output);
}
export async function importPixels(surface, imageData) {
    const input = imageData.data, w = surface.width, h = surface.height;
    if (imageData.width !== w || imageData.height !== h)
        throw new Error('Image data must match simulation dimensions.');
    const out = new Float32Array(w * h * 12);
    for (let i = 0; i < w * h; i++) {
        const a = input[i * 4 + 3] / 255;
        if (a < .001)
            continue;
        const ks = rgbToKS([input[i * 4] / 255, input[i * 4 + 1] / 255, input[i * 4 + 2] / 255]);
        const m = -Math.log(Math.max(.0001, 1 - a)) / 1.8;
        for (let k = 0; k < 3; k++)
            out[i * 12 + 4 + k] = ks[k] * m;
        out[i * 12 + 9] = m;
    }
    surface.upload(out);
    surface.wake = 0;
}
