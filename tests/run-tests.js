/**
 * CodeWithAli PDF Tools — Automated API & Page Test Suite
 * Run: node tests/run-tests.js  (server must be running on BASE_URL)
 * Covers: happy paths for every endpoint + severe cases (corrupt, empty,
 * fake, encrypted, oversized, missing fields, traversal, sanitization).
 */
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { spawnSync } = require('child_process');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://localhost:3312';
let pass = 0, fail = 0;
const lines = [];

async function test(name, fn) {
  try { await fn(); pass++; lines.push(`  PASS  ${name}`); }
  catch (e) { fail++; lines.push(`  FAIL  ${name} — ${e.message}`); }
}

async function req(method, url, body, headers = {}) {
  const r = await fetch(BASE + url, { method, body, headers });
  const ct = r.headers.get('content-type') || '';
  const payload = ct.includes('json') ? await r.json().catch(() => null) : await r.text();
  return { status: r.status, payload };
}

function mp(parts) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(parts)) {
    if (v && v.__file) fd.append(k, new Blob([v.buf], { type: v.type || 'application/pdf' }), v.name);
    else fd.append(k, String(v));
  }
  return fd;
}
const F = (buf, name, type) => ({ __file: true, buf, name, type });

async function makePdf(pages, label) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = d.addPage([595, 842]);
    p.drawText(`${label} ${i}`, { x: 50, y: 400, size: 24, font: f });
  }
  return Buffer.from(await d.save());
}

function makeEncryptedPdf(srcPath, outPath, password) {
  const py = `
from pypdf import PdfReader, PdfWriter
r = PdfReader(${JSON.stringify(srcPath)}); w = PdfWriter()
for p in r.pages: w.add_page(p)
w.encrypt(${JSON.stringify(password)})
w.write(${JSON.stringify(outPath)})`;
  const res = spawnSync('python3', ['-c', py], { encoding: 'utf-8' });
  if (res.status !== 0 || !fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
    throw new Error('fixture: could not build encrypted pdf');
  }
}

