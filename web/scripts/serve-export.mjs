#!/usr/bin/env node
// Serves the static export for the e2e suite, routed the way the Go handler routes it.
// Builds the export first when it is missing. No backend: API paths answer 404.
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(process.env.XRDB_EXPORT_DIR ?? path.join(webDir, '../internal/ui/dist'));
const port = Number(process.env.PORT ?? 3002);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

if (!existsSync(path.join(root, 'index.html'))) {
  console.error(`No export at ${root}, building it first`);
  const build = spawnSync('npm', ['run', 'build'], { cwd: webDir, stdio: 'inherit' });
  if (build.status !== 0) {
    console.error('The export build failed');
    process.exit(1);
  }
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

// Mirrors internal/server's static handler: dotted paths are files, "/" is
// index.html, "/slug" is slug.html. Unknown routes 404 instead of falling back
// to index.html, since here they are API calls with no backend to answer them.
function resolve(urlPath) {
  const rel = path.posix.normalize(decodeURIComponent(urlPath)).replace(/^\/+/, '');
  if (rel === '' || rel === '.') return 'index.html';
  if (rel.includes('.')) return rel;
  return `${rel}.html`;
}

function send(req, res, status, file) {
  res.writeHead(status, {
    'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file)
    .on('error', err => {
      console.error(`Failed to read ${file}: ${err.message}`);
      res.destroy(err);
    })
    .pipe(res);
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let file;
  try {
    file = path.join(root, resolve(new URL(req.url, 'http://x').pathname));
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (file.startsWith(root + path.sep) && isFile(file)) return send(req, res, 200, file);
  const notFound = path.join(root, '404.html');
  if (isFile(notFound)) return send(req, res, 404, notFound);
  res.writeHead(404).end();
});

server.on('error', err => {
  console.error(`The export server failed: ${err.message}`);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.error(`Serving the XRDB export from ${root} on http://127.0.0.1:${port}`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
