#!/usr/bin/env node
/**
 * static-serve.js - throwaway static file server for eyeballing public/
 * locally without booting the full app (which wants Postgres).
 *
 *   node tools/static-serve.js public 8099
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || 'public');
const PORT = Number(process.argv[3] || 8099);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

http.createServer(function (req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); return res.end('404 ' + p); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', function () {
  console.log('serving ' + ROOT + ' on http://127.0.0.1:' + PORT);
});
