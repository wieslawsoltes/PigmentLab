/** Headless, dependency-free material painting and lossless project export in Node.js.
 * Run npm install --offline --ignore-scripts once to link the local workspaces.
 * Then: node examples/headless.mjs [output.pigment]
 */
import { writeFile } from 'node:fs/promises';
import { CPUBackend, DEFAULT_SIMULATION } from '@pigmentlab/simulation';
import { PRESETS, Stroke } from '@pigmentlab/brushes';
import { PAPERS } from '@pigmentlab/paper';
import { createLayer, captureDocument, encodeProject } from '@pigmentlab/document';
const engine = new CPUBackend();
engine.configure(256, 192, PAPERS[0]);
const layer = createLayer(engine, 'Headless watercolor');
const brush = new Stroke({ ...PRESETS[1], size: 22, stabilizer: 0 }, '#538caf', 123);
for (let x = 25; x <= 230; x += 2) {
    layer.surface.stamp(brush.point({ x, y: 96 + Math.sin(x * 0.035) * 35, pressure: 0.8 }));
}
const settings = { ...DEFAULT_SIMULATION, tiltX: 0.15 };
for (let frame = 0; frame < 90; frame++)
    layer.surface.step(1 / 60, settings);
layer.surface.operate(1);
const document = {
    engine, name: 'Headless study', width: 1024, height: 768,
    layers: [layer], activeId: layer.id, simulation: settings
};
const blob = await encodeProject(await captureDocument(document));
const output = process.argv[2] || 'examples/headless-output.pigment';
await writeFile(output, new Uint8Array(await blob.arrayBuffer()));
layer.surface.dispose();
engine.destroy();
console.log(`Wrote ${output} (${blob.size} bytes). Open it in PigmentLab to continue painting.`);
