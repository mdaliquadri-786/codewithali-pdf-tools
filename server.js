/**
 * CodeWithAli PDF Tools Suite
 * Main Application Server
 * Built with Node.js, Express, and modern web architecture.
 */

const path = require('path');
const fs = require('fs');

let express;
try {
  express = require('express');
} catch (e) {
  const mini = require('./utils/miniExpress');
  express = mini.express;
}

const pdfRoutes = require('./routes/pdfRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories setup
const os = require('os');
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.FIREBASE_CONFIG);
const UPLOADS_DIR = isServerless ? path.join(os.tmpdir(), 'cwa_uploads') : path.join(__dirname, 'uploads');
const OUTPUTS_DIR = isServerless ? path.join(os.tmpdir(), 'cwa_outputs') : path.join(__dirname, 'outputs');
const PUBLIC_DIR = path.join(__dirname, 'public');

[UPLOADS_DIR, OUTPUTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Basic CORS header helper for wide browser client compatibility
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public/
app.use(express.static(PUBLIC_DIR));
app.use('/public', express.static(PUBLIC_DIR));
app.use('/codewithali-pdf-tools/public', express.static(PUBLIC_DIR));

// Mount PDF API Routes
app.use('/api/pdf', pdfRoutes);
const contactRoutes = require('./routes/contact');
app.use('/api/contact', contactRoutes);

// Tool page route helper
app.get('/tools/:tool', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'tool.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'CodeWithAli PDF Tools Suite',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Storage Cleanup
const FILE_EXPIRY_MS = 60 * 60 * 1000; // 1 Hour

function cleanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  fs.readdir(dirPath, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach((file) => {
      const fullPath = path.join(dirPath, file);
      fs.stat(fullPath, (statErr, stats) => {
        if (statErr) return;
        if (stats.isDirectory()) {
          if (now - stats.ctimeMs > FILE_EXPIRY_MS) {
            fs.rm(fullPath, { recursive: true, force: true }, () => {});
          }
        } else if (stats.isFile()) {
          if (now - stats.ctimeMs > FILE_EXPIRY_MS) {
            fs.unlink(fullPath, () => {});
          }
        }
      });
    });
  });
}

function runStorageCleanup() {
  cleanDirectory(UPLOADS_DIR);
  cleanDirectory(OUTPUTS_DIR);
}

const cleanupTimer = setInterval(runStorageCleanup, 30 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();
runStorageCleanup();

app.use((req, res) => {
  const requestPath = req.urlPath || req.path || '';
  if (requestPath.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  // SPA fallback: serve the homepage for unknown GET pages. The old check used
  // req.accepts(), which the zero-dependency fallback server never implements,
  // so unknown pages got a JSON 404 instead of the app shell.
  if ((req.method === 'GET' || req.method === 'HEAD') && (typeof req.accepts !== 'function' || req.accepts('html'))) {
    return res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  res.status(404).json({ error: 'Endpoint not found' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`======================================================`);
    console.log(` 🚀 CodeWithAli PDF Tools Suite Server is LIVE!`);
    console.log(` 🌐 URL: http://localhost:${PORT}`);
    console.log(` 🛠️  Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(` 🧹 Storage Auto-Cleanup Active (1h retention)`);
    console.log(`======================================================`);
  });
}

module.exports = app;
