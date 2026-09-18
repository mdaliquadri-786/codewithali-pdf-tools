/**
 * Zero-dependency lightweight Express & Multer compatibility layer.
 * Allows CodeWithAli PDF Tools Suite to run out-of-the-box in restricted
 * or offline environments, while transparently using real express/multer
 * when npm packages are installed.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

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
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8'
};

function parseMultipart(buffer, boundary, uploadDir) {
  const boundaryBuffer = Buffer.from('--' + boundary);
  const endBoundaryBuffer = Buffer.from('--' + boundary + '--');
  const files = [];
  const fields = {};

  let start = 0;
  while (start < buffer.length) {
    const boundaryIdx = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIdx === -1) break;

    const nextBoundaryIdx = buffer.indexOf(boundaryBuffer, boundaryIdx + boundaryBuffer.length);
    if (nextBoundaryIdx === -1) break;

    const part = buffer.subarray(boundaryIdx + boundaryBuffer.length, nextBoundaryIdx);
    const headerEndIdx = part.indexOf('\r\n\r\n');
    if (headerEndIdx === -1) {
      start = nextBoundaryIdx;
      continue;
    }

    const headerStr = part.subarray(0, headerEndIdx).toString('utf-8');
    let body = part.subarray(headerEndIdx + 4);
    // Strip trailing \r\n before next boundary
    if (body.length >= 2 && body[body.length - 2] === 13 && body[body.length - 1] === 10) {
      body = body.subarray(0, body.length - 2);
    }

    const dispositionMatch = headerStr.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
    if (dispositionMatch) {
      const fieldName = dispositionMatch[1];
      const filename = dispositionMatch[2];

      if (filename !== undefined) {
        // It's a file
        const ext = path.extname(filename);
        const uniqueName = Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext;
        const savePath = path.join(uploadDir, uniqueName);
        fs.writeFileSync(savePath, body);

        const typeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
        const mimetype = typeMatch ? typeMatch[1].trim() : 'application/octet-stream';

        files.push({
          fieldname: fieldName,
          originalname: filename,
          filename: uniqueName,
          path: savePath,
          size: body.length,
          mimetype: mimetype
        });
      } else {
        // Regular field
        fields[fieldName] = body.toString('utf-8');
      }
    }

    start = nextBoundaryIdx;
  }

  return { files, fields };
}

function createRouter() {
  const routes = [];

  const router = function (req, res, next) {
    let idx = 0;
    function runNext() {
      if (idx >= routes.length) return next ? next() : null;
      const r = routes[idx++];
      if (r.method && r.method !== req.method) return runNext();

      let isMatch = false;
      const params = {};

      if (r.path === '*' || r.path === req.urlPath) {
        isMatch = true;
      } else if (r.path.includes(':')) {
        const rParts = r.path.split('/');
        const uParts = req.urlPath.split('/');
        if (rParts.length === uParts.length) {
          isMatch = true;
          for (let i = 0; i < rParts.length; i++) {
            if (rParts[i].startsWith(':')) {
              params[rParts[i].slice(1)] = uParts[i];
            } else if (rParts[i] !== uParts[i]) {
              isMatch = false;
              break;
            }
          }
        }
      } else if (req.urlPath.startsWith(r.path)) {
        isMatch = true;
      }

      if (isMatch) {
        req.params = Object.assign(req.params || {}, params);
        if (r.method === null && r.path !== '*' && typeof r.handler === 'function') {
          const oldUrlPath = req.urlPath;
          req.urlPath = oldUrlPath.slice(r.path.length) || '/';
          r.handler(req, res, () => {
            req.urlPath = oldUrlPath;
            runNext();
          });
        } else {
          r.handler(req, res, runNext);
        }
      } else {
        runNext();
      }
    }
    runNext();
  };

  router.routes = routes;
  ['get', 'post', 'put', 'delete', 'use'].forEach((method) => {
    router[method] = function (...args) {
      let routePath = '*';
      let handlers = args;
      if (typeof args[0] === 'string') {
        routePath = args[0];
        handlers = args.slice(1);
      }
      handlers.forEach((h) => {
        routes.push({
          method: method === 'use' ? null : method.toUpperCase(),
          path: routePath,
          handler: h
        });
      });
    };
  });

  return router;
}

function express() {
  const rootRouter = createRouter();

  const app = function (req, res) {
    const parsedUrl = url.parse(req.url, true);
    req.urlPath = parsedUrl.pathname;
    req.query = parsedUrl.query;
    req.params = {};
    req.body = {};
    req.files = [];

    // Response helper decorators
    res.status = function (code) {
      res.statusCode = code;
      return res;
    };

    res.json = function (obj) {
      const data = JSON.stringify(obj);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(data);
    };

    res.send = function (content) {
      if (typeof content === 'object') {
        return res.json(content);
      }
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      }
      res.end(content);
    };

    res.sendFile = function (filePath) {
      if (!fs.existsSync(filePath)) {
        res.statusCode = 404;
        return res.end('File Not Found');
      }
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    };

    res.download = function (filePath, filename) {
      if (!fs.existsSync(filePath)) {
        res.statusCode = 404;
        return res.end('File Not Found');
      }
      const fname = filename || path.basename(filePath);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    };

    rootRouter(req, res, () => {
      // 404 default
      if (!res.writableEnded) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain');
        res.end('404 Not Found: ' + req.urlPath);
      }
    });
  };

  Object.assign(app, rootRouter);

  app.listen = function (port, callback) {
    const server = http.createServer(app);
    return server.listen(port, callback);
  };

  return app;
}

express.Router = createRouter;

express.static = function (staticDir) {
  return function (req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    let safeSuffix = path.normalize(req.urlPath).replace(/^(\.\.[\/\\])+/, '');
    if (safeSuffix === '/' || safeSuffix === '') safeSuffix = '/index.html';

    const fullPath = path.join(staticDir, safeSuffix);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return res.sendFile(fullPath);
    }
    next();
  };
};

express.json = function () {
  return function (req, res, next) {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('application/json')) return next();

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const bodyStr = Buffer.concat(chunks).toString('utf-8');
        req.body = bodyStr ? JSON.parse(bodyStr) : {};
      } catch (e) {
        req.body = {};
      }
      next();
    });
  };
};

express.urlencoded = function (options) {
  return function (req, res, next) {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('application/x-www-form-urlencoded')) return next();

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const bodyStr = Buffer.concat(chunks).toString('utf-8');
      const qs = require('querystring');
      req.body = qs.parse(bodyStr);
      next();
    });
  };
};

function multer(options = {}) {
  const uploadDir = options.dest || path.join(__dirname, '../uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  function middleware(req, res, next) {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('multipart/form-data')) return next();

    const match = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) return next();
    const boundary = (match[1] || match[2]).trim();

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const { files, fields } = parseMultipart(buffer, boundary, uploadDir);
      req.body = Object.assign(req.body || {}, fields);
      req.files = files;
      req.file = files.length > 0 ? files[0] : null;
      next();
    });
  }

  return {
    single: (name) => middleware,
    array: (name, maxCount) => middleware,
    fields: (fieldsArray) => middleware
  };
}

multer.diskStorage = function (config) {
  return config;
};

module.exports = {
  express,
  multer
};
