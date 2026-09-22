const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { PDFDocument, rgb } = require('pdf-lib');

const baseUrl =
  process.env.BASE_URL || 'https://codewithali-pdf-tools.vercel.app';

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
const toolsToTest = allTools.filter(
  tool => !toolsToSkipByDefault.includes(tool)
);

const fixturesDir = path.join(__dirname, 'fixtures');

const pdfOnePath = path.join(fixturesDir, 'dummy-first.pdf');
const pdfTwoPath = path.join(fixturesDir, 'dummy-second.pdf');
const pdfWithImagePath = path.join(fixturesDir, 'dummy-image-pdf.pdf');
const imagePath = path.join(fixturesDir, 'dummy-image.png');
const markdownPath = path.join(fixturesDir, 'dummy-notes.md');
const csvPath = path.join(fixturesDir, 'dummy-table.csv');

function makeCrcTable() {
  const table = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    let value = i;

    for (let bit = 0; bit < 8; bit++) {
      value =
        value & 1
          ? 0xedb88320 ^ (value >>> 1)
          : value >>> 1;
    }

    table[i] = value >>> 0;
  }

  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let i = 0; i < buffer.length; i++) {
    crc =
      (crc >>> 8) ^
      crcTable[(crc ^ buffer[i]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data) {
  const typeBuffer = Buffer.from(type);

  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(
    crc32(Buffer.concat([typeBuffer, data])),
    0
  );

  return Buffer.concat([
    lengthBuffer,
    typeBuffer,
    data,
    crcBuffer
  ]);
}

function createSolidPngFile(
  filePath,
  width = 200,
  height = 200,
  red = 0,
  green = 120,
  blue = 220,
  alpha = 255
) {
  const bytesPerPixel = 4;
  const bytesPerRow = width * bytesPerPixel;
  const rowLength = 1 + bytesPerRow;
  const rawData = Buffer.alloc(rowLength * height);

  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0;

    for (let x = 0; x < width; x++) {
      rawData[offset++] = red;
      rawData[offset++] = green;
      rawData[offset++] = blue;
      rawData[offset++] = alpha;
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  const widthBuffer = Buffer.alloc(4);
  widthBuffer.writeUInt32BE(width, 0);

  const heightBuffer = Buffer.alloc(4);
  heightBuffer.writeUInt32BE(height, 0);

  const imageHeader = Buffer.concat([
    widthBuffer,
    heightBuffer,
    Buffer.from([8, 6, 0, 0, 0])
  ]);

  const pngFile = Buffer.concat([
    Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a
    ]),
    createPngChunk('IHDR', imageHeader),
    createPngChunk('IDAT', compressedData),
    createPngChunk('IEND', Buffer.alloc(0))
  ]);

  fs.writeFileSync(filePath, pngFile);
}

async function createTextPdf(filePath) {
  const pdfDocument = await PDFDocument.create();
  const page = pdfDocument.addPage([612, 792]);

  page.drawText('CodeWithAli PDF Tools Test Document', {
    x: 60,
    y: 700,
    size: 22,
    color: rgb(0.1, 0.1, 0.1)
  });

  const pdfBytes = await pdfDocument.save();
  fs.writeFileSync(filePath, pdfBytes);
}

async function createImagePdf(filePath) {
  const pdfDocument = await PDFDocument.create();
  const imageBytes = fs.readFileSync(imagePath);
  const embeddedImage = await pdfDocument.embedPng(imageBytes);

  const page = pdfDocument.addPage([
    embeddedImage.width,
    embeddedImage.height
  ]);

  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width: embeddedImage.width,
    height: embeddedImage.height
  });

  const pdfBytes = await pdfDocument.save();
  fs.writeFileSync(filePath, pdfBytes);
}

function createMarkdownFixture() {
  fs.writeFileSync(
    markdownPath,
    '# Test Notes\n\n- One\n- Two\n- Three\n'
  );
}

function createCsvFixture() {
  fs.writeFileSync(
    csvPath,
    'Name,Amount\nAli,250\nSara,400\n'
  );
}

async function ensureFixtures() {
  fs.mkdirSync(fixturesDir, { recursive: true });

  if (!fs.existsSync(imagePath)) {
    createSolidPngFile(
      imagePath,
      200,
      200,
      0,
      120,
      220,
      255
    );
  }

  if (!fs.existsSync(pdfOnePath)) {
    await createTextPdf(pdfOnePath);
  }

  if (!fs.existsSync(pdfTwoPath)) {
    await createTextPdf(pdfTwoPath);
  }

  if (!fs.existsSync(pdfWithImagePath)) {
    await createImagePdf(pdfWithImagePath);
  }

  if (!fs.existsSync(markdownPath)) {
    createMarkdownFixture();
  }

  if (!fs.existsSync(csvPath)) {
    createCsvFixture();
  }
}

