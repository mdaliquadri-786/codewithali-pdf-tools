const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PDFDocument, rgb } = require('pdf-lib');

const baseUrl = process.env.BASE_URL || 'https://codewithali-pdf-tools.vercel.app';

const allTools = [
  'merge',
  'split',
  'compress',
  'image-to-pdf',
  'rotate',
  'watermark',
  'page-numbers',
  'organize',
  'pdf-to-jpg',
  'extract-text',
  'flatten',
  'metadata',
  'base64',
  'grayscale',
  'invert',
  'markdown-to-pdf',
  'sign',
  'redact',
  'extract-images',
  'ocr',
  'ai-summarize',
  'pdf-to-word',
  'word-to-pdf',
  'pdf-to-excel',
  'excel-to-pdf',
  'pdf-to-ppt',
  'ppt-to-pdf',
  'protect',
  'unlock',
  'repair',
  'pdf-to-pdfa',
  'compare',
  'edit'
];

const toolsToSkipByDefault = ['ai-summarize'];
const toolsToTest = allTools.filter(tool => !toolsToSkipByDefault.includes(tool));

const fixturesDir = path.join(__dirname, 'fixtures');
const pdfOnePath = path.join(fixturesDir, 'dummy-first.pdf');
const pdfTwoPath = path.join(fixturesDir, 'dummy-second.pdf');
const imagePath = path.join(fixturesDir, 'dummy-image.png');
const markdownPath = path.join(fixturesDir, 'dummy-notes.md');
const csvPath = path.join(fixturesDir, 'dummy-table.csv');

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[i] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);

  return Buffer.concat([len, typeBuf, data, crc]);
}

function createSolidPngFile(filePath, width = 200, height = 200, r = 0, g = 120, b = 220, a = 255) {
  const raw = Buffer.alloc(1 + width * 4 * height + height, 0);

  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(raw);

  const widthBuf = Buffer.alloc(4);
  widthBuf.writeUInt32BE(width, 0);

  const heightBuf = Buffer.alloc(4);
  heightBuf.writeUInt32BE(height, 0);

  const ihdr = Buffer.concat([
    widthBuf,
    heightBuf,
    Buffer.from([8, 6, 0, 0, 0]),
  ]);

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);

  fs.writeFileSync(filePath, png);
}

async function createDummyPdf(filePath) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  page.drawText('CodeWithAli PDF Tools Test Document', {
    x: 60,
    y: 700,
    size: 22,
    color: rgb(0.1, 0.1, 0.1)
  });

  const bytes = await pdfDoc.save();
  fs.writeFileSync(filePath, bytes);
}

function createDummyMarkdown() {
  fs.writeFileSync(markdownPath, '# Test Notes\n\n- One\n- Two\n- Three\n');
}

function createDummyCsv() {
  fs.writeFileSync(csvPath, 'Name,Amount\nAli,250\nSara,400\n');
}

async function ensureFixtures() {
  fs.mkdirSync(fixturesDir, { recursive: true });

  if (!fs.existsSync(pdfOnePath)) await createDummyPdf(pdfOnePath);
  if (!fs.existsSync(pdfTwoPath)) await createDummyPdf(pdfTwoPath);
  if (!fs.existsSync(imagePath)) createSolidPngFile(imagePath, 200, 200, 0, 120, 220, 255);
  if (!fs.existsSync(markdownPath)) createDummyMarkdown();
  if (!fs.existsSync(csvPath)) createDummyCsv();
}

function getInputForTool(tool) {
  if (tool === 'merge' || tool === 'compare') return [pdfOnePath, pdfTwoPath];
  if (tool === 'image-to-pdf') return [imagePath];
  if (tool === 'markdown-to-pdf' || tool === 'word-to-pdf') return [markdownPath];
  if (tool === 'excel-to-pdf' || tool === 'pdf-to-excel') return [csvPath];
  if (tool === 'ppt-to-pdf') return [imagePath];
  if (tool === 'pdf-to-ppt') return [pdfOnePath];
  return [pdfOnePath];
}

test.describe('CodeWithAli PDF Tools - Full Vercel Validation', () => {
  test.describe.configure({ mode: 'serial', timeout: 240000 });

  test.beforeAll(async () => {
    await ensureFixtures();
  });

  for (const tool of toolsToTest) {
    test(`Tool: ${tool}`, async ({ page }) => {
      const diagnostics = [];

      page.on('console', msg => {
        if (msg.type() === 'error') diagnostics.push(`[Browser Console Error] ${msg.text()}`);
      });

      page.on('pageerror', err => {
        diagnostics.push(`[Page Exception] ${err.stack || err.message}`);
      });

      page.on('requestfailed', req => {
        const failure = req.failure();
        diagnostics.push(`[Request Failed] ${req.method()} ${req.url()} | ${failure?.errorText || 'unknown'}`);
      });

      page.on('response', res => {
        if (res.status() >= 400) diagnostics.push(`[HTTP ${res.status()}] ${res.url()}`);
      });

      const url = `${baseUrl}/tools/${tool}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await expect(page.locator('#workspaceTitle')).toBeVisible({ timeout: 15000 });

      const fileInput = page.locator('input[type="file"]');
      await expect(fileInput).toBeAttached({ timeout: 10000 });

      const inputs = getInputForTool(tool);
      await fileInput.setInputFiles(inputs);
      await expect(page.locator('.file-card').first()).toBeVisible({ timeout: 10000 });

      if (tool === 'sign') {
        const canvas = page.locator('#signaturePad');
        await expect(canvas).toBeVisible({ timeout: 10000 });
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.move(box.x + 10, box.y + 10);
          await page.mouse.down();
          await page.mouse.move(box.x + 180, box.y + 80, { steps: 15 });
          await page.mouse.up();
        }
      }

      if (tool === 'pdf-to-word') {
        const imageMode = page.locator('input[name="wordMode"][value="image"]');
        if (await imageMode.count()) {
          await imageMode.check();
        }
      }

      await page.locator('#actionSubmitBtn').click();

      await expect.poll(async () => {
        const resultVisible = await page.locator('#resultCard').isVisible().catch(() => false);
        if (resultVisible) return 'success';

        const toastCount = await page.locator('.toast-container > div').count().catch(() => 0);
        if (toastCount > 0) return 'toast-shown';

        return 'pending';
      }, {
        timeout: 120000,
        intervals: [1000, 2000, 5000]
      }).toBe('success');

      const downloadLink = page.locator('#downloadResultBtn, #downloadBtn').first();
      await expect(downloadLink).toBeVisible({ timeout: 10000 });
      await expect(downloadLink).toHaveAttribute('href', /^(blob:|data:)/, { timeout: 10000 });
    });
  }
});
