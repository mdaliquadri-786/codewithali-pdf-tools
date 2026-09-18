/**
 * CodeWithAli PDF Tools Suite - Express API Routes
 * Endpoints for PDF manipulation utilities
 */

let express;
let multer;

try {
  express = require('express');
} catch (e) {
  const mini = require('../utils/miniExpress');
  express = mini.express;
}

try {
  multer = require('multer');
} catch (e) {
  const mini = require('../utils/miniExpress');
  multer = mini.multer;
}

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pdfHelper = require('../utils/pdfHelper');

const router = express.Router();

// Configure storage paths
const os = require('os');
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.FIREBASE_CONFIG);
const UPLOADS_DIR = isServerless ? path.join(os.tmpdir(), 'cwa_uploads') : path.join(__dirname, '../uploads');
const OUTPUTS_DIR = isServerless ? path.join(os.tmpdir(), 'cwa_outputs') : path.join(__dirname, '../outputs');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// Setup Multer storage
const storage = multer.diskStorage ? multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, unique);
  }
}) : { dest: UPLOADS_DIR };

const upload = multer({
  storage: storage,
  dest: UPLOADS_DIR,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB per file limit
});

function generateOutputName(prefix, ext = '.pdf') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
}

// PDF upload validation: severe-case testing showed corrupt / zero-byte /
// fake (text-renamed-to-.pdf) files sailed through and returned success:true
// or leaked raw engine errors. Validate the magic header up-front.
let PDFLib;
try { PDFLib = require('pdf-lib'); } catch (e) { PDFLib = null; }

async function validatePdfUpload(file) {
  if (!file) return null; // missing-file case handled per-route with its own message
  if (file.size === 0) return 'The uploaded file is empty.';
  let buf;
  try {
    const fd = fs.openSync(file.path, 'r');
    buf = Buffer.alloc(1024);
    fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);
  } catch (e) {
    return 'Could not read the uploaded file. Please try again.';
  }
  // Layer 1: magic header (cheap rejection of non-PDF uploads)
  if (!buf.subarray(0, 1024).toString('latin1').includes('%PDF-')) {
    return `"${file.originalname}" is not a valid PDF file. Please upload a genuine PDF document.`;
  }
  // Layer 2: structural parse — catches truncated/corrupt files that keep a
  // valid header but fail real parsing (severe-test finding: corrupt.pdf
  // passed the magic check and returned success:true / leaked engine errors)
  if (PDFLib && PDFLib.PDFDocument) {
    try {
      const parsed = await PDFLib.PDFDocument.load(fs.readFileSync(file.path), { ignoreEncryption: true });
      if (parsed.getPageCount() === 0) {
        return `"${file.originalname}" contains no readable pages. Please re-export or repair the PDF and try again.`;
      }
    } catch (e) {
      return `"${file.originalname}" appears to be corrupted or incomplete and could not be parsed. Please re-export or repair the PDF and try again.`;
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// 1. MERGE PDF (POST /api/pdf/merge)
// -----------------------------------------------------------------------------
router.post('/merge', upload.array('files', 20), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length < 2) {
      return res.status(400).json({ error: 'Please upload at least 2 PDF files to merge.' });
    }

    for (const f of files) {
      const validationError = await validatePdfUpload(f);
      if (validationError) return res.status(400).json({ error: validationError });
    }

    let orderedFiles = files;
    // Check if client provided custom order
    if (req.body.fileOrder) {
      try {
        const order = JSON.parse(req.body.fileOrder);
        if (Array.isArray(order) && order.length === files.length) {
          const fileMap = new Map();
          files.forEach(f => fileMap.set(f.originalname, f));
          const sorted = [];
          order.forEach(name => {
            if (fileMap.has(name)) sorted.push(fileMap.get(name));
          });
          if (sorted.length === files.length) {
            orderedFiles = sorted;
          }
        }
      } catch (e) {
        // Fallback to default order
      }
    }

    const outFilename = generateOutputName('merged');
    const outputPath = path.join(OUTPUTS_DIR, outFilename);
    const inputPaths = orderedFiles.map(f => f.path);

    const result = await pdfHelper.mergePDFs(inputPaths, outputPath);

    res.json({
      success: true,
      message: 'PDFs merged successfully!',
      downloadUrl: `/api/pdf/download/${outFilename}`,
      filename: 'CodeWithAli_Merged.pdf',
      pageCount: result.pageCount || result.page_count
    });
  } catch (error) {
    console.error('Merge error:', error);
    res.status(400).json({ error: 'Merge failed. One or more files may be corrupted or not valid PDFs. Please check the files and try again.' });
  }
});

