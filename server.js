const http = require('http');
const fs = require('fs');
const path = require('path');
const { resolveSecret } = require('./backend/auth');
const { createStore } = require('./backend/db');
const { createApiHandler } = require('./backend/routes');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');

const authSecret = resolveSecret(DATA_DIR);
const store = createStore(DATA_DIR);
const handleApiRequest = createApiHandler(store, authSecret);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const BLOCKED_PREFIXES = ['/backend', '/data', '/.git'];
const BLOCKED_FILES = new Set(['/server.js', '/package.json', '/package-lock.json', '/.gitignore']);

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const reqPath = urlObj.pathname;

  if (reqPath.startsWith('/api/')) {
    await handleApiRequest(req, res, urlObj);
    return;
  }

  const normalizedRel = path.posix.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  if (
    BLOCKED_FILES.has(normalizedRel) ||
    BLOCKED_PREFIXES.some((prefix) => normalizedRel === prefix || normalizedRel.startsWith(`${prefix}/`))
  ) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Não Encontrado');
    return;
  }

  const targetFile = normalizedRel === '/' ? 'index.html' : normalizedRel.replace(/^\/+/, '');
  const filePath = path.join(ROOT, targetFile);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acesso negado');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Não Encontrado');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Servidor Aplika rodando em http://localhost:${PORT} (banco: ${store.engine})`);
    console.log(`Landing page: http://localhost:${PORT}/`);
    console.log(`Login/Cadastro: http://localhost:${PORT}/login.html`);
    console.log(`Escolas: http://localhost:${PORT}/escolas.html`);
    console.log(`Painel: http://localhost:${PORT}/app.html`);
    console.log(`Contratação: http://localhost:${PORT}/contratar.html`);
  });
}

module.exports = { server, store };
