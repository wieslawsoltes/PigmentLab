import { clamp, valueNoise, hash } from '@pigmentlab/core';
export const PAPERS = [
    { id: 'cold', name: 'Cold press', subtitle: 'Cotton · 300 gsm', roughness: .62, absorption: .66, tint: '#f6f2e7', scale: 1 },
    { id: 'hot', name: 'Hot press', subtitle: 'Smooth · 200 gsm', roughness: .18, absorption: .43, tint: '#faf8ef', scale: .65 },
    { id: 'rough', name: 'Rough cotton', subtitle: 'Handmade · 640 gsm', roughness: .9, absorption: .8, tint: '#eee8d8', scale: 1.6 },
    { id: 'linen', name: 'Linen canvas', subtitle: 'Primed · medium weave', roughness: .7, absorption: .25, tint: '#eae5d8', scale: 1 },
    { id: 'kraft', name: 'Kraft paper', subtitle: 'Recycled · 180 gsm', roughness: .5, absorption: .75, tint: '#b99b72', scale: 1.2 },
    { id: 'white', name: 'Bristol board', subtitle: 'Smooth · bright white', roughness: .08, absorption: .28, tint: '#fdfcfa', scale: .5 }
];
export function paperAt(x, y, paper = PAPERS[0], seed = 73) {
    const scale = paper.scale || 1;
    let h = .5 * valueNoise(x / (3 * scale), y / (3 * scale), seed) + .3 * valueNoise(x / (9 * scale), y / (9 * scale), seed + 4) + .2 * hash(x, y, seed);
    if (paper.id === 'linen')
        h = .5 + .20 * Math.sin(x * 2.1) + .20 * Math.sin(y * 2.1) + .10 * hash(x, y, seed);
    h = clamp(.5 + (h - .5) * paper.roughness * 1.65);
    return [h, clamp(paper.absorption * (.7 + .6 * (1 - h))), .5 + .5 * h, 0];
}
export function createPaper(width, height, paper = PAPERS[0], seed = 73) {
    const out = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
            out.set(paperAt(x, y, paper, seed), (y * width + x) * 4);
    return out;
}
