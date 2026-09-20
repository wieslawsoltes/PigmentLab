import { clamp, BLEND_MODES, hash } from '@pigmentlab/core';
import { cellColor, blendChannel, hexToRgb } from '@pigmentlab/pigments';
export const compositorWGSL = /* wgsl */ `
struct Cell{mobile:vec4<f32>,fixed:vec4<f32>,material:vec4<f32>}
struct Params{size:vec4<f32>,paperColor:vec4<f32>,layer:vec4<f32>,view:vec4<f32>}
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> cells:array<Cell>;
@group(0) @binding(2) var<storage,read> paper:array<vec4<f32>>;
@group(0) @binding(3) var previous:texture_2d<f32>;
@group(0) @binding(4) var smp:sampler;
struct VertexOut{@builtin(position) pos:vec4<f32>,@location(0) uv:vec2<f32>}
@vertex fn vertex(@builtin(vertex_index) id:u32)->VertexOut{
 let pos=array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0),vec2<f32>(3.0,-1.0),vec2<f32>(-1.0,3.0));var o:VertexOut;o.pos=vec4<f32>(pos[id],0.0,1.0);o.uv=vec2<f32>((pos[id].x+1.0)*.5,(1.0-pos[id].y)*.5);return o;
}
fn index(x:i32,y:i32)->u32{return u32(clamp(y,0,i32(p.size.y)-1))*u32(p.size.x)+u32(clamp(x,0,i32(p.size.x)-1));}
fn interpolate(a:Cell,b:Cell,t:f32)->Cell{return Cell(mix(a.mobile,b.mobile,t),mix(a.fixed,b.fixed,t),mix(a.material,b.material,t));}
fn readCell(uv:vec2<f32>)->Cell{let at=uv*p.size.xy-vec2<f32>(.5);let ip=vec2<i32>(floor(at));let f=fract(at);return interpolate(interpolate(cells[index(ip.x,ip.y)],cells[index(ip.x+1,ip.y)],f.x),interpolate(cells[index(ip.x,ip.y+1)],cells[index(ip.x+1,ip.y+1)],f.x),f.y);}
fn srgb(v:vec3<f32>)->vec3<f32>{return select(12.92*v,1.055*pow(max(v,vec3<f32>(0.0)),vec3<f32>(1.0/2.4))-vec3<f32>(.055),v>vec3<f32>(.0031308));}
fn reflectance(k:vec3<f32>)->vec3<f32>{return srgb(vec3<f32>(1.0)/(vec3<f32>(1.0)+k+sqrt(k*k+2.0*k)));}
fn blend(b:vec3<f32>,f:vec3<f32>,mode:u32)->vec3<f32>{
 switch(mode){case 1u:{return b*f;}case 2u:{return b+f-b*f;}case 3u:{return select(2.0*b*f,vec3<f32>(1.0)-2.0*(vec3<f32>(1.0)-b)*(vec3<f32>(1.0)-f),b>vec3<f32>(.5));}case 4u:{return min(b,f);}case 5u:{return max(b,f);}default:{return f;}}
}
fn over(back:vec4<f32>,front:vec3<f32>,a:f32,mode:u32)->vec4<f32>{let alpha=a+back.a*(1.0-a);if(alpha<.00001){return vec4<f32>(0.0);}let col=((1.0-a)*back.rgb*back.a+(1.0-back.a)*front*a+back.a*a*blend(back.rgb,front,mode))/alpha;return vec4<f32>(clamp(col,vec3<f32>(0.0),vec3<f32>(1.0)),alpha);}
@fragment fn background(v:VertexOut)->@location(0) vec4<f32>{
 if(p.view.z>.5){return vec4<f32>(0.0);}let xy=vec2<i32>(v.uv*p.size.xy);let h=paper[index(xy.x,xy.y)].x;let grain=1.0+(h-.5)*.09;return vec4<f32>(p.paperColor.rgb*grain,1.0);
}
@fragment fn composite(v:VertexOut)->@location(0) vec4<f32>{
 let back=textureSampleLevel(previous,smp,v.uv,0.0);let c=readCell(v.uv);let m=c.material.x+c.material.y;var out=back;
 if(m>.00001){let k=max((c.mobile.xyz+c.fixed.xyz)/m,vec3<f32>(0.0));var col=reflectance(k);let xy=vec2<i32>(v.uv*p.size.xy);
  let dx=cells[index(xy.x+1,xy.y)].fixed.w-cells[index(xy.x-1,xy.y)].fixed.w;let dy=cells[index(xy.x,xy.y+1)].fixed.w-cells[index(xy.x,xy.y-1)].fixed.w;
  let normal=normalize(vec3<f32>(-dx*3.0,-dy*3.0,1.0));let light=normalize(vec3<f32>(-.45,-.6,1.0));let thick=clamp(c.fixed.w*3.0,0.0,1.0)*p.view.w;
  let diffuse=dot(normal,light);let shade=mix(1.0,.35+diffuse*.83,thick);let spec=pow(max(dot(normal,normalize(light+vec3<f32>(0.0,0.0,1.0))),0.0),26.0)*.13*thick;
  col=col*shade+vec3<f32>(spec);let grain=1.0+(paper[index(xy.x,xy.y)].x-.5)*.05;col*=grain;
  out=over(back,col,(1.0-exp(-m*1.8))*p.layer.x,u32(p.layer.y));
 }
 if(p.layer.z>.5){out=over(out,vec3<f32>(.18,.70,.91),clamp(c.mobile.w*.28+c.material.z*.2,0.0,.7)*p.layer.x,0u);}
 if(p.layer.w>.5 && c.material.w>.01){out=over(out,vec3<f32>(1.0,.63,.16),c.material.w*.42,0u);}
 return out;
}
@fragment fn present(v:VertexOut)->@location(0) vec4<f32>{return textureSampleLevel(previous,smp,v.uv,0.0);}
`;
export class GPURenderer {
    constructor(canvas, engine) { this.canvas = canvas; this.engine = engine; this.device = engine.device; this.context = canvas.getContext('webgpu'); if (!this.context)
        throw new Error('Unable to initialize the WebGPU canvas.'); this.format = navigator.gpu.getPreferredCanvasFormat(); this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' }); this.layerUniforms = new Map(); }
    async initialize() {
        const d = this.device, module = d.createShaderModule({ label: 'PigmentLab · optical compositor', code: compositorWGSL });
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter(x => x.type === 'error');
        if (errors.length)
            throw new Error(errors.map(x => x.message).join('\n'));
        this.layout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }, { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }, { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }] });
        const layout = d.createPipelineLayout({ bindGroupLayouts: [this.layout] });
        this.pipelines = {};
        for (const entryPoint of ['background', 'composite', 'present'])
            this.pipelines[entryPoint] = await d.createRenderPipelineAsync({ label: `Optical ${entryPoint}`, layout, vertex: { module, entryPoint: 'vertex' }, fragment: { module, entryPoint, targets: [{ format: entryPoint === 'present' ? this.format : 'rgba8unorm' }] }, primitive: { topology: 'triangle-list' } });
        this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear' });
        this.empty = d.createBuffer({ size: 48, usage: GPUBufferUsage.STORAGE });
    }
    resize(width, height) { this.canvas.width = width; this.canvas.height = height; for (const t of this.textures || [])
        t.destroy(); this.textures = [0, 1].map(() => this.device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC })); this.lastTexture = null; }
    uniform(key, layer, options) {
        let buffer = this.layerUniforms.get(key);
        if (!buffer) {
            buffer = this.device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            this.layerUniforms.set(key, buffer);
        }
        const e = this.engine;
        const a = new Float32Array([...[e.width, e.height, this.canvas.width, this.canvas.height], ...hexToRgb(e.paperSettings.tint), 1, layer?.opacity ?? 1, Math.max(0, BLEND_MODES.indexOf(layer?.blend)), options.wetMap ? 1 : 0, options.showMasks && layer?.id === options.activeId ? 1 : 0, 0, 0, options.transparent ? 1 : 0, options.lighting === false ? 0 : 1]);
        this.device.queue.writeBuffer(buffer, 0, a);
        return buffer;
    }
    render(layers, options = {}) {
        if (!this.textures || this.engine.lost)
            return;
        const d = this.device, encoder = d.createCommandEncoder({ label: 'PigmentLab composition' });
        let current = 0;
        const draw = (pipeline, view, prev, uniform, surface) => { const group = d.createBindGroup({ layout: this.layout, entries: [{ binding: 0, resource: { buffer: uniform } }, { binding: 1, resource: { buffer: surface?.buffer || this.empty } }, { binding: 2, resource: { buffer: this.engine.paperBuffer } }, { binding: 3, resource: prev.createView() }, { binding: 4, resource: this.sampler }] }); const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] }); pass.setPipeline(this.pipelines[pipeline]); pass.setBindGroup(0, group); pass.draw(3); pass.end(); };
        draw('background', this.textures[0].createView(), this.textures[1], this.uniform('background', null, options));
        for (const layer of layers) {
            if (!layer.visible || layer.opacity <= 0)
                continue;
            const next = 1 - current;
            draw('composite', this.textures[next].createView(), this.textures[current], this.uniform(layer.id, layer, options), layer.surface);
            current = next;
        }
        draw('present', this.context.getCurrentTexture().createView(), this.textures[current], this.uniform('present', null, options));
        d.queue.submit([encoder.finish()]);
        this.lastTexture = this.textures[current];
        const valid = new Set(['background', 'present', ...layers.map(l => l.id)]);
        for (const [id, b] of this.layerUniforms)
            if (!valid.has(id)) {
                b.destroy();
                this.layerUniforms.delete(id);
            }
    }
    async pixels() { const w = this.canvas.width, h = this.canvas.height, row = Math.ceil(w * 4 / 256) * 256; const buffer = this.device.createBuffer({ size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }); const enc = this.device.createCommandEncoder(); enc.copyTextureToBuffer({ texture: this.lastTexture }, { buffer, bytesPerRow: row, rowsPerImage: h }, [w, h]); this.device.queue.submit([enc.finish()]); await buffer.mapAsync(GPUMapMode.READ); const raw = new Uint8Array(buffer.getMappedRange()), out = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++)
        out.set(raw.subarray(y * row, y * row + w * 4), y * w * 4); buffer.unmap(); buffer.destroy(); return new ImageData(out, w, h); }
    dispose() { for (const t of this.textures || [])
        t.destroy(); for (const b of this.layerUniforms.values())
        b.destroy(); this.empty?.destroy(); this.context.unconfigure(); }
}
export class CPURenderer {
    constructor(canvas, engine) { this.canvas = canvas; this.engine = engine; this.context = canvas.getContext('2d', { alpha: true }); this.offscreen = document.createElement('canvas'); }
    async initialize() { }
    resize(width, height) { this.canvas.width = width; this.canvas.height = height; this.offscreen.width = this.engine.width; this.offscreen.height = this.engine.height; this.image = new ImageData(this.engine.width, this.engine.height); }
    render(layers, options = {}) {
        const e = this.engine, w = e.width, h = e.height, dest = this.image.data, paper = e.paper, tint = hexToRgb(e.paperSettings.tint), visible = layers.filter(l => l.visible && l.opacity > 0);
        for (let i = 0; i < w * h; i++) {
            const grain = 1 + (paper[i * 4] - .5) * .09;
            let rgb = tint.map(c => c * grain), alpha = options.transparent ? 0 : 1;
            if (!alpha)
                rgb = [0, 0, 0];
            const over = (front, a, mode) => { const oa = a + alpha * (1 - a); if (oa < 1e-6)
                return; for (let k = 0; k < 3; k++)
                rgb[k] = clamp(((1 - a) * rgb[k] * alpha + (1 - alpha) * front[k] * a + alpha * a * blendChannel(rgb[k], front[k], mode)) / oa); alpha = oa; };
            for (const l of visible) {
                const d = l.surface.data, o = i * 12, c = cellColor(d, o);
                if (c[3] > .00001) {
                    const x = i % w, y = Math.floor(i / w), dx = d[(y * w + Math.min(w - 1, x + 1)) * 12 + 7] - d[(y * w + Math.max(0, x - 1)) * 12 + 7], dy = d[(Math.min(h - 1, y + 1) * w + x) * 12 + 7] - d[(Math.max(0, y - 1) * w + x) * 12 + 7];
                    const nx = -dx * 3, ny = -dy * 3, norm = Math.hypot(nx, ny, 1), thick = options.lighting === false ? 0 : clamp(d[o + 7] * 3), lightNorm = Math.hypot(.45, .6, 1), diffuse = (-nx * .45 - ny * .6 + 1) / norm / lightNorm, shade = 1 - thick + thick * (.35 + diffuse * .83), half = [-.45 / lightNorm, -.6 / lightNorm, 1 / lightNorm + 1], hn = Math.hypot(...half), spec = Math.max(0, (nx * half[0] + ny * half[1] + half[2]) / norm / hn) ** 26 * .13 * thick, g = 1 + (paper[i * 4] - .5) * .05;
                    over(c.slice(0, 3).map(v => (v * shade + spec) * g), c[3] * l.opacity, l.blend);
                }
                if (options.wetMap)
                    over([.18, .70, .91], clamp(d[o + 3] * .28 + d[o + 10] * .2, 0, .7) * l.opacity, 'normal');
                if (options.showMasks && l.id === options.activeId && d[o + 11] > .01)
                    over([1, .63, .16], d[o + 11] * .42, 'normal');
            }
            dest[i * 4] = Math.round(clamp(rgb[0]) * 255);
            dest[i * 4 + 1] = Math.round(clamp(rgb[1]) * 255);
            dest[i * 4 + 2] = Math.round(clamp(rgb[2]) * 255);
            dest[i * 4 + 3] = Math.round(alpha * 255);
        }
        this.offscreen.getContext('2d').putImageData(this.image, 0, 0);
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.imageSmoothingEnabled = true;
        this.context.imageSmoothingQuality = 'high';
        this.context.drawImage(this.offscreen, 0, 0, this.canvas.width, this.canvas.height);
    }
    pixels() { return Promise.resolve(this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)); }
    dispose() { }
}
export async function createRenderer(canvas, engine) { const renderer = engine.kind === 'webgpu' ? new GPURenderer(canvas, engine) : new CPURenderer(canvas, engine); await renderer.initialize(); return renderer; }
export async function exportImage(renderer, layers, options = {}) {
    renderer.render(layers, { ...options, wetMap: false, showMasks: false });
    const image = await renderer.pixels(), canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').putImageData(image, 0, 0);
    const type = options.type || 'image/png';
    return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('The browser could not encode the image.')), type, options.quality ?? .95));
}
export async function heightmap(surface) { const data = await surface.read(), image = new ImageData(surface.width, surface.height); let peak = 0; for (let i = 7; i < data.length; i += 12)
    peak = Math.max(peak, data[i]); for (let i = 0; i < surface.width * surface.height; i++) {
    const v = Math.round(data[i * 12 + 7] / Math.max(peak, 1e-6) * 255);
    image.data.set([v, v, v, 255], i * 4);
} const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d').putImageData(image, 0, 0); return new Promise(resolve => canvas.toBlob(resolve, 'image/png')); }
export async function layerThumbnail(surface, canvas) { const data = await surface.read(), ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, img = new ImageData(w, h); for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
        const sx = Math.min(surface.width - 1, Math.floor(x / w * surface.width)), sy = Math.min(surface.height - 1, Math.floor(y / h * surface.height)), c = cellColor(data, (sy * surface.width + sx) * 12);
        img.data.set(c.map(v => Math.round(v * 255)), (y * w + x) * 4);
    } ctx.clearRect(0, 0, w, h); ctx.putImageData(img, 0, 0); }
