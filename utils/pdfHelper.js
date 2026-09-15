/**
 * CodeWithAli PDF Tools Suite - PDF Helper Utility
 * Implements PDF manipulation using pdf-lib and sharp, with high-performance
 * native engine fallback for zero-downtime environments.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let PDFLib = null;
let sharp = null;
try {
  PDFLib = require('pdf-lib');
} catch (e) {
  // pdf-lib not installed via npm yet
}

try {
  sharp = require('sharp');
} catch (e) {
  // sharp not installed via npm yet
}

const PYTHON_ENGINE_PATH = path.join(__dirname, 'pdf_engine.py');

function runPythonEngine(cmd, payload) {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  let result = spawnSync(pythonCmd, [PYTHON_ENGINE_PATH, cmd], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024
  });

  if (result.error) {
    throw new Error(`Python engine execution failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Python engine error (${result.status}): ${result.stderr || result.stdout}`);
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch (err) {
    throw new Error(`Failed to parse engine output: ${result.stdout}`);
  }
}

async function mergePDFs(filePaths, outputPath) {
  if (PDFLib && PDFLib.PDFDocument) {
    try {
      const mergedPdf = await PDFLib.PDFDocument.create();
      for (const filePath of filePaths) {
        if (!fs.existsSync(filePath)) continue;
        const pdfBytes = fs.readFileSync(filePath);
        const pdf = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }
      const mergedPdfBytes = await mergedPdf.save({ useObjectStreams: true });
      fs.writeFileSync(outputPath, mergedPdfBytes);
      return { success: true, output: outputPath, pageCount: mergedPdf.getPageCount() };
    } catch (err) {
      console.warn('pdf-lib merge encountered error, falling back to internal engine:', err.message);
    }
  }

  return runPythonEngine('merge', { input_paths: filePaths, output_path: outputPath });
}

async function splitPDF(filePath, mode = 'all', pageRange = '', outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  if (PDFLib && PDFLib.PDFDocument && mode === 'range') {
    try {
      const pdfBytes = fs.readFileSync(filePath);
      const srcDoc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const totalPages = srcDoc.getPageCount();
      const targetDoc = await PDFLib.PDFDocument.create();

      const indicesToCopy = new Set();
      const parts = pageRange.split(',').map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        if (part.includes('-')) {
          const [startStr, endStr] = part.split('-');
          const start = Math.max(1, parseInt(startStr, 10));
          const end = Math.min(totalPages, parseInt(endStr, 10));
          for (let p = start; p <= end; p++) indicesToCopy.add(p - 1);
        } else {
          const p = parseInt(part, 10);
          if (p >= 1 && p <= totalPages) indicesToCopy.add(p - 1);
        }
      }

      const sortedIndices = Array.from(indicesToCopy).sort((a, b) => a - b);
      if (sortedIndices.length === 0) {
        for (let i = 0; i < totalPages; i++) sortedIndices.push(i);
      }

      const copiedPages = await targetDoc.copyPages(srcDoc, sortedIndices);
      copiedPages.forEach(p => targetDoc.addPage(p));

      const outPdf = path.join(outputDir, 'split_extracted.pdf');
      const outBytes = await targetDoc.save();
      fs.writeFileSync(outPdf, outBytes);
      return { success: true, output: outPdf, is_zip: false, pageCount: sortedIndices.length };
    } catch (err) {
      console.warn('pdf-lib split fallback to engine:', err.message);
    }
  }

  return runPythonEngine('split', {
    input_path: filePath,
    output_dir: outputDir,
    mode: mode,
    page_range: pageRange
  });
}

async function compressPDF(filePath, level = 'recommended', outputPath) {
  if (PDFLib && PDFLib.PDFDocument) {
    try {
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const compressedBytes = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
      
      const originalSize = fs.statSync(filePath).size;
      fs.writeFileSync(outputPath, compressedBytes);
      const compressedSize = fs.statSync(outputPath).size;

      if (compressedSize < originalSize) {
        const reduction = Math.max(0, Math.round((1 - (compressedSize / originalSize)) * 100 * 10) / 10);
        return {
          success: true,
          output: outputPath,
          original_size: originalSize,
          compressed_size: compressedSize,
          reduction_percentage: reduction
        };
      }
    } catch (err) {
      console.warn('pdf-lib compress fallback to engine:', err.message);
    }
  }

  return runPythonEngine('compress', {
    input_path: filePath,
    output_path: outputPath,
    level: level
  });
}

async function imagesToPDF(imagePaths, options = {}, outputPath) {
  const { orientation = 'portrait', margin = 20, pageSize = 'a4' } = options;

  if (PDFLib && PDFLib.PDFDocument) {
    try {
      const pdfDoc = await PDFLib.PDFDocument.create();
      for (const imgPath of imagePaths) {
        if (!fs.existsSync(imgPath)) continue;
        const imgBuffer = fs.readFileSync(imgPath);
        let embeddedImage = null;
        const ext = path.extname(imgPath).toLowerCase();

        if (ext === '.jpg' || ext === '.jpeg') {
          embeddedImage = await pdfDoc.embedJpg(imgBuffer);
        } else if (ext === '.png') {
          embeddedImage = await pdfDoc.embedPng(imgBuffer);
        } else if (sharp) {
          const pngBuffer = await sharp(imgBuffer).png().toBuffer();
          embeddedImage = await pdfDoc.embedPng(pngBuffer);
        }

        if (embeddedImage) {
          const dims = embeddedImage.scale(1);
          let pageW = 595.28;
          let pageH = 841.89;
          if (orientation === 'landscape') {
            pageW = 841.89;
            pageH = 595.28;
          } else if (orientation === 'fit') {
            pageW = dims.width;
            pageH = dims.height;
          }

          const page = pdfDoc.addPage([pageW, pageH]);
          if (orientation === 'fit') {
            page.drawImage(embeddedImage, { x: 0, y: 0, width: dims.width, height: dims.height });
          } else {
            const availW = pageW - 2 * margin;
            const availH = pageH - 2 * margin;
            const scale = Math.min(availW / dims.width, availH / dims.height);
            const drawW = dims.width * scale;
            const drawH = dims.height * scale;
            const x = (pageW - drawW) / 2;
            const y = (pageH - drawH) / 2;
            page.drawImage(embeddedImage, { x, y, width: drawW, height: drawH });
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      fs.writeFileSync(outputPath, pdfBytes);
      return { success: true, output: outputPath };
    } catch (err) {
      console.warn('pdf-lib imagesToPDF fallback to engine:', err.message);
    }
  }

  return runPythonEngine('image_to_pdf', {
    image_paths: imagePaths,
    output_path: outputPath,
    orientation,
    margin,
    page_size: pageSize
  });
}

async function addWatermark(filePath, text = 'CONFIDENTIAL', options = {}, outputPath) {
  const {
    position = 'diagonal',
    opacity = 0.3,
    fontSize = 48,
    color = '#666666'
  } = options;

  if (PDFLib && PDFLib.PDFDocument && PDFLib.rgb && PDFLib.degrees && PDFLib.StandardFonts) {
    try {
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();

      const hex = color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) / 255.0 || 0.4;
      const g = parseInt(hex.substring(2, 4), 16) / 255.0 || 0.4;
      const b = parseInt(hex.substring(4, 6), 16) / 255.0 || 0.4;

      pages.forEach((page) => {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const textHeight = font.heightAtSize(fontSize);

        if (position === 'diagonal') {
          const angleRad = Math.atan2(height, width);
          const angleDeg = (angleRad * 180) / Math.PI;
          page.drawText(text, {
            x: (width - textWidth * Math.cos(angleRad)) / 2,
            y: (height - textWidth * Math.sin(angleRad)) / 2,
            size: fontSize,
            font: font,
            color: PDFLib.rgb(r, g, b),
            opacity: parseFloat(opacity),
            rotate: PDFLib.degrees(angleDeg)
          });
        } else if (position === 'center') {
          page.drawText(text, {
            x: (width - textWidth) / 2,
            y: (height - textHeight) / 2,
            size: fontSize,
            font: font,
            color: PDFLib.rgb(r, g, b),
            opacity: parseFloat(opacity)
          });
        } else if (position === 'bottom-right') {
          page.drawText(text, {
            x: width - textWidth - 30,
            y: 30,
            size: fontSize * 0.6,
            font: font,
            color: PDFLib.rgb(r, g, b),
            opacity: parseFloat(opacity)
          });
        }
      });

      const watermarkedBytes = await pdfDoc.save();
      fs.writeFileSync(outputPath, watermarkedBytes);
      return { success: true, output: outputPath, pages_watermarked: pages.length };
    } catch (err) {
      console.warn('pdf-lib watermark fallback to engine:', err.message);
    }
  }

  return runPythonEngine('watermark', {
    input_path: filePath,
    output_path: outputPath,
    text,
    position,
    opacity,
    font_size: fontSize,
    color
  });
}

async function rotatePDF(filePath, angle = 90, outputPath) {
  return runPythonEngine('rotate', {
    input_path: filePath,
    output_path: outputPath,
    angle
  });
}

async function addPageNumbers(filePath, options = {}, outputPath) {
  return runPythonEngine('page_numbers', {
    input_path: filePath,
    output_path: outputPath,
    format: options.format || 'Page {n} of {total}',
    position: options.position || 'bottom-center'
  });
}

async function extractText(filePath) {
  return runPythonEngine('extract_text', { input_path: filePath });
}

async function markdownToPDF(markdown, outputPath) {
  return runPythonEngine('markdown_to_pdf', { markdown, output_path: outputPath });
}

async function pdfToWord(filePath, outputPath) {
  return runPythonEngine('pdf_to_word', {
    input_path: filePath,
    output_path: outputPath
  });
}

module.exports = {
  pdfToWord,
  mergePDFs,
  splitPDF,
  compressPDF,
  imagesToPDF,
  addWatermark,
  rotatePDF,
  addPageNumbers,
  extractText,
  markdownToPDF
};
