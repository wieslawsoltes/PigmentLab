import { clamp, lerp } from '@pigmentlab/core';
/** Three-band Kubelka–Munk surrogate, NOT measured spectral pigment data. */
export const srgbToLinear = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
export const linearToSrgb = v => v <= .0031308 ? 12.92 * Math.max(v, 0) : 1.055 * Math.max(v, 0) ** (1 / 2.4) - .055;
export function hexToRgb(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex))
        throw new TypeError('Expected a six-digit hex color.');
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)].map(v => v / 255);
}
export const rgbToHex = rgb => '#' + rgb.map(v => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('');
export function rgbToKS(rgb) { return rgb.map(v => { const r = Math.max(.008, srgbToLinear(clamp(v))); return (1 - r) ** 2 / (2 * r); }); }
export function ksToRgb(ks) { return ks.map(k => { k = Math.max(k, 0); /* Rational form avoids catastrophic cancellation for large K/S. */ /* Rational form avoids catastrophic cancellation for large K/S. */ return clamp(linearToSrgb(1 / (1 + k + Math.sqrt(k * k + 2 * k)))); }); }
export const hexToKS = hex => rgbToKS(hexToRgb(hex));
export function mixPigments(a, b, ratio = .5) { const ak = rgbToKS(a), bk = rgbToKS(b); return ksToRgb(ak.map((v, i) => lerp(v, bk[i], clamp(ratio)))); }
export function hsvToRgb(h, s, v) { const f = n => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)]; }
export function rgbToHsv([r, g, b]) { const v = Math.max(r, g, b), d = v - Math.min(r, g, b); let h = 0; if (d)
    h = v === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : v === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6; return [h, v ? d / v : 0, v]; }
/** Studio swatches are illustrative display colors, not manufacturer pigment measurements. */
export const PALETTE = [
    ['Titanium white', '#faf7ef', 'PW6'], ['Lemon yellow', '#f2d753', 'PY3'], ['Yellow ochre', '#cba153', 'PY43'], ['Raw sienna', '#b9844b', 'PBr7'],
    ['Burnt sienna', '#ad5941', 'PBr7'], ['Vermilion', '#df5e4d', 'PR255'], ['Quinacridone rose', '#b34462', 'PV19'], ['Alizarin crimson', '#862f4b', 'PR83'],
    ['Dioxazine violet', '#674879', 'PV23'], ['Ultramarine', '#435d92', 'PB29'], ['Cobalt blue', '#538caf', 'PB28'], ['Cerulean blue', '#59a9bc', 'PB35'],
    ['Viridian', '#328d7d', 'PG18'], ['Sap green', '#718259', 'PG7'], ['Forest green', '#355e50', 'PG36'], ['Payne’s gray', '#394956', 'PBk6'],
    ['Raw umber', '#77614c', 'PBr7'], ['Burnt umber', '#6d483c', 'PBr7'], ['Ivory black', '#292c2e', 'PBk9'], ['Indigo', '#304f69', 'PB66']
].map(([name, hex, code]) => ({ name, hex, code, ks: hexToKS(hex) }));
export function cellColor(data, offset) {
    const m = data[offset + 8] + data[offset + 9];
    if (m < 1e-6)
        return [0, 0, 0, 0];
    const rgb = ksToRgb([0, 1, 2].map(k => (data[offset + k] + data[offset + 4 + k]) / m));
    return [...rgb, 1 - Math.exp(-m * 1.8)];
}
export function blendChannel(back, front, mode) {
    switch (mode) {
        case 'multiply': return back * front;
        case 'screen': return back + front - back * front;
        case 'overlay': return back <= .5 ? 2 * back * front : 1 - 2 * (1 - back) * (1 - front);
        case 'darken': return Math.min(back, front);
        case 'lighten': return Math.max(back, front);
        default: return front;
    }
}
