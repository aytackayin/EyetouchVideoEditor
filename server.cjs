// Eyetouch Video Editor — bağımlılıksız üretim sunucusu.
// dist/ klasörünü yerel olarak sunar (SPA geri dönüşlü).
// Kullanım: node server.cjs  → ilk satırda "PORT:<n>" yazar (5173'ten başlar,
// meşgulse bir sonraki boş portu dener). Tepsi uygulaması (Eyetouch.exe)
// bu sunucuyu gizli pencerede çalıştırır.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'dist');
const PORT_BASE = 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base) ? p : null;
}

function serve(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = safeJoin(ROOT, url === '/' ? 'index.html' : url);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // SPA geri dönüşü
    file = path.join(ROOT, 'index.html');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bulunamadi');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      // ffmpeg.wasm (SharedArrayBuffer) icin zorunlu
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    };
    // index her zaman taze gelsin — güncellemeler anında etkili olur
    if (ext === '.html') headers['Cache-Control'] = 'no-store';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

function listen(port) {
  const srv = http.createServer(serve);
  srv.on('error', () => {
    if (port < PORT_BASE + 10) listen(port + 1);
    else {
      console.error('PORT:NONE');
      process.exit(1);
    }
  });
  srv.listen(port, '127.0.0.1', () => {
    console.log('PORT:' + port);
  });
}

listen(PORT_BASE);

// Güvenlik ağı: tepsi uygulaması zorla kapatılırsa (çökme/taskkill) bu sunucu
// kendini kapatır — yetim süreç kalmasın.
const parentPid = process.env.EYETOUCH_PARENT ? parseInt(process.env.EYETOUCH_PARENT, 10) : 0;
if (parentPid > 0) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      process.exit(0);
    }
  }, 2000).unref();
}
