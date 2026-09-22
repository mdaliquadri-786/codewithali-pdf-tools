const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { PDFDocument, rgb } = require('pdf-lib');

const baseUrl = 'https://codewithali-pdf-tools.vercel.app';
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
const imageOnePath = path.join(fixturesDir, 'dummy-image.png');
const markdownPath = path.join(fixturesDir, 'dummy-notes.md');
const csvPath = path.join(fixturesDir, 'dummy-table.csv');

async function createDummyPdf(filePath) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  page.drawText('CodeWithAli PDF Tools Test Document', {
    x: 60,
    y: 700,
    size: 22,
    color: rgb(0.1, 0.1, 0.1)
  });
  fs.writeFileSync(filePath, await pdfDoc.save());
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
  if (!fs.existsSync(imageOnePath)) {
    const pngBuffer = Buffer.alloc(200 * 200 * 4);
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const idx = (y * 200 + x) * 4;
        pngBuffer[idx] = 0;
        pngBuffer[idx + 1] = 120;
        pngBuffer[idx + 2] = 220;
        pngBuffer[idx + 3] = 255;
      }
    }
    fs.writeFileSync(imageOnePath, pngBuffer);
  }
  if (!fs.existsSync(markdownPath)) createDummyMarkdown();
  if (!fs.existsSync(csvPath)) createDummyCsv();
}

function getInputForTool(tool) {
  if (tool === 'merge' || tool === 'compare') return [pdfOnePath, pdfTwoPath];
  if (tool === 'image-to-pdf') return [imageOnePath];
  if (tool === 'markdown-to-pdf' || tool === 'word-to-pdf') return [markdownPath];
  if (tool === 'excel-to-pdf' || tool === 'pdf-to-excel') return [csvPath];
  if (tool === 'ppt-to-pdf') return [imageOnePath];
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
      page.on('pageerror', err => diagnostics.push(`[Page Exception] ${err.stack || err.message}`));
      page.on('requestfailed', req => {
        const failure = req.failure();
        diagnostics.push(`[Request Failed] ${req.method()} ${req.url()} | ${failure?.errorText || 'unknown'}`);
      });
      page.on('response', res => {
        if (res.status() >= 400) diagnostics.push(`[HTTP ${res.status()}] ${res.url()}`);
      });

      await page.goto(`${baseUrl}/tools/${tool}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await expect(page.locator('#workspaceTitle')).toBeVisible({ timeout: 15000 });

      const fileInput = page.locator('input[type=\"file\"]');
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
        const imageMode = page.locator('input[name=\"wordMode\"][value=\"image\"]');
        if (await imageMode.count()) await imageMode.check();
      }

      await page.locator('#actionSubmitBtn').click();

      await expect.poll(async () => {
        const resultVisible = await page.locator('#resultCard').isVisible().catch(() => false);
        if (resultVisible) return 'success';
        const toastCount = await page.locator('.toast-container > div').count().catch(() => 0);
        return toastCount > 0 ? 'toast-shown' : 'pending';
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