function getInputForTool(tool) {
  if (tool === 'merge' || tool === 'compare') {
    return [pdfOnePath, pdfTwoPath];
  }

  if (tool === 'image-to-pdf') {
    return [imagePath];
  }

  if (tool === 'markdown-to-pdf' || tool === 'word-to-pdf') {
    return [markdownPath];
  }

  if (tool === 'excel-to-pdf' || tool === 'pdf-to-excel') {
    return [csvPath];
  }

  if (tool === 'ppt-to-pdf') {
    return [imagePath];
  }

  if (tool === 'pdf-to-ppt') {
    return [pdfOnePath];
  }

  if (tool === 'extract-images') {
    return [pdfWithImagePath];
  }

  return [pdfOnePath];
}

async function waitForSuccessfulResult(page) {
  await expect
    .poll(
      async () => {
        const resultCard = page.locator('#resultCard');

        if (await resultCard.isVisible().catch(() => false)) {
          return 'success';
        }

        const processingOverlay = page.locator('#processingOverlay');

        if (
          !(await processingOverlay
            .isVisible()
            .catch(() => false))
        ) {
          const errorToast = page.locator(
            '.toast-container > div'
          );

          if (
            await errorToast
              .isVisible()
              .catch(() => false)
          ) {
            return 'error';
          }
        }

        return 'pending';
      },
      {
        timeout: 120000,
        intervals: [1000, 2000, 5000]
      }
    )
    .toBe('success');
}

test.describe('CodeWithAli PDF Tools - Full Vercel Validation', () => {
  test.describe.configure({
    mode: 'serial',
    timeout: 240000
  });

  test.beforeAll(async () => {
    await ensureFixtures();
  });

  for (const tool of toolsToTest) {
    test(
      `Tool: ${tool}`,
      async ({ page }) => {
        const diagnostics = [];

        page.on('console', message => {
          if (message.type() === 'error') {
            diagnostics.push(
              `[Browser Console Error] ${message.text()}`
            );
          }
        });

        page.on('pageerror', error => {
          diagnostics.push(
            `[Page Exception] ${
              error.stack || error.message
            }`
          );
        });

        page.on('requestfailed', request => {
          const failure = request.failure();

          diagnostics.push(
            `[Request Failed] ${request.method()} ${
              request.url()
            } | ${failure?.errorText || 'unknown'}`
          );
        });

        page.on('response', response => {
          if (response.status() >= 400) {
            diagnostics.push(
              `[HTTP ${response.status()}] ${response.url()}`
            );
          }
        });

        const toolUrl = `${baseUrl}/tools/${tool}`;

        await page.goto(toolUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });

        await expect(
          page.locator('#workspaceTitle')
        ).toBeVisible({
          timeout: 15000
        });

        const fileInput = page.locator(
          'input[type="file"]'
        );

        await expect(fileInput).toBeAttached({
          timeout: 10000
        });

        await fileInput.setInputFiles(
          getInputForTool(tool)
        );

        await expect(
          page.locator('.file-card').first()
        ).toBeVisible({
          timeout: 10000
        });

        if (tool === 'sign') {
          const signatureCanvas =
            page.locator('#signaturePad');

          await expect(signatureCanvas).toBeVisible({
            timeout: 10000
          });

          const canvasBox =
            await signatureCanvas.boundingBox();

          if (canvasBox) {
            await page.mouse.move(
              canvasBox.x + 10,
              canvasBox.y + 10
            );

            await page.mouse.down();

            await page.mouse.move(
              canvasBox.x + 180,
              canvasBox.y + 80,
              { steps: 15 }
            );

            await page.mouse.up();
          }
        }

        if (tool === 'pdf-to-word') {
          const imageMode = page.locator(
            'input[name="wordMode"][value="image"]'
          );

          if (await imageMode.count()) {
            await imageMode.check();
          }
        }

        await page.locator('#actionSubmitBtn').click();

        try {
          await waitForSuccessfulResult(page);
        } catch (error) {
          const diagnosticText =
            diagnostics.length > 0
              ? `\n\nDiagnostics:\n${diagnostics.join('\n')}`
              : '';

          throw new Error(
            `${error.message}${diagnosticText}`
          );
        }

        const downloadLink = page
          .locator('#downloadResultBtn, #downloadBtn')
          .first();

        await expect(downloadLink).toBeVisible({
          timeout: 10000
        });

        await expect(downloadLink).toHaveAttribute(
          'href',
          /^(blob:|data:)/,
          { timeout: 10000 }
        );
      }
    );
  }
});