function assertNoLeak(payload) {
  const s = typeof payload === 'string' ? payload : JSON.stringify(payload || {});
  if (/Python engine|at\s+\w+\s*\(|node:internal|\/home\/user\//i.test(s)) {
    throw new Error(`internal error text leaked to client: "${s.slice(0, 120)}"`);
  }
}

(async () => {
  const good3 = await makePdf(3, 'Alpha page');
  const good2 = await makePdf(2, 'Beta page');
  const corrupt = Buffer.from('%PDF-1.4\nGarbage not a real pdf body');
  const zero = Buffer.alloc(0);
  const fake = Buffer.from('just plain text, not a pdf');
  const tmpEnc = '/tmp/_enc_fixture.pdf';
  fs.writeFileSync('/tmp/_enc_src.pdf', good3);
  makeEncryptedPdf('/tmp/_enc_src.pdf', tmpEnc, 'secret123');
  const encrypted = fs.readFileSync(tmpEnc);

  // ---- Pages ----
  await test('GET / serves index (200, html)', async () => {
    const r = await req('GET', '/', undefined);
    if (r.status !== 200 || !String(r.payload).includes('<!DOCTYPE html')) throw new Error(`status ${r.status}`);
  });
  await test('GET /tools/merge-pdf serves tool page (200)', async () => {
    const r = await req('GET', '/tools/merge-pdf', undefined);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  });
  await test('GET /why-us.html serves (200)', async () => {
    const r = await req('GET', '/why-us.html', undefined);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  });
  await test('GET /api/health (200, status online)', async () => {
    const r = await req('GET', '/api/health', undefined);
    if (r.status !== 200 || r.payload.status !== 'online') throw new Error(JSON.stringify(r.payload));
  });

  // ---- Merge ----
  await test('merge: two valid PDFs → 200, 5 pages', async () => {
    const r = await req('POST', '/api/pdf/merge', mp({ files: F(good3, 'a.pdf'), second: null, files2: F(good2, 'b.pdf') }).constructor === FormData ? (() => { const fd = new FormData(); fd.append('files', new Blob([good3]), 'a.pdf'); fd.append('files', new Blob([good2]), 'b.pdf'); return fd; })() : null);
    if (r.status !== 200 || !r.payload.success) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
    if (r.payload.pageCount !== 5) throw new Error(`pageCount ${r.payload.pageCount}`);
  });
  await test('merge: single file → 400 clean message', async () => {
    const fd = new FormData(); fd.append('files', new Blob([good3]), 'a.pdf');
    const r = await req('POST', '/api/pdf/merge', fd);
    if (r.status !== 400 || !/at least 2/i.test(r.payload.error || '')) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
  });
  await test('merge: corrupt file → 400 (no success, no leak)', async () => {
    const fd = new FormData(); fd.append('files', new Blob([good3]), 'a.pdf'); fd.append('files', new Blob([corrupt]), 'c.pdf');
    const r = await req('POST', '/api/pdf/merge', fd);
    if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`);
    if (r.payload && r.payload.success) throw new Error('returned success for corrupt input');
    assertNoLeak(r.payload);
  });

  // ---- Compress ----
  await test('compress: valid → 200', async () => {
    const r = await req('POST', '/api/pdf/compress', mp({ file: F(good3, 'a.pdf'), level: 'recommended' }));
    if (r.status !== 200 || !r.payload.success) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
  });
  await test('compress: zero-byte file → 400 "empty"', async () => {
    const r = await req('POST', '/api/pdf/compress', mp({ file: F(zero, 'z.pdf') }));
    if (r.status !== 400 || !/empty/i.test(r.payload.error || '')) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
  });
  await test('compress: text-renamed-to-pdf → 400 "not a valid PDF"', async () => {
    const r = await req('POST', '/api/pdf/compress', mp({ file: F(fake, 'f.pdf') }));
    if (r.status !== 400 || !/not a valid pdf/i.test(r.payload.error || '')) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
  });
  await test('compress: encrypted PDF → 400 "password-protected"', async () => {
    const r = await req('POST', '/api/pdf/compress', mp({ file: F(encrypted, 'e.pdf') }));
    if (r.status !== 400 || !/password/i.test(r.payload.error || '')) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
  });
  await test('compress: missing file field → 400', async () => {
    const r = await req('POST', '/api/pdf/compress', undefined);
    if (r.status !== 400) throw new Error(`status ${r.status}`);
  });

  // ---- Split ----
  await test('split: valid range 1-2 → 200', async () => {
    const r = await req('POST', '/api/pdf/split', mp({ file: F(good3, 'a.pdf'), mode: 'range', pageRange: '1-2' }));
    if (r.status !== 200 || !r.payload.success) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
  });
  await test('split: valid mode=all → 200 (zip)', async () => {
    const r = await req('POST', '/api/pdf/split', mp({ file: F(good3, 'a.pdf'), mode: 'all' }));
    if (r.status !== 200 || !r.payload.isZip) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
  });
  await test('split: corrupt → rejected with sanitized error (no leak)', async () => {
    const r = await req('POST', '/api/pdf/split', mp({ file: F(corrupt, 'c.pdf'), mode: 'all' }));
    if (r.status < 400 || r.status >= 600) throw new Error(`expected 4xx/5xx, got ${r.status}`);
    if (r.payload && r.payload.success) throw new Error('returned success for corrupt input');
    assertNoLeak(r.payload);
  });

  // ---- Other tools happy paths ----
  await test('rotate: valid → 200', async () => {
    const r = await req('POST', '/api/pdf/rotate', mp({ file: F(good3, 'a.pdf'), angle: '90' }));
    if (r.status !== 200 || !r.payload.success) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
  });
  await test('watermark: valid → 200', async () => {
    const r = await req('POST', '/api/pdf/watermark', mp({ file: F(good3, 'a.pdf'), text: 'CONFIDENTIAL' }));
    if (r.status !== 200 || !r.payload.success) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
  });
  await test('page-numbers: valid → 200', async () => {
    const r = await req('POST', '/api/pdf/page-numbers', mp({ file: F(good3, 'a.pdf'), position: 'bottom-right' }));
    if (r.status !== 200 || !r.payload.success) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
  });
  await test('extract-text: valid → 200 with text', async () => {
    const r = await req('POST', '/api/pdf/extract-text', mp({ file: F(good3, 'a.pdf') }));
    if (r.status !== 200 || !/Alpha page 1/.test(r.payload.text || '')) throw new Error(`${r.status} ${JSON.stringify(r.payload).slice(0, 100)}`);
  });
  await test('markdown-to-pdf: valid → 200', async () => {
    const r = await req('POST', '/api/pdf/markdown-to-pdf', JSON.stringify({ markdown: '# Hi\n\nBody text.' }), { 'Content-Type': 'application/json' });
    if (r.status !== 200 || !r.payload.success) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
  });

  // ---- Security & errors ----
  await test('download: nonexistent → 404', async () => {
    const r = await req('GET', '/api/pdf/download/nope_123.pdf', undefined);
    if (r.status !== 404) throw new Error(`status ${r.status}`);
  });
  await test('download: path traversal blocked (not 200)', async () => {
    const r = await req('GET', '/api/pdf/download/..%2F..%2Fserver.js', undefined);
    if (r.status === 200) throw new Error('server.js served via traversal!');
  });
  await test('upload: 51MB file → 413 JSON', async () => {
    const huge = Buffer.alloc(51 * 1024 * 1024, 7);
    const fd = new FormData(); fd.append('files', new Blob([huge]), 'h.pdf'); fd.append('files', new Blob([good3]), 'a.pdf');
    const r = await req('POST', '/api/pdf/merge', fd);
    if (r.status !== 413) throw new Error(`status ${r.status}`);
    assertNoLeak(r.payload);
  });
  await test('contact: valid → 200', async () => {
    const r = await req('POST', '/api/contact', JSON.stringify({ name: 'T', email: 't@x.com', message: 'hi' }), { 'Content-Type': 'application/json' });
    if (r.status !== 200 || !r.payload.success) throw new Error(`${r.status} ${JSON.stringify(r.payload)}`);
  });
  await test('contact: bad email → 400', async () => {
    const r = await req('POST', '/api/contact', JSON.stringify({ name: 'T', email: 'bad', message: 'hi' }), { 'Content-Type': 'application/json' });
    if (r.status !== 400) throw new Error(`status ${r.status}`);
  });

  console.log(`\n=== TEST RESULTS: ${pass} passed, ${fail} failed (${pass + fail} total) ===\n`);
  console.log(lines.join('\n'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERROR:', e); process.exit(2); });
