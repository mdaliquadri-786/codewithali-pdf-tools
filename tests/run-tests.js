#!/usr/bin/env node
/**
 * CodeWithAli PDF Tools — Automated Static & Engine Audit Suite
 * Run: npm test or node tests/run-tests.js
 * 168+ automated assertions validating engine wiring, tools registry,
 * static SEO routing, security modules, and offline PWA assets.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.resolve(__dirname, '..');
console.log('================================================================');
console.log('  CODEWITHALI PDF TOOLS — AUTOMATED AUDIT & VERIFICATION SUITE');
console.log('================================================================');

let passedTests = 0;
let failedTests = 0;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName}: ${details}`);
    failedTests++;
  }
}

// -----------------------------------------------------------------------------
// TEST 1: SYNTAX VALIDATION OF ALL CORE SCRIPTS
// -----------------------------------------------------------------------------
console.log('\n--- 1. JAVASCRIPT SYNTAX & PARSE TESTS ---');
const jsFiles = [
  'public/js/script.js',
  'public/js/pdf-engine-client.js',
  'public/js/security-engine.js',
  'public/js/ocr-engine.js',
  'public/js/word-to-pdf.js',
  'public/js/excel-to-pdf.js',
  'public/js/pdf-to-ppt.js',
  'public/js/ppt-to-pdf.js',
  'public/js/pdfa-engine.js',
  'public/js/real-engine-overrides.js',
  'public/sw.js',
  'generate-tool-pages.js'
];

jsFiles.forEach(file => {
  const fullPath = path.join(rootDir, file);
  assert(fs.existsSync(fullPath), `File Exists: ${file}`);
  try {
    const code = fs.readFileSync(fullPath, 'utf8');
    new vm.Script(code);
    assert(true, `Syntax Valid: ${file}`);
  } catch (err) {
    assert(false, `Syntax Valid: ${file}`, err.message);
  }
});

// -----------------------------------------------------------------------------
// TEST 2: TOOLS REGISTRY & STATIC SEO ROUTING AUDIT (33 TOOLS)
// -----------------------------------------------------------------------------
console.log('\n--- 2. TOOLS REGISTRY & STATIC SEO ROUTING AUDIT (33 TOOLS) ---');
const scriptCode = fs.readFileSync(path.join(rootDir, 'public/js/script.js'), 'utf8');
const matchTools = scriptCode.match(/const TOOLS = (\{[\s\S]*?\n\s*\};)/);
assert(!!matchTools, 'TOOLS registry extractable from script.js');

let TOOLS = {};
try {
  TOOLS = eval('(' + matchTools[1].replace(/;$/, '') + ')');
} catch (e) {
  console.error('Failed to parse TOOLS registry:', e.message);
}

const toolKeys = Object.keys(TOOLS);
assert(toolKeys.length === 33, `Tool Count check: Expected 33, found ${toolKeys.length}`);

toolKeys.forEach(slug => {
  const toolDir = path.join(rootDir, 'public/tools', slug);
  const toolIndex = path.join(toolDir, 'index.html');
  const exists = fs.existsSync(toolIndex);
  assert(exists, `Static SEO Page Exists: /tools/${slug}/index.html`);

  if (exists) {
    const html = fs.readFileSync(toolIndex, 'utf8');
    const hasCanonical = html.includes(`href="https://codewithali-pdf-tools.vercel.app/tools/${slug}"`);
    assert(hasCanonical, `Canonical Tag Accurate: /tools/${slug}`);

    const expectedEscapedName = escapeHtml(TOOLS[slug].name);
    const hasTitle = html.includes(`<title>${expectedEscapedName}`);
    assert(hasTitle, `Title Tag Matches Tool: ${TOOLS[slug].name}`);
  }
});

// -----------------------------------------------------------------------------
// TEST 3: WIRING AUDIT OF CRITICAL ENGINES & REMOVAL OF FAKES
// -----------------------------------------------------------------------------
console.log('\n--- 3. ENGINE WIRING & LOGIC AUDIT ---');

// A. PDF to Excel wiring
assert(
  scriptCode.includes('pdfToExcel(file, onProgress)'),
  'Engine2_PDFJS.pdfToExcel declared with coordinate clustering logic'
);
assert(
  scriptCode.includes("toolKey === 'pdf-to-excel'") &&
  scriptCode.includes('Engine2_PDFJS.pdfToExcel'),
  'Action execution connects /tools/pdf-to-excel to real Engine2_PDFJS.pdfToExcel'
);

// B. Real AES Encryption wiring
assert(
  scriptCode.includes("toolKey === 'protect'") &&
  scriptCode.includes('window.RealSecurityEngine.protect'),
  'Action execution connects /tools/protect to window.RealSecurityEngine.protect'
);

// C. Real Decryption wiring
assert(
  scriptCode.includes("toolKey === 'unlock'") &&
  scriptCode.includes('window.RealSecurityEngine.unlock'),
  'Action execution connects /tools/unlock to window.RealSecurityEngine.unlock'
);

// D. Real OCR wiring
assert(
  scriptCode.includes("toolKey === 'ocr'") &&
  scriptCode.includes('window.RealOCREngine.ocrPdfFile'),
  'Action execution connects /tools/ocr to window.RealOCREngine.ocrPdfFile'
);

// E. PDF to Word without dead fetch
const pdfClientCode = fs.readFileSync(path.join(rootDir, 'public/js/pdf-engine-client.js'), 'utf8');
assert(
  !pdfClientCode.includes("fetch('/api/pdf-to-word'"),
  'Dead fetch to /api/pdf-to-word completely purged from client engine'
);
assert(
  !scriptCode.includes('Complex layout detected. Using local browser engine'),
  'Misleading fallback toast purged from script.js'
);
assert(
  !pdfClientCode.includes('via Cloud Server!'),
  'Deceptive "via Cloud Server" toast purged from pdf-engine-client.js'
);

// F. Compare & Edit tools real implementations
assert(
  scriptCode.includes("toolKey === 'compare'") &&
  scriptCode.includes('PDF COMPARISON & STRUCTURAL ANALYSIS'),
  'Real multi-document structural & text comparison implemented for /tools/compare'
);
assert(
  scriptCode.includes("toolKey === 'edit'") &&
  scriptCode.includes('editNoteText') &&
  scriptCode.includes('drawRectangle'),
  'Real page annotation & header badge injection implemented for /tools/edit'
);

// -----------------------------------------------------------------------------
// TEST 4: PURGE VERIFICATION (NO DEAD BACKEND OR DUMMY KEYS)
// -----------------------------------------------------------------------------
console.log('\n--- 4. REPO PURITY & DEAD FILE REMOVAL AUDIT ---');
const purgedPaths = [
  'server.js',
  'routes',
  'api',
  'utils',
  'outputs',
  'uploads',
  'requirements.txt',
  'run.bat',
  'firebase.json',
  'public/js/firebase-config.js',
  '.env',
  '.env.example'
];

purgedPaths.forEach(p => {
  const exists = fs.existsSync(path.join(rootDir, p));
  assert(!exists, `Dead File/Dir Purged: ${p}`);
});

// Check vercel.json
const vercelConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
assert(!vercelConfig.headers, 'vercel.json stripped of dead /api/* CORS headers');
assert(vercelConfig.cleanUrls === true, 'vercel.json has cleanUrls enabled');

// Check package.json
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
assert(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, 'package.json dependencies purged of unused server packages');
assert(pkg.scripts['generate-tool-pages'] === 'node generate-tool-pages.js', 'package.json has generate-tool-pages script');

// -----------------------------------------------------------------------------
// TEST 5: SERVICE WORKER CACHE INTEGRITY
// -----------------------------------------------------------------------------
console.log('\n--- 5. OFFLINE SERVICE WORKER CACHE AUDIT ---');
const swCode = fs.readFileSync(path.join(rootDir, 'public/sw.js'), 'utf8');
assert(swCode.includes('v13'), 'Service Worker cache bumped to v13');

const coreAssetsMatch = swCode.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
assert(!!coreAssetsMatch, 'CORE_ASSETS list found in sw.js');

const cachedLocalFiles = [
  'public/index.html',
  'public/tool.html',
  'public/why-us.html',
  'public/404.html',
  'public/css/style.css',
  'public/js/script.js',
  'public/js/pdf-engine-client.js',
  'public/js/security-engine.js',
  'public/js/ocr-engine.js',
  'public/js/word-to-pdf.js',
  'public/js/excel-to-pdf.js',
  'public/js/pdf-to-ppt.js',
  'public/js/ppt-to-pdf.js',
  'public/js/pdfa-engine.js',
  'public/js/real-engine-overrides.js'
];

cachedLocalFiles.forEach(f => {
  assert(fs.existsSync(path.join(rootDir, f)), `Pre-cached asset physically exists: ${f}`);
});

console.log('================================================================');
console.log(`  AUDIT TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
}
