const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HTTP_PORT = 8080;
const HTTPS_PORT = 8443;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '192.168.1.27';
}

function handleRequest(req, res) {
  try {
    let reqUrl = decodeURI(req.url.split('?')[0]);
    if (reqUrl.endsWith('/')) {
      reqUrl += 'index.html';
    }

    let filePath = path.join(ROOT_DIR, reqUrl);

    // Prevent directory traversal
    if (!filePath.startsWith(ROOT_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    // If path is a directory without trailing slash, redirect or serve index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>404 Not Found</h1><p>The requested file <code>${reqUrl}</code> does not exist.</p>`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // CORS & Cache Headers
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('500 Internal Server Error: ' + err.message);
  }
}

// 1. Start HTTP Server
const httpServer = http.createServer(handleRequest);
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`\n======================================================`);
  console.log(`🚀 HTTP Server running:`);
  console.log(`   - Local PC:   http://localhost:${HTTP_PORT}/`);
  console.log(`   - POS App:    http://localhost:${HTTP_PORT}/pos/`);
  console.log(`   - Mobile LAN: http://${localIp}:${HTTP_PORT}/`);
  console.log(`   - Mobile POS: http://${localIp}:${HTTP_PORT}/pos/`);
  console.log(`======================================================\n`);
});

// 2. Start HTTPS Server (Required for camera access on mobile phones)
const keyPath = path.join(ROOT_DIR, 'server.key');
const certPath = path.join(ROOT_DIR, 'server.crt');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };

  const httpsServer = https.createServer(options, handleRequest);
  httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log(`🔒 HTTPS Server running (Enables Mobile Camera Access):`);
    console.log(`   - Local PC:   https://localhost:${HTTPS_PORT}/`);
    console.log(`   - POS App:    https://localhost:${HTTPS_PORT}/pos/`);
    console.log(`   - Mobile LAN: https://${localIp}:${HTTPS_PORT}/`);
    console.log(`   - Mobile POS: https://${localIp}:${HTTPS_PORT}/pos/`);
    console.log(`======================================================\n`);
  });
}
