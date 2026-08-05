import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { handleMessage, handleClose, sweepRooms, roomCount } from './rooms.js';

const PORT = Number(process.env.PORT) || 8787;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Serve the built client. In dev, Vite serves it instead and proxies /ws here. */
function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);
  let filePath = path.join(DIST, pathname === '/' ? 'index.html' : pathname);

  if (!filePath.startsWith(DIST)) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end('Forbidden');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    // A real 404 rather than the app shell: soft 404s get pages indexed as
    // duplicates of the home page.
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('Client not built yet. Run: npm run build');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 — not found');
    return;
  }

  // Vite fingerprints everything under /assets/, so those can be cached forever.
  // Everything else — above all index.html, which names those fingerprints —
  // must revalidate, or a deploy leaves browsers on the previous bundle.
  const immutable = pathname.startsWith('/assets/');
  res.writeHead(200, {
    'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
    'cache-control': immutable
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate',
    'x-content-type-options': 'nosniff',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: roomCount() }));
    return;
  }
  serveStatic(req, res);
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    try {
      handleMessage(ws, data.toString());
    } catch (err) {
      console.error('handler error:', err);
    }
  });
  ws.on('close', () => handleClose(ws));
  ws.on('error', () => handleClose(ws));
});

// Drop sockets that stopped responding, and reap abandoned rooms.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
  sweepRooms();
}, 30_000).unref();

function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => `http://${n.address}:${PORT}`);
}

// No host argument on purpose: Node then binds to :: in dual-stack mode, which
// accepts IPv4 (what Render's router uses) and IPv6 (what fly-proxy uses).
// Pinning this to '0.0.0.0' would break the IPv6 case.
server.listen(PORT, () => {
  console.log(`\n  GuessRack server on http://localhost:${PORT}`);
  for (const addr of localAddresses()) console.log(`  On your network:   ${addr}`);
  console.log('');
});

// Fly sends SIGTERM before replacing or stopping a machine. Close sockets
// deliberately so clients see a clean close and run their reconnect backoff,
// rather than hanging until the next heartbeat.
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, closing ${wss.clients.size} connection(s)`);
    for (const ws of wss.clients) ws.close(1012, 'server restarting');
    wss.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
