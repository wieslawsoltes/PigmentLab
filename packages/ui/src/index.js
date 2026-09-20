import { clamp, Signal } from '@pigmentlab/core';
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const paths = {
    brush: 'm15 4 5-2-2 5-8 8-3-3 8-8M6 14c-4 0-2 6-5 6 5 2 9-1 8-4',
    drop: 'M12 2C9 7 5 10 5 14a7 7 0 0 0 14 0c0-4-4-7-7-12Zm-3 13a3 3 0 0 0 3 3',
    pencil: 'm4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4M4 16l4 4',
    oil: 'm14 3 7 7-12 12H3v-6L14 3Zm-8 13 4 4M12 6l6 6',
    ink: 'm12 2 7 12-7 8-7-8 7-12Zm0 0v11m-2 1a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
    erase: 'm4 12 8-9 9 8-9 10H8l-4-4a4 4 0 0 1 0-5Zm3-3 9 8M11 21h10',
    blend: 'M4 13c0-5 7-5 7 0s9 5 9-1M7 5h.01M5 19h.01M18 4h.01M19 20h.01',
    knife: 'm19 3 2 2-9 10-4-4 11-8ZM8 11l4 4-7 6-3-3 6-7',
    water: 'M12 2C8 7 6 10 6 14a6 6 0 0 0 12 0c0-4-2-7-6-12M9 14h6m-3-3v6',
    dryer: 'M8 3c-4 3 4 5 0 8m5-8c-4 3 4 5 0 8m5-8c-4 3 4 5 0 8M5 15h14M4 19h16',
    wind: 'M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h5a3 3 0 1 1-3 3',
    mask: 'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4ZM8 12l3 3 5-6',
    select: 'M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6',
    lasso: 'M18 16c3-2 5-8 1-11C15 1 6 3 3 7s1 10 7 11 10-3 6-5-8 5-4 9',
    circle: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    fill: 'm12 2 8 8-10 10-8-8L12 2Zm-8 12h12m4 2c-2 3-2 5 0 5s2-2 0-5',
    picker: 'm14 3 7 7m-8-3 4 4-10 10H3v-4L13 7Zm3-3 3-3 4 4-3 3',
    hand: 'M8 12V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v8c0 6-3 8-7 8-3 0-5-2-7-5l-4-5a2 2 0 0 1 3-3l3 3Z',
    move: 'M12 2v20M2 12h20M8 6l4-4 4 4M6 8l-4 4 4 4m2 2 4 4 4-4m2-10 4 4-4 4',
    undo: 'M9 4 3 10l6 6M3 10h11a7 7 0 0 1 0 14',
    redo: 'm15 4 6 6-6 6m6-6H10a7 7 0 0 0 0 14',
    plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', close: 'm6 6 12 12M6 18 18 6',
    chevron: 'm8 5 7 7-7 7', down: 'm6 9 6 6 6-6', up: 'm6 15 6-6 6 6',
    save: 'M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-8h10v8',
    folder: 'M3 6h7l2 3h9v12H3V6Zm0 4V3h7l2 3h8v3',
    export: 'M12 3v12m-5-7 5-5 5 5M4 14v7h16v-7',
    new: 'M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 14h8m-4-4v8',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm7 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
    hidden: 'm3 3 18 18M8 5a12 12 0 0 1 4 0c6 0 10 7 10 7l-3 4M5 7l-3 5s4 7 10 7h3',
    lock: 'M6 11h12v10H6V11Zm2 0V6a4 4 0 1 1 8 0v5',
    unlock: 'M6 11h12v10H6V11Zm2 0V6a4 4 0 0 1 8 0',
    layers: 'm12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
    copy: 'M8 8h13v13H8V8ZM4 16H2V2h14v2',
    sun: 'M12 3v-2m0 22v-2M3 12H1m22 0h-2M5 5 3 3m18 18-2-2M5 19l-2 2M21 3l-2 2M7 12a5 5 0 1 0 10 0 5 5 0 0 0-10 0',
    moon: 'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z',
    pause: 'M8 4v16M16 4v16', play: 'm6 3 15 9-15 9V3',
    fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8z',
    grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
    mirror: 'M12 2v20M8 6l-6 6 6 6V6Zm8 0 6 6-6 6V6',
    rotate: 'M20 8A8 8 0 1 0 21 14M20 2v6h-6',
    help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 4h.01M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0',
    settings: 'm9 3-1 3-3 1-2 5 3 2 1 4 5 3 3-3 4-1 2-5-3-3-1-4-5-2-3 0Zm0 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
    image: 'M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5M14 7h.01',
    history: 'M3 4v6h6M3 10a9 9 0 1 1 1 8M12 7v6l4 2',
    info: 'M12 11v6m0-10h.01M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0',
    check: 'm4 12 5 5L20 6', record: 'M6 12a6 6 0 1 0 12 0 6 6 0 0 0-12 0',
    stop: 'M5 5h14v14H5z', keyboard: 'M2 5h20v14H2V5Zm3 4h.01m4 0h.01m4 0h.01m4 0h.01M5 13h.01m4 0h.01m4 0h.01m4 0h.01M8 16h8',
    palette: 'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5c6 0 2-10-6-10ZM7 8h.01m5-2h.01m5 2h.01M5 13h.01',
    spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7',
    status: 'M5 12h2l3-7 4 14 3-7h2'
};
export function icon(name, size = 18) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.brush}"/></svg>`; }
export function button(name, label, extra = '') { let classes = 'icon-button'; extra = extra.replace(/class="([^"]*)"/, (_, value) => { classes = value; return ''; }); return `<button type="button" class="${classes}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}" ${extra}>${icon(name)}</button>`; }
export class CommandRegistry {
    constructor() { this.commands = new Map(); this.changed = new Signal(); }
    register(id, { label, shortcut = '', enabled = () => true, run }) { if (this.commands.has(id))
        throw new Error(`Duplicate command ${id}`); this.commands.set(id, { id, label, shortcut, enabled, run }); return this; }
    async invoke(id, args) { const cmd = this.commands.get(id); if (!cmd)
        throw new Error(`Unknown command ${id}`); if (!cmd.enabled())
        return false; return cmd.run(args); }
    list() { return [...this.commands.values()].map(({ id, label, shortcut, enabled }) => ({ id, label, shortcut, enabled: enabled() })); }
    bind(root = document, onError = console.error) { root.addEventListener('click', e => { const el = e.target.closest('[data-command]'); if (el && !el.disabled) {
        this.invoke(el.dataset.command).catch(onError);
    } }); }
}
export function toast(message, type = 'info', duration = 3600) { let area = $('#toasts'); if (!area) {
    area = document.createElement('div');
    area.id = 'toasts';
    area.setAttribute('aria-live', 'polite');
    document.body.append(area);
} const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = message; area.append(el); setTimeout(() => el.remove(), duration); }
export function dialog({ title, body, submit = 'Apply', cancel = 'Cancel', wide = false, initialize }) {
    return new Promise(resolve => {
        const el = document.createElement('dialog');
        el.className = wide ? 'dialog wide' : 'dialog';
        el.innerHTML = `<form method="dialog"><header><h2>${escapeHTML(title)}</h2><button value="cancel" formnovalidate class="icon-button" aria-label="Close">${icon('close')}</button></header><div class="dialog-body">${body}</div><footer><button class="button" value="cancel" formnovalidate>${escapeHTML(cancel)}</button>${submit ? `<button class="button primary" value="apply">${escapeHTML(submit)}</button>` : ''}</footer></form>`;
        document.body.append(el);
        initialize?.(el);
        el.addEventListener('close', () => { const values = Object.fromEntries(new FormData($('form', el))); resolve(el.returnValue === 'apply' ? values : null); el.remove(); }, { once: true });
        el.showModal();
    });
}
export function range(label, name, value, min, max, step = 1, unit = '') { return `<label class="range-field"><span>${escapeHTML(label)}<output data-output="${name}">${value}${unit}</output></span><input type="range" name="${name}" data-range="${name}" aria-label="${escapeHTML(label)}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`; }
export function bindRanges(root, onChange) { for (const el of $$('[data-range]', root)) {
    const output = $(`[data-output="${el.dataset.range}"]`, root);
    el.addEventListener('input', () => { if (output)
        output.value = el.value; onChange?.(el.dataset.range, Number(el.value), el); });
} }
/** Invertible view transform; all input is mapped from client coordinates into unrotated document space. */
export class Viewport {
    constructor(stage, paper, width, height) { this.stage = stage; this.paper = paper; this.width = width; this.height = height; this.zoom = 1; this.rotation = 0; this.panX = 0; this.panY = 0; this.changed = new Signal(); }
    update() { this.paper.style.width = this.width + 'px'; this.paper.style.height = this.height + 'px'; this.paper.style.transform = `translate(-50%,-50%) translate(${this.panX}px,${this.panY}px) rotate(${this.rotation}rad) scale(${this.zoom})`; this.changed.emit(this); }
    fit() { const r = this.stage.getBoundingClientRect(), c = Math.abs(Math.cos(this.rotation)), s = Math.abs(Math.sin(this.rotation)); this.zoom = clamp(Math.min((r.width - (r.width < 600 ? 32 : 100)) / (this.width * c + this.height * s), (r.height - 112) / (this.height * c + this.width * s)), .05, 4); this.panX = this.panY = 0; this.update(); }
    toWorld(clientX, clientY) { const r = this.stage.getBoundingClientRect(), x = clientX - r.left - r.width / 2 - this.panX, y = clientY - r.top - r.height / 2 - this.panY, c = Math.cos(this.rotation), s = Math.sin(this.rotation); return { x: (x * c + y * s) / this.zoom + this.width / 2, y: (-x * s + y * c) / this.zoom + this.height / 2 }; }
    zoomAt(zoom, clientX, clientY) { const before = this.toWorld(clientX, clientY), old = this.zoom; this.zoom = clamp(zoom, .05, 16); const x = before.x - this.width / 2, y = before.y - this.height / 2, c = Math.cos(this.rotation), s = Math.sin(this.rotation); this.panX -= (x * c - y * s) * (this.zoom - old); this.panY -= (x * s + y * c) * (this.zoom - old); this.update(); }
    rotate(angle) { this.rotation = angle; this.update(); }
    pan(x, y) { this.panX += x; this.panY += y; this.update(); }
    centerOn(x, y) { const c = Math.cos(this.rotation), s = Math.sin(this.rotation), dx = x - this.width / 2, dy = y - this.height / 2; this.panX = -(dx * c - dy * s) * this.zoom; this.panY = -(dx * s + dy * c) * this.zoom; this.update(); }
}
export class CanvasInput {
    constructor(stage, viewport, { begin, move, end, hover, canPaint = () => true, hand = () => false }) {
        this.stage = stage;
        this.viewport = viewport;
        this.handlers = { begin, move, end, hover, canPaint, hand };
        this.pointers = new Map();
        this.space = false;
        this.painting = false;
        this.panning = false;
        stage.addEventListener('contextmenu', e => e.preventDefault());
        stage.addEventListener('pointerdown', e => this.down(e));
        stage.addEventListener('pointermove', e => this.move(e));
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
            stage.addEventListener(type, e => this.up(e));
        stage.addEventListener('wheel', e => { if (e.target.closest('button,input,select'))
            return; e.preventDefault(); viewport.zoomAt(viewport.zoom * Math.exp(-e.deltaY * .0016), e.clientX, e.clientY); }, { passive: false });
        this.keyDown = e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) {
            this.space = true;
            e.preventDefault();
            stage.classList.add('hand-cursor');
        } };
        this.keyUp = e => { if (e.code === 'Space') {
            this.space = false;
            stage.classList.remove('hand-cursor');
        } };
        window.addEventListener('keydown', this.keyDown);
        window.addEventListener('keyup', this.keyUp);
        window.addEventListener('blur', () => { this.space = false; if (this.painting)
            this.handlers.end(null, true); this.painting = false; this.panning = false; this.pointers.clear(); });
    }
    point(e) { return { ...this.viewport.toWorld(e.clientX, e.clientY), pressure: e.pointerType === 'pen' ? Math.max(.03, e.pressure) : .65, tiltX: e.tiltX || 0, tiltY: e.tiltY || 0, shift: e.shiftKey, alt: e.altKey, pointerType: e.pointerType }; }
    down(e) {
        if (e.target.closest('button,input,select,a') || e.button === 2)
            return;
        if (e.pointerType === 'touch' && [...this.pointers.values()].some(p => p.type === 'pen'))
            return;
        e.preventDefault();
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
        this.stage.setPointerCapture(e.pointerId);
        if (this.pointers.size > 1) {
            if (this.painting)
                this.handlers.end(null, false);
            this.painting = false;
            this.panning = false;
            this.gesture = this.gestureState();
            return;
        }
        this.last = { x: e.clientX, y: e.clientY };
        this.panning = this.space || this.handlers.hand() || e.button === 1;
        if (this.panning)
            return;
        const p = this.point(e);
        if (p.x < 0 || p.y < 0 || p.x >= this.viewport.width || p.y >= this.viewport.height || !this.handlers.canPaint())
            return;
        this.painting = true;
        this.handlers.begin(p, e);
    }
    gestureState() { const [a, b] = [...this.pointers.values()]; if (!b)
        return null; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) }; }
    move(e) {
        this.handlers.hover?.(this.point(e), e);
        if (!this.pointers.has(e.pointerId))
            return;
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
        if (this.pointers.size > 1) {
            const next = this.gestureState();
            if (this.gesture && next) {
                this.viewport.zoomAt(this.viewport.zoom * next.distance / Math.max(1, this.gesture.distance), next.x, next.y);
                this.viewport.pan(next.x - this.gesture.x, next.y - this.gesture.y);
                this.viewport.rotate(this.viewport.rotation + next.angle - this.gesture.angle);
            }
            this.gesture = next;
            return;
        }
        if (this.panning) {
            this.viewport.pan(e.clientX - this.last.x, e.clientY - this.last.y);
            this.last = { x: e.clientX, y: e.clientY };
            return;
        }
        if (this.painting) {
            const points = e.getCoalescedEvents?.();
            for (const event of points?.length ? points : [e])
                this.handlers.move(this.point(event), event);
        }
    }
    up(e) { if (!this.pointers.has(e.pointerId))
        return; this.pointers.delete(e.pointerId); if (this.painting) {
        this.painting = false;
        this.handlers.end(this.point(e), e.type === 'pointercancel');
    } this.panning = false; this.gesture = null; if (this.stage.hasPointerCapture(e.pointerId))
        this.stage.releasePointerCapture(e.pointerId); }
}