// -----------------------------------------------------------------------------
// 2. SPLIT PDF (POST /api/pdf/split)
// -----------------------------------------------------------------------------
router.post('/split', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const pdfValidationError = await validatePdfUpload(file);
    if (pdfValidationError) return res.status(400).json({ error: pdfValidationError });
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file to split.' });
    }

    const mode = req.body.mode || 'all'; // 'all' or 'range'
    const pageRange = req.body.pageRange || '';
    const splitDir = path.join(OUTPUTS_DIR, `split_${Date.now()}`);

    const result = await pdfHelper.splitPDF(file.path, mode, pageRange, splitDir);

    const outBase = path.basename(result.output);
    res.json({
      success: true,
      message: mode === 'all' ? 'PDF split into individual pages!' : 'Specified pages extracted successfully!',
      downloadUrl: `/api/pdf/download-split/${path.basename(splitDir)}/${outBase}`,
      isZip: result.is_zip !== undefined ? result.is_zip : mode === 'all',
      filename: mode === 'all' ? 'CodeWithAli_Split_Pages.zip' : 'CodeWithAli_Extracted_Pages.pdf'
    });
  } catch (error) {
    console.error('Split error:', error);
    res.status(500).json({ error: 'Split failed. The file may be corrupted or not a valid PDF. Please check the file and try again.' });
  }
});

// -----------------------------------------------------------------------------
// 3. COMPRESS PDF (POST /api/pdf/compress)
// -----------------------------------------------------------------------------
router.post('/compress', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const pdfValidationError = await validatePdfUpload(file);
    if (pdfValidationError) return res.status(400).json({ error: pdfValidationError });
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file to compress.' });
    }

    const level = req.body.level || 'recommended'; // 'extreme', 'recommended', 'low'

    // Encrypted PDFs silently pass through compression unchanged — reject with
    // an honest, actionable message instead of fake success.
    if (await pdfHelper.isPdfEncrypted(file.path)) {
      return res.status(400).json({ error: 'This PDF is password-protected. Use the Unlock PDF tool first, then compress it.' });
    }

    const outFilename = generateOutputName('compressed');
    const outputPath = path.join(OUTPUTS_DIR, outFilename);

    const result = await pdfHelper.compressPDF(file.path, level, outputPath);

    res.json({
      success: true,
      message: 'PDF compressed successfully!',
      downloadUrl: `/api/pdf/download/${outFilename}`,
      filename: `CodeWithAli_Compressed_${file.originalname || 'document.pdf'}`,
      originalSize: result.original_size,
      compressedSize: result.compressed_size,
      reductionPercentage: result.reduction_percentage
    });
  } catch (error) {
    console.error('Compress error:', error);
    res.status(500).json({ error: error.message || 'Failed to compress PDF.' });
  }
});

// -----------------------------------------------------------------------------
// 4. IMAGE TO PDF (POST /api/pdf/image-to-pdf)
// -----------------------------------------------------------------------------
router.post('/image-to-pdf', upload.array('files', 50), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'Please upload at least one image.' });
    }

    const orientation = req.body.orientation || 'portrait'; // 'portrait', 'landscape', 'fit'
    const margin = parseInt(req.body.margin, 10) || 20;
    const pageSize = req.body.pageSize || 'a4';

    const outFilename = generateOutputName('images_to_pdf');
    const outputPath = path.join(OUTPUTS_DIR, outFilename);
    const imagePaths = files.map(f => f.path);

    await pdfHelper.imagesToPDF(imagePaths, { orientation, margin, pageSize }, outputPath);

    res.json({
      success: true,
      message: 'Images converted to PDF successfully!',
      downloadUrl: `/api/pdf/download/${outFilename}`,
      filename: 'CodeWithAli_Images.pdf'
    });
  } catch (error) {
    console.error('Image to PDF error:', error);
    res.status(500).json({ error: error.message || 'Failed to convert images to PDF.' });
  }
});

