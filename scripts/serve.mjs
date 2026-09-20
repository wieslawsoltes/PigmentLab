import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(process.argv.includes('--dist') ? 'dist' : fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || process.argv.find(v => /^--port=/.test(v))?.split('=')[1] || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.pigment': 'application/octet-stream' };
http.createServer((req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost'), relative = decodeURIComponent(url.pathname);
        const target = path.resolve(root, '.' + relative + (relative.endsWith('/') ? 'index.html' : ''));
        if (target !== root && !target.startsWith(root + path.sep)) {
            res.writeHead(403).end();
            return;
        }
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
            res.writeHead(404).end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        fs.createReadStream(target).pipe(res);
    }
    catch (error) {
        res.writeHead(400).end('Invalid request');
    }
}).listen(port, '0.0.0.0', () => console.log(`PigmentLab: http://localhost:${port}`));
