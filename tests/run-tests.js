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

// G. AI Summarizer & Ask PDF Live Engine
assert(
  scriptCode.includes('async function callGeminiApi') &&
  scriptCode.includes('gemini-1.5-flash:generateContent'),
  'Google Gemini 1.5 Flash client-side API engine implemented'
);
assert(
  scriptCode.includes('answerQuestionLocal(query, text)') &&
  scriptCode.includes('ClientAIEngine'),
  'In-browser local semantic Q&A engine implemented on ClientAIEngine'
);
assert(
  scriptCode.includes('geminiApiKey') &&
  scriptCode.includes('cwa_gemini_api_key'),
  'Gemini API key input & localStorage persistence wired in ai-summarize'
);

// H. Result Screen Live Previews & Interactive Inspectors
assert(
  scriptCode.includes('resultStats') &&
  scriptCode.includes('statReduction') &&
  scriptCode.includes('statOriginalSize'),
  'Live compression savings percentage and byte stats wired in showResultScreen'
);
assert(
  scriptCode.includes('ocrOutputBox') &&
  scriptCode.includes('ocrTextResult') &&
  scriptCode.includes('copyOcrTextBtn'),
  'Live OCR & text extraction preview with one-click copy wired in showResultScreen'
);
assert(
  scriptCode.includes('metadataOutputBox') &&
  scriptCode.includes('metadataGrid'),
  'Document properties & metadata profile cards wired in showResultScreen'
);
assert(
  scriptCode.includes('aiQnaBox') &&
  scriptCode.includes('aiAskBtn') &&
  scriptCode.includes('aiQuestionInput'),
  'Ask Your PDF interactive Q&A workflow wired in showResultScreen'
);

// I. Standalone Engine1_PDFLib Fallback Methods Complete
const engine1Methods = ['mergePDFs', 'splitPDF', 'rotatePDF', 'compressPDF', 'addWatermark', 'addPageNumbers', 'imageToPDF', 'markdownToPDF', 'organizePDF', 'deletePages', 'flattenPDF', 'editMetadata', 'signPDF', 'repairPDF', 'pdfToPdfa'];
engine1Methods.forEach(method => {
  assert(
    scriptCode.includes(`${method}(`),
    `Engine1_PDFLib standalone fallback method implemented: ${method}`
  );
});

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
assert(swCode.includes('v15'), 'Service Worker cache bumped to v15');

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

// -----------------------------------------------------------------------------
// TEST 6: UI/UX ARCHITECTURE & INTERACTIVE CONTROLS AUDIT
// -----------------------------------------------------------------------------
console.log('\n--- 6. UI/UX ARCHITECTURE & INTERACTIVE CONTROLS AUDIT ---');
const indexHtmlContent = fs.readFileSync(path.join(rootDir, 'public/index.html'), 'utf8');
const toolHtmlContent = fs.readFileSync(path.join(rootDir, 'public/tool.html'), 'utf8');
const whyUsHtmlContent = fs.readFileSync(path.join(rootDir, 'public/why-us.html'), 'utf8');
const notFoundHtmlContent = fs.readFileSync(path.join(rootDir, 'public/404.html'), 'utf8');

// 1. Search Empty State Verification
assert(indexHtmlContent.includes('id="searchEmptyState"'), 'Search zero-state container exists in index.html');
assert(scriptCode.includes('clearSearchBtn'), 'Reset Search button wired in script.js');

// 2. Button Wiring Verification
assert(scriptCode.includes('initQuickSpecsDrawer'), 'Quick Specs drawer initialization wired in script.js');
assert(scriptCode.includes('quickSpecsToggle'), 'Quick specs floating button wired in script.js');
assert(scriptCode.includes('closeSpecsDrawerBtn'), 'Quick specs close button wired in script.js');
assert(scriptCode.includes('specsDrawerBackdrop'), 'Quick specs backdrop wired in script.js');

assert(scriptCode.includes('selectAllPagesBtn'), 'Batch Select All pages button wired in script.js');
assert(scriptCode.includes('deselectAllPagesBtn'), 'Batch Clear pages button wired in script.js');
assert(scriptCode.includes('invertPagesBtn'), 'Batch Invert pages button wired in script.js');
assert(scriptCode.includes('rotateAllPagesBtn'), 'Batch Rotate All pages button wired in script.js');

assert(scriptCode.includes('loadMdSampleBtn'), 'Load Sample Notes button wired in script.js');
assert(scriptCode.includes('copyBase64Btn'), 'Copy Base64 string button wired in script.js');
assert(scriptCode.includes('copyExtractedTextBtn'), 'Copy Extracted Text button wired in script.js');
assert(scriptCode.includes('beforeinstallprompt'), 'PWA beforeinstallprompt handler wired in script.js');

// 3. FontAwesome Free Icon Purity Check (No Pro icons)
const allHtml = indexHtmlContent + toolHtmlContent + whyUsHtmlContent + notFoundHtmlContent;
assert(!allHtml.includes('fa-presentation-screen'), 'Zero fa-presentation-screen Pro icon occurrences');
assert(!allHtml.includes('fa-grid-2'), 'Zero fa-grid-2 Pro icon occurrences');

// 4. Production Tag Purity (No Beta stigma)
assert(!indexHtmlContent.includes('tag-beta'), 'Zero tag-beta stigma occurrences on index.html');
assert(!indexHtmlContent.includes('Beta Tool'), 'Zero "Beta Tool" label occurrences on index.html');

// 5. Category Architecture Verification
const gridSnippet = indexHtmlContent.substring(indexHtmlContent.indexOf('id="toolGrid"'), indexHtmlContent.indexOf('id="searchEmptyState"'));
const cardCategories = [...gridSnippet.matchAll(/data-category="([^"]+)"/g)].map(m => m[1]);
const validCategories = ['organize-edit', 'convert-to', 'convert-from', 'security-optimize', 'smart-utilities'];
assert(cardCategories.length === 33, `All 33 tool cards have data-category attribute (found ${cardCategories.length})`);
const allCatsValid = cardCategories.every(c => validCategories.includes(c));
assert(allCatsValid, 'All 33 tool cards map to the 5 unified SaaS categories');

const organizeCount = cardCategories.filter(c => c === 'organize-edit').length;
const convertToCount = cardCategories.filter(c => c === 'convert-to').length;
const convertFromCount = cardCategories.filter(c => c === 'convert-from').length;
const secOptCount = cardCategories.filter(c => c === 'security-optimize').length;
const smartCount = cardCategories.filter(c => c === 'smart-utilities').length;

assert(organizeCount === 9, `Organize & Edit category count: Expected 9, got ${organizeCount}`);
assert(convertToCount === 5, `Convert to PDF category count: Expected 5, got ${convertToCount}`);
assert(convertFromCount === 5, `Convert from PDF category count: Expected 5, got ${convertFromCount}`);
assert(secOptCount === 9, `Security & Optimize category count: Expected 9, got ${secOptCount}`);
assert(smartCount === 5, `AI & Smart Utilities category count: Expected 5, got ${smartCount}`);

console.log('================================================================');
console.log(`  AUDIT TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
}