// -----------------------------------------------------------------------------
// 5. WATERMARK PDF (POST /api/pdf/watermark)
// -----------------------------------------------------------------------------
router.post('/watermark', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const pdfValidationError = await validatePdfUpload(file);
    if (pdfValidationError) return res.status(400).json({ error: pdfValidationError });
    if (!file) {
      return res.status(400).json({ error: 'Please upload a PDF file to watermark.' });
    }

    const text = req.body.text || 'CONFIDENTIAL';
    const position = req.body.position || 'diagonal'; // 'diagonal', 'center', 'bottom-right', 'top-left'
    const opacity = parseFloat(req.body.opacity) || 0.3;
    const fontSize = parseInt(req.body.fontSize, 10) || 48;
    const color = req.body.color || '#666666';

    const outFilename = generateOutputName('watermarked');
    const outputPath = path.join(OUTPUTS_DIR, outFilename);

    await pdfHelper.addWatermark(file.path, text, { position, opacity, fontSize, color }, outputPath);

    res.json({
      success: true,
      message: 'Watermark stamped across all pages successfully!',
      downloadUrl: `/api/pdf/download/${outFilename}`,
      filename: `CodeWithAli_Watermarked_${file.originalname || 'document.pdf'}`
    });
  } catch (error) {
    console.error('Watermark error:', error);
    res.status(500).json({ error: 'Watermark failed. The file may be corrupted or not a valid PDF. Please check the file and try again.' });
  }
});

// -----------------------------------------------------------------------------
// 6. ROTATE PDF (POST /api/pdf/rotate)
// -----------------------------------------------------------------------------
router.post('/rotate', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const pdfValidationError = await validatePdfUpload(file);
    if (pdfValidationError) return res.status(400).json({ error: pdfValidationError });
    if (!file) return res.status(400).json({ error: 'Please upload a PDF file.' });

    const angle = parseInt(req.body.angle, 10) || 90;
    const outFilename = generateOutputName('rotated');
    const outputPath = path.join(OUTPUTS_DIR, outFilename);

    await pdfHelper.rotatePDF(file.path, angle, outputPath);

    res.json({
      success: true,
      message: `PDF rotated by ${angle}°!`,
      downloadUrl: `/api/pdf/download/${outFilename}`,
      filename: `CodeWithAli_Rotated.pdf`
    });
  } catch (error) {
    res.status(500).json({ error: 'Processing failed. The file may be corrupted, password-protected, or in an unsupported format. Please verify the file and try again.' });
  }
});

// -----------------------------------------------------------------------------
// 7. ADD PAGE NUMBERS (POST /api/pdf/page-numbers)
// -----------------------------------------------------------------------------
router.post('/page-numbers', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const pdfValidationError = await validatePdfUpload(file);
    if (pdfValidationError) return res.status(400).json({ error: pdfValidationError });
    if (!file) return res.status(400).json({ error: 'Please upload a PDF file.' });

    const format = req.body.format || 'Page {n} of {total}';
    const position = req.body.position || 'bottom-center';
    const outFilename = generateOutputName('numbered');
    const outputPath = path.join(OUTPUTS_DIR, outFilename);

    await pdfHelper.addPageNumbers(file.path, { format, position }, outputPath);

    res.json({
      success: true,
      message: 'Page numbers added successfully!',
      downloadUrl: `/api/pdf/download/${outFilename}`,
      filename: `CodeWithAli_Numbered.pdf`
    });
  } catch (error) {
    res.status(500).json({ error: 'Processing failed. The file may be corrupted, password-protected, or in an unsupported format. Please verify the file and try again.' });
  }
});

