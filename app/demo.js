import { clamp, smoothstep, valueNoise, hash, rng } from '@pigmentlab/core';
import { hexToKS } from '@pigmentlab/pigments';
/** Original, deterministic material-field painting. Every sample remains an editable pigment layer. */
export function createDemo(width, height, variant = 'quiet') {
    const n = width * height, layers = [new Float32Array(n * 12), new Float32Array(n * 12), new Float32Array(n * 12)];
    const warm = variant === 'autumn', colors = { sky: hexToKS(warm ? '#bd945a' : '#9bb8b3'), warm: hexToKS('#dbaa75'), sun: hexToKS('#e4bb79'), mountain: hexToKS(warm ? '#ad8470' : '#799c9e'), ridge: hexToKS(warm ? '#8a7a64' : '#537f83'), lake: hexToKS(warm ? '#ad9e76' : '#75a4a7'), tree: hexToKS(warm ? '#806548' : '#426b61'), dark: hexToKS(warm ? '#6e5041' : '#32534b'), gold: hexToKS('#b99d64') };
    const put = (field, i, ks, m, wet = 0) => { if (m < .0001)
        return; const o = i * 12; for (let k = 0; k < 3; k++) {
        field[o + 4 + k] += ks[k] * m * (1 - wet);
        field[o + k] += ks[k] * m * wet;
    } field[o + 9] += m * (1 - wet); field[o + 8] += m * wet; field[o + 3] = Math.max(field[o + 3], wet * .2); };
    const sq = x => x * x;
    const ridgeA = x => .495 - .17 * Math.exp(-sq((x - .31) / .16)) - .21 * Math.exp(-sq((x - .56) / .14)) - .065 * Math.exp(-sq((x - .8) / .13));
    const ridgeB = x => .59 - .08 * Math.exp(-sq((x - .17) / .15)) - .125 * Math.exp(-sq((x - .78) / .18));
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const u = x / width, v = y / height, i = y * width + x, noise = valueNoise(x / 3, y / 3, 54), soft = valueNoise(x / 16, y / 16, 23), fiber = hash(x, y, 97), edge = .012 * (soft - .5) + .004 * (noise - .5);
            const frame = smoothstep(.095, .125, u) * smoothstep(.915, .87, u) * smoothstep(.12, .155, v) * smoothstep(.865, .81, v);
            if (frame < .001)
                continue;
            const tex = .66 + noise * .38 + fiber * .2;
            const sky = Math.exp(-Math.pow((u - .5) / .4, 4) - Math.pow((v - .36) / .24, 4)) * frame;
            put(layers[0], i, colors.sky, sky * .12 * tex);
            const cloud = Math.exp(-sq((u - .68) / .29) - sq((v - .27) / .115));
            put(layers[0], i, colors.warm, cloud * .15 * tex * frame);
            const sun = Math.hypot((u - .698) * width / height, v - .256);
            put(layers[0], i, colors.sun, (1 - smoothstep(.041 + edge * .2, .044 + edge * .2, sun)) * .45 * tex);
            const lineA = ridgeA(u) + edge, coverageA = smoothstep(lineA - .002, lineA + .006, v) * (1 - smoothstep(.568, .66, v)) * frame;
            const snow = (Math.sin(u * 105 + v * 24) * .5 + .5) * Math.exp(-Math.max(0, v - lineA) * 24);
            put(layers[1], i, colors.mountain, coverageA * (.32 + noise * .11) * (1 - .35 * snow));
            const lineB = ridgeB(u) + edge * 1.5, coverageB = smoothstep(lineB - .004, lineB + .003, v) * (1 - smoothstep(.615, .68, v)) * frame;
            put(layers[1], i, colors.ridge, coverageB * (.30 + noise * .16));
            const water = smoothstep(.605, .64, v) * (1 - smoothstep(.79, .845, v)) * frame;
            const ripple = (Math.sin(v * 580 + Math.sin(u * 45)) * .5 + .5) * .025;
            put(layers[1], i, colors.lake, water * (.11 + .05 * soft + ripple));
            const reflection = 1.27 - v, refA = smoothstep(ridgeA(u) + edge, .55, reflection) * (1 - smoothstep(.67, .79, v)) * water;
            put(layers[1], i, colors.mountain, refA * .12 * (.4 + .6 * (Math.sin(v * 370 + u * 20) * .5 + .5)));
            const bank = .795 + .018 * Math.sin(u * 12) - .035 * Math.exp(-sq((u - .22) / .2)), shore = smoothstep(bank - .008 + edge, bank + .006 + edge, v) * smoothstep(.851, .81, v) * frame;
            put(layers[2], i, colors.gold, shore * (.27 + .17 * soft) * tex);
        }
    const random = rng(43), trees = [];
    // Tall dark trees bookend a deliberately open, misty center.
    for (let j = 0; j < 34; j++) {
        const right = j >= 15, u = right ? .695 + random() * .175 : .135 + random() * .175;
        const base = .726 + random() * .07, heightN = (right ? .105 : .07) + random() * (right ? .29 : .15);
        trees.push({ u, base, h: heightN, width: heightN * (.19 + random() * .14), seed: j + 10, dark: right && j % 3 === 0 });
    }
    trees.sort((a, b) => a.base - b.base);
    for (const tree of trees) {
        const x0 = Math.max(0, Math.floor((tree.u - tree.width * .65) * width)), x1 = Math.min(width - 1, Math.ceil((tree.u + tree.width * .65) * width)), y0 = Math.floor((tree.base - tree.h) * height), y1 = Math.ceil(tree.base * height);
        for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) {
                const u = x / width, v = y / height, t = (v - tree.base + tree.h) / tree.h;
                if (t < 0 || t > 1)
                    continue;
                const branch = Math.floor(t * 16), frac = t * 16 - branch, side = (branch % 2 ? .9 : 1.1), jag = (.52 + .48 * (1 - frac)) * (.65 + .35 * hash(branch, tree.seed, 5));
                const spread = tree.width * t * jag * side, dx = Math.abs(u - tree.u + Math.sin(t * 12 + tree.seed) * .0015);
                const trunk = dx < .0012 * (.3 + t) ? 1 : 0, body = 1 - smoothstep(spread * .75, spread + 1 / width, dx);
                let a = Math.max(trunk * .8, body) * (1 - smoothstep(.96, 1, t));
                a *= .58 + .42 * hash(x, y, tree.seed);
                put(layers[2], y * width + x, tree.dark ? colors.dark : colors.tree, a * (.35 + t * .28));
                // Broken, pale reflections use the same shape, attenuated and horizontally disturbed.
                const ry = Math.round((tree.base * 2 - v) * height), rx = Math.round(x + Math.sin(ry * .6 + tree.seed) * 3);
                if (ry < height * .84 && rx >= 0 && rx < width && ry >= 0 && ry < height && hash(ry, tree.seed, 1) > .32)
                    put(layers[1], ry * width + rx, colors.tree, a * .065 * (1 - t));
            }
    }
    // Foreground reeds and scattered granulation, made from pigment rather than a bitmap overlay.
    for (let j = 0; j < 90; j++) {
        const u = .12 + random() * .75, v = .79 + random() * .048, h = .005 + random() * .025;
        for (let s = 0; s < 20; s++) {
            const x = Math.round((u + (s / 20) ** 2 * (random() - .5) * .004) * width), y = Math.round((v - s / 20 * h) * height);
            if (x >= 0 && y >= 0 && x < width && y < height)
                put(layers[2], y * width + x, j % 3 ? colors.gold : colors.tree, .2);
        }
    }
    return { name: warm ? 'Autumn stillness' : 'Quiet morning', layerNames: ['Atmosphere & light', 'Distant ridges', 'Pines & shoreline'], fields: layers };
}
