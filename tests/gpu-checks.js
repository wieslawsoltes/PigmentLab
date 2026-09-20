import { CPUBackend, GPUBackend, DEFAULT_SIMULATION } from '@pigmentlab/simulation';
import { createRenderer } from '@pigmentlab/renderer';
import { PAPERS } from '@pigmentlab/paper';
import { hexToKS } from '@pigmentlab/pigments';
import { BLEND_MODES } from '@pigmentlab/core';
/** Adapter-backed integration suite. A missing adapter is not a test pass. */
export async function runGPUChecks(canvas) {
    const report = { status: 'RUNNING', backend: null, checks: [], errors: [] };
    let gpu, cpu, renderer;
    const surfaces = [];
    const assert = (name, condition, details) => {
        report.checks.push({ name, pass: !!condition, ...(details ? { details } : {}) });
        if (!condition)
            throw new Error(name);
    };
    const compare = (a, b, epsilon = 0.002) => {
        let maxError = 0, maxScaledError = 0;
        for (let i = 0; i < a.length; i++) {
            if (!Number.isFinite(a[i]) || !Number.isFinite(b[i]))
                return { ok: false, index: i };
            const error = Math.abs(a[i] - b[i]);
            maxError = Math.max(maxError, error);
            maxScaledError = Math.max(maxScaledError, error / (1 + Math.abs(b[i])));
        }
        return { ok: maxScaledError <= epsilon, maxError, maxScaledError, epsilon };
    };
    try {
        if (!navigator.gpu) {
            report.status = 'SKIPPED';
            report.reason = 'WebGPU is not exposed in this context.';
            return report;
        }
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) {
            report.status = 'SKIPPED';
            report.reason = 'No GPU adapter available.';
            return report;
        }
        const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 8 } });
        gpu = new GPUBackend(device, adapter);
        report.backend = 'webgpu';
        await gpu.initialize();
        gpu.configure(96, 64, PAPERS[0]);
        cpu = new CPUBackend();
        cpu.configure(96, 64, PAPERS[0]);
        assert('All three WGSL compute pipelines compile', Object.keys(gpu.pipelines).length === 3);
        const initial = new Float32Array(96 * 64 * 12), ks = hexToKS('#538caf');
        for (let y = 12; y < 52; y++)
            for (let x = 14; x < 82; x++) {
                const i = (y * 96 + x) * 12, m = .15 + (x % 11) * .01;
                initial.set([...ks.map(k => k * m), .6, ...ks.map(k => k * m * .5), .08, m, m * .5, .05, .08], i);
            }
        const a = gpu.createSurface(), b = cpu.createSurface();
        surfaces.push(a, b);
        for (let tool = 0; tool <= 16; tool++) {
            a.upload(initial);
            b.upload(initial);
            const d = { x: 48, y: 32, radius: 19, aspect: .72, ks: hexToKS('#d96251'), load: .5, water: .8, opacity: .8, hardness: .7, grain: .4, angle: .2, tool, seed: 101, pressure: .7, dx: 2, dy: 1, thickness: .8, shape: 0 };
            a.stamp([d]);
            b.stamp([d]);
            const result = compare(await a.read(), await b.read());
            assert(`Brush tool ${tool} agrees with CPU oracle`, result.ok, result);
        }
        for (let mode = 1; mode <= 5; mode++) {
            a.upload(initial);
            b.upload(initial);
            a.operate(mode);
            b.operate(mode);
            const result = compare(await a.read(), await b.read());
            assert(`Material operation ${mode} agrees with CPU oracle`, result.ok, result);
        }
        a.upload(initial);
        b.upload(initial);
        const settings = { ...DEFAULT_SIMULATION, tiltX: .18, tiltY: .08 };
        for (let i = 0; i < 100; i++) {
            a.step(1 / 60, settings);
            b.step(1 / 60, settings);
        }
        const transport = compare(await a.read(), await b.read(), .005);
        assert('One hundred transport steps agree with CPU oracle', transport.ok, transport);
        renderer = await createRenderer(canvas, gpu);
        renderer.resize(192, 128);
        assert('All optical compositor pipelines compile', Object.keys(renderer.pipelines).length === 3);
        for (const blend of BLEND_MODES) {
            renderer.render([{ id: 'test', surface: a, visible: true, opacity: .8, blend }], { transparent: true, lighting: true });
            const image = await renderer.pixels();
            let opaque = 0;
            for (let i = 3; i < image.data.length; i += 4)
                opaque += image.data[i];
            assert(`${blend} compositing produces pigment pixels`, opaque > 0);
        }
        await gpu.device.queue.onSubmittedWorkDone();
        assert('No uncaptured WebGPU validation errors', gpu.errors.length === 0, gpu.errors);
        report.status = 'PASSED';
    }
    catch (error) {
        report.status = 'FAILED';
        report.errors.push(error.stack || error.message);
    }
    finally {
        renderer?.dispose();
        for (const surface of surfaces)
            surface.dispose();
        gpu?.destroy();
        cpu?.destroy();
    }
    return report;
}