// -----------------------------------------------------------------------------
// 8. EXTRACT TEXT (POST /api/pdf/extract-text)
// -----------------------------------------------------------------------------
router.post('/extract-text', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const pdfValidationError = await validatePdfUpload(file);
    if (pdfValidationError) return res.status(400).json({ error: pdfValidationError });
    if (!file) return res.status(400).json({ error: 'Please upload a PDF file.' });

    const result = await pdfHelper.extractText(file.path);
    res.json({
      success: true,
      text: result.text,
      pageCount: result.page_count
    });
  } catch (error) {
    res.status(500).json({ error: 'Processing failed. The file may be corrupted, password-protected, or in an unsupported format. Please verify the file and try again.' });
  }
});

// -----------------------------------------------------------------------------
// 9. MARKDOWN TO PDF (POST /api/pdf/markdown-to-pdf)
// -----------------------------------------------------------------------------
router.post('/markdown-to-pdf', (req, res, next) => {
  // If JSON or urlencoded
  next();
}, async (req, res) => {
  try {
    const markdown = req.body.markdown;
    if (!markdown) return res.status(400).json({ error: 'Markdown text is required.' });

    const outFilename = generateOutputName('doc');
    const outputPath = path.join(OUTPUTS_DIR, outFilename);

    await pdfHelper.markdownToPDF(markdown, outputPath);

    res.json({
      success: true,
      downloadUrl: `/api/pdf/download/${outFilename}`,
      filename: 'CodeWithAli_Document.pdf'
    });
  } catch (error) {
    res.status(500).json({ error: 'Processing failed. The file may be corrupted, password-protected, or in an unsupported format. Please verify the file and try again.' });
  }
});

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// 10. PDF TO WORD (POST /api/pdf/pdf-to-word)
// -----------------------------------------------------------------------------
router.post('/pdf-to-word', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const pdfValidationError = await validatePdfUpload(file);
    if (pdfValidationError) return res.status(400).json({ error: pdfValidationError });
    if (!file) return res.status(400).json({ error: 'Please upload a PDF file.' });

    const baseName = path.basename(file.originalname, path.extname(file.originalname));
    const outFilename = `${baseName}_Converted_${Date.now()}.docx`;
    const outputPath = path.join(OUTPUTS_DIR, outFilename);

    await pdfHelper.pdfToWord(file.path, outputPath);

    res.json({
      success: true,
      message: 'PDF converted to Word document (.docx) successfully!',
      downloadUrl: `/api/pdf/download/${outFilename}`,
      filename: `${baseName}.docx`
    });
  } catch (error) {
    console.error('PDF to Word conversion error:', error);
    res.status(500).json({ error: 'Processing failed. The file may be corrupted, password-protected, or in an unsupported format. Please verify the file and try again.' });
  }
});

// DOWNLOAD ENDPOINTS
// -----------------------------------------------------------------------------
router.get('/download/:filename', (req, res) => {
  // Path traversal fix: a filename like ..%2F..%2Fserver.js previously escaped
  // the outputs directory and could serve arbitrary server files.
  const filename = path.basename(req.params.filename);
  if (!filename || filename === '.' || filename === '..') {
    return res.status(400).json({ error: 'Invalid filename.' });
  }
  const filePath = path.join(OUTPUTS_DIR, filename);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send('Processed file not found or expired.');
  }

  res.download(filePath, filename);
});

router.get('/download-split/:dir/:filename', (req, res) => {
  // Path traversal fix (same class of bug as /download)
  const safeDir = path.basename(req.params.dir);
  const safeName = path.basename(req.params.filename);
  if (!safeDir || safeDir === '.' || safeDir === '..' || !safeName || safeName === '.' || safeName === '..') {
    return res.status(400).json({ error: 'Invalid path.' });
  }
  const filePath = path.join(OUTPUTS_DIR, safeDir, safeName);

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send('Split file not found or expired.');
  }

  res.download(filePath, safeName);
});

// Multer / upload error middleware — previously a >50MB upload crashed into a
// generic 500 HTML page instead of a clean JSON error.
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File exceeds the 50MB per-file upload limit.' });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Upload processing error.' });
  }
  next();
});

module.exports = router;
