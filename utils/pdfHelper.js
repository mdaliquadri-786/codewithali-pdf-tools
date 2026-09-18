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

let archiver = null;
try {
  archiver = require('archiver');
} catch (e) {
  // archiver not installed
}

const PYTHON_ENGINE_PATH = path.join(__dirname, 'pdf_engine.py');

// Greedy text wrapper shared by PDF text-drawing helpers so long lines wrap
// instead of running off the page edge.
function wrapTextByWidth(font, text, size, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines = [];
  let current = '';
  for (const w of words) {
    const trial = current ? current + ' ' + w : w;
    try {
      if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = trial;
      }
    } catch (e) {
      lines.push(trial.substring(0, 90));
      current = '';
    }
  }
  if (current) lines.push(current);
  return lines;
}

function runPythonEngine(cmd, payload) {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  let result = spawnSync(pythonCmd, [PYTHON_ENGINE_PATH, cmd], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      throw new Error('Server-side Python engine is unavailable on this host (python3/python not found, or its PDF libraries are missing). Install Python 3 with pypdf, reportlab, python-docx and Pillow, or use the in-browser converters which run fully client-side.');
    }
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

async function isPdfEncrypted(filePath) {
  if (!PDFLib || !PDFLib.PDFDocument) return false;
  try {
    const doc = await PDFLib.PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true });
    return !!doc.isEncrypted || fs.readFileSync(filePath).toString('latin1').includes('/Encrypt');
  } catch (e) {
    return false;
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

  // Native "split into individual pages" mode (was Python-only before, which
  // crashed on hosts without the Python engine).
  if (PDFLib && PDFLib.PDFDocument && mode === 'all') {
    try {
      const srcDoc = await PDFLib.PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true });
      const total = srcDoc.getPageCount();
      const zipPath = path.join(outputDir, 'split_pages.zip');
      if (archiver) {
        await new Promise((resolveZip, rejectZip) => {
          const output = fs.createWriteStream(zipPath);
          const archive = archiver('zip', { zlib: { level: 9 } });
          output.on('close', resolveZip);
          output.on('error', rejectZip);
          archive.on('error', rejectZip);
          archive.pipe(output);
          (async () => {
            for (let i = 0; i < total; i++) {
              const single = await PDFLib.PDFDocument.create();
              const [p] = await single.copyPages(srcDoc, [i]);
              single.addPage(p);
              archive.append(await single.save(), { name: `page_${i + 1}.pdf` });
            }
            archive.finalize();
          })().catch(rejectZip);
        });
        return { success: true, output: zipPath, is_zip: true, file_count: total };
      }
    } catch (err) {
      console.warn('pdf-lib split-all fallback to engine:', err.message);
    }
  }

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

  try {
    return runPythonEngine('compress', {
      input_path: filePath,
      output_path: outputPath,
      level: level
    });
  } catch (err) {
    // Last resort: deliver the untouched original with honest 0% stats instead
    // of failing the whole request when no compression engine is available.
    fs.copyFileSync(filePath, outputPath);
    const originalSize = fs.statSync(filePath).size;
    return {
      success: true,
      output: outputPath,
      original_size: originalSize,
      compressed_size: originalSize,
      reduction_percentage: 0
    };
  }
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
      // parseInt('00', 16) === 0, and `0 || 0.4` silently turned black
      // channels into gray — parse defensively instead.
      const chan = (s) => {
        const v = parseInt(hex.substring(s, s + 2), 16);
        return Number.isFinite(v) ? v / 255.0 : 0.4;
      };
      const r = chan(0);
      const g = chan(2);
      const b = chan(4);

      pages.forEach((page) => {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const textHeight = font.heightAtSize(fontSize);

        if (position === 'diagonal') {
          const angleRad = Math.atan2(height, width);
          const angleDeg = (angleRad * 180) / Math.PI;
          const cos = Math.cos(angleRad);
          const sin = Math.sin(angleRad);
          // pdf-lib rotates around the draw origin, so back off the origin by
          // half the rotated bounding box to actually center the watermark
          // (the old formula ignored the rotation and drew it off-center).
          const x = width / 2 - (textWidth / 2) * cos + (textHeight / 2) * sin;
          const y = height / 2 - (textWidth / 2) * sin - (textHeight / 2) * cos;
          page.drawText(text, {
            x,
            y,
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
  // Native pdf-lib rotation (previously 100% Python-dependent -> crashed on
  // hosts without the Python engine).
  if (PDFLib && PDFLib.PDFDocument && PDFLib.degrees) {
    try {
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const normalized = ((parseInt(angle, 10) || 90) % 360 + 360) % 360;
      pdfDoc.getPages().forEach((page) => {
        const current = page.getRotation().angle;
        page.setRotation(PDFLib.degrees((current + normalized) % 360));
      });
      fs.writeFileSync(outputPath, await pdfDoc.save());
      return { success: true, output: outputPath, rotated_by: normalized };
    } catch (err) {
      console.warn('pdf-lib rotate fallback to engine:', err.message);
    }
  }

  return runPythonEngine('rotate', {
    input_path: filePath,
    output_path: outputPath,
    angle
  });
}

async function addPageNumbers(filePath, options = {}, outputPath) {
  // Native pdf-lib implementation (previously 100% Python-dependent).
  if (PDFLib && PDFLib.PDFDocument && PDFLib.StandardFonts) {
    try {
      const format = options.format || 'Page {n} of {total}';
      const position = options.position || 'bottom-center';
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
      const pages = pdfDoc.getPages();
      const total = pages.length;

      pages.forEach((page, idx) => {
        const label = format.replace('{n}', String(idx + 1)).replace('{total}', String(total));
        const { width, height } = page.getSize();
        const size = 10;
        const tw = font.widthOfTextAtSize(label, size);
        let x = (width - tw) / 2;
        let y = 20;
        if (position === 'bottom-right') {
          x = width - tw - 25;
          y = 20;
        } else if (position === 'top-center') {
          x = (width - tw) / 2;
          y = height - 25;
        }
        page.drawText(label, { x, y, size, font, color: PDFLib.rgb(0.2, 0.2, 0.2) });
      });

      fs.writeFileSync(outputPath, await pdfDoc.save());
      return { success: true, output: outputPath };
    } catch (err) {
      console.warn('pdf-lib page numbers fallback to engine:', err.message);
    }
  }

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
  // Native pdf-lib implementation with proper line wrapping (previously
  // 100% Python-dependent, and the Python version never wrapped long lines).
  if (PDFLib && PDFLib.PDFDocument && PDFLib.StandardFonts) {
    try {
      const doc = await PDFLib.PDFDocument.create();
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold);
      const pageW = 595.28;
      const pageH = 841.89;
      const margin = 50;
      const maxW = pageW - margin * 2;

      let page = doc.addPage([pageW, pageH]);
      let y = pageH - margin;

      for (const rawLine of String(markdown).split('\n')) {
        const line = rawLine.trim();
        if (!line) {
          y -= 10;
          continue;
        }

        let drawFont = font;
        let size = 11;
        let gap = 16;
        let indent = 0;
        let text = line;

        if (line.startsWith('# ')) {
          drawFont = fontBold; size = 19; gap = 26; y -= 8; text = line.slice(2);
        } else if (line.startsWith('## ')) {
          drawFont = fontBold; size = 14; gap = 20; y -= 6; text = line.slice(3);
        } else if (line.startsWith('### ')) {
          drawFont = fontBold; size = 12; gap = 18; y -= 4; text = line.slice(4);
        } else if (/^[-*] /.test(line)) {
          text = '• ' + line.slice(2);
          indent = 14;
        }

        const wrapped = wrapTextByWidth(drawFont, text, size, maxW - indent);
        for (const wl of wrapped) {
          if (y < margin + 20) {
            page = doc.addPage([pageW, pageH]);
            y = pageH - margin;
          }
          page.drawText(wl, { x: margin + indent, y, size, font: drawFont, color: PDFLib.rgb(0.15, 0.15, 0.15) });
          y -= gap;
        }
      }

      fs.writeFileSync(outputPath, await doc.save());
      return { success: true, output: outputPath };
    } catch (err) {
      console.warn('pdf-lib markdown fallback to engine:', err.message);
    }
  }

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
  markdownToPDF,
  isPdfEncrypted
};
