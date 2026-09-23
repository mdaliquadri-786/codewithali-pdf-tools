(function () {
  'use strict';

  function getToolKey() {
    const params = new URLSearchParams(window.location.search);
    const queryTool = params.get('tool');
    if (queryTool) return queryTool.toLowerCase().trim();

    const match = window.location.pathname.match(/\/tools\/([a-z0-9-]+)/i);
    return match ? match[1].toLowerCase() : null;
  }

  function getFallbackFilename(fileName, suffix) {
    const base = String(fileName || 'processed').replace(/\.[^/.]+$/, '');
    return `${base}${suffix}`;
  }

  function normalizeOutput(output, defaultType = 'application/pdf') {
    if (!output) throw new TypeError('PDF processing returned no output.');

    if (output && typeof output.downloadUrl === 'string' && output.downloadUrl.length > 0) {
      return { downloadUrl: output.downloadUrl, filename: output.filename || 'processed-file' };
    }
    if (output instanceof Blob) {
      return { downloadUrl: URL.createObjectURL(output), filename: 'processed-file' };
    }
    if (output instanceof ArrayBuffer) {
      return { downloadUrl: URL.createObjectURL(new Blob([output], { type: defaultType })), filename: 'processed-file' };
    }
    if (ArrayBuffer.isView(output)) {
      return {
        downloadUrl: URL.createObjectURL(new Blob([
          output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength)
        ], { type: defaultType })),
        filename: 'processed-file'
      };
    }
    throw new TypeError('Unsupported output type for file download generation.');
  }

  function patchMemoryManager() {
    if (typeof MemoryManager === 'undefined' || !MemoryManager || typeof MemoryManager.createTrackedUrl !== 'function') return;
    const original = MemoryManager.createTrackedUrl.bind(MemoryManager);
    MemoryManager.createTrackedUrl = function (output) {
      if (output && typeof output.downloadUrl === 'string' && output.downloadUrl.length > 0) return output.downloadUrl;
      if (output instanceof Blob) return original(output);
      if (output instanceof ArrayBuffer) return original(new Blob([output], { type: 'application/pdf' }));
      if (ArrayBuffer.isView(output)) {
        return original(new Blob([
          output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength)
        ], { type: 'application/pdf' }));
      }
      throw new TypeError('Invalid output supplied for download URL generation.');
    };
  }

  function ensureDownloadButtonId() {
    const oldButton = document.getElementById('downloadBtn');
    const newButton = document.getElementById('downloadResultBtn');
    if (oldButton && !newButton) oldButton.id = 'downloadResultBtn';
  }

  function injectLayoutFixes() {
    if (document.getElementById('codewithali-layout-fixes')) return;
    const style = document.createElement('style');
    style.id = 'codewithali-layout-fixes';
    style.textContent = `
      .files-container { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)) !important; gap: 12px !important; width: 100% !important; }
      .file-card { min-width: 0 !important; max-width: 100% !important; overflow: hidden !important; }
      .file-card-info { min-width: 0 !important; overflow: hidden !important; }
      .file-card-info strong { display: block !important; width: 100% !important; overflow: hidden !important; white-space: nowrap !important; text-overflow: ellipsis !important; }
    `;
    document.head.appendChild(style);
  }

  function getPdfJsImage(page, objectId) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (image) => {
        if (settled) return;
        settled = true;
        resolve(image || null);
      };
      const timer = setTimeout(() => finish(null), 15000);
      try {
        const image = page.objs.get(objectId, (loadedImage) => {
          clearTimeout(timer);
          finish(loadedImage);
        });
        if (image) {
          clearTimeout(timer);
          finish(image);
        }
      } catch (error) {
        clearTimeout(timer);
        finish(null);
      }
    });
  }

  async function imageObjectToPng(image) {
    if (!image || !image.width || !image.height) return null;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return null;

    if (image.bitmap) {
      context.drawImage(image.bitmap, 0, 0);
    } else if (image.data) {
      const pixels = new Uint8ClampedArray(image.width * image.height * 4);
      const source = image.data;
      if (image.kind === 3 || source.length === pixels.length) {
        pixels.set(source.subarray(0, pixels.length));
      } else if (image.kind === 2 || source.length >= image.width * image.height * 3) {
        for (let index = 0, sourceIndex = 0; index < image.width * image.height; index++, sourceIndex += 3) {
          pixels[index * 4] = source[sourceIndex];
          pixels[index * 4 + 1] = source[sourceIndex + 1];
          pixels[index * 4 + 2] = source[sourceIndex + 2];
          pixels[index * 4 + 3] = 255;
        }
      } else {
        for (let index = 0; index < image.width * image.height; index++) {
          const value = source[index] || 0;
          pixels[index * 4] = value;
          pixels[index * 4 + 1] = value;
          pixels[index * 4 + 2] = value;
          pixels[index * 4 + 3] = 255;
        }
      }
      context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
    } else {
      return null;
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        canvas.width = 1;
        canvas.height = 1;
        resolve(blob || null);
      }, 'image/png');
    });
  }

  async function extractImagesReliably(file, onProgress) {
    if (!window.pdfjsLib) throw new Error('PDF.js library is still loading. Please try again.');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const OPS = window.pdfjsLib.OPS || {};
    const images = [];
    const seenObjects = new Set();

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const operatorList = await page.getOperatorList();
      let imageNumber = 0;

      for (let index = 0; index < operatorList.fnArray.length; index++) {
        const operation = operatorList.fnArray[index];
        const args = operatorList.argsArray[index] || [];
        const isObjectImage = operation === OPS.paintImageXObject || operation === OPS.paintImageMaskXObject;
        const isInlineImage = operation === OPS.paintInlineImageXObject;
        if (!isObjectImage && !isInlineImage) continue;

        let image;
        let objectId;
        if (isObjectImage) {
          objectId = args[0];
          if (objectId && seenObjects.has(`${pageNumber}:${objectId}`)) continue;
          image = await getPdfJsImage(page, objectId);
        } else {
          image = args[0];
        }
        if (objectId) seenObjects.add(`${pageNumber}:${objectId}`);

        const blob = await imageObjectToPng(image);
        if (!blob) continue;
        imageNumber++;
        images.push({ name: `page${pageNumber}_image${imageNumber}.png`, blob });
      }
      if (onProgress) onProgress(Math.round((pageNumber / pdf.numPages) * 100));
    }
    return images;
  }

  async function showExtractImagesResult(file) {
    const extracted = await extractImagesReliably(file, (progress) => {
      if (typeof setProgressBar === 'function') setProgressBar(progress);
    });
    if (extracted.length === 0) {
      throw new Error('This PDF does not contain extractable embedded images. Please choose a PDF containing an image or photo.');
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    let output;
    let filename;
    if (extracted.length === 1) {
      output = extracted[0].blob;
      filename = `${baseName}_${extracted[0].name}`;
    } else {
      if (!window.JSZip) throw new Error('The ZIP download library failed to load. Please reload the page and try again.');
      const zip = new window.JSZip();
      extracted.forEach((image) => zip.file(image.name, image.blob));
      output = await zip.generateAsync({ type: 'blob' });
      filename = `${baseName}_ExtractedImages.zip`;
    }

    const overlay = document.getElementById('processingOverlay');
    const workspaceBody = document.getElementById('workspaceBody');
    const resultCard = document.getElementById('resultCard');
    const downloadButton = document.getElementById('downloadResultBtn') || document.getElementById('downloadBtn');
    if (overlay) overlay.style.display = 'none';
    if (workspaceBody) workspaceBody.style.display = 'none';
    if (resultCard) resultCard.style.display = 'block';
    if (downloadButton) {
      downloadButton.href = URL.createObjectURL(output);
      downloadButton.download = filename;
    }
    const resultTitle = document.getElementById('resultTitle');
    if (resultTitle) resultTitle.textContent = 'Extract Images Completed!';
  }

  function attachSafeFallback() {
    const actionButton = document.getElementById('actionSubmitBtn');
    if (!actionButton || actionButton.dataset.safePatchInstalled) return;
    actionButton.dataset.safePatchInstalled = 'true';
    const originalHandler = actionButton.onclick;

    actionButton.onclick = async function (event) {
      const tool = getToolKey();
      const input = document.querySelector('input[type="file"]');
      if (tool === 'extract-images' && input && input.files && input.files.length > 0) {
        if (typeof showProcessingOverlay === 'function') showProcessingOverlay();
        try {
          await showExtractImagesResult(input.files[0]);
        } catch (error) {
          if (typeof hideProcessingOverlay === 'function') hideProcessingOverlay();
          if (typeof showToast === 'function') showToast(error.message || 'Image extraction failed.', 'error');
          console.error('[CodeWithAli] Image extraction failed:', error);
        }
        return;
      }

      try {
        if (typeof originalHandler === 'function') {
          await originalHandler.call(this, event);
          return;
        }
      } catch (error) {
        console.error('[CodeWithAli] Original action handler failed:', error);
      }

      const files = input && input.files ? Array.from(input.files) : [];
      const file = files[0];
      const engine = window.ClientPDFEngine;
      if (!file || !engine) return;

      try {
        let output;
        let filename = 'processed-file';
        if (tool === 'merge') {
          if (files.length < 2) throw new Error('Please select at least two PDF files to merge.');
          output = await engine.mergePDFs(files);
          filename = 'CodeWithAli_Merged.pdf';
        } else if (tool === 'split') {
          output = await engine.splitPDF(file, 'range', '1');
          filename = getFallbackFilename(file.name, '_Split.pdf');
        } else if (tool === 'compress') {
          output = await engine.compressPDF(file, 'balanced');
          filename = `CodeWithAli_Compressed_${file.name}`;
        } else if (tool === 'rotate') {
          output = await engine.rotatePDF(file, 90);
          filename = `CodeWithAli_Rotated_${file.name}`;
        } else if (tool === 'pdf-to-word') {
          output = await engine.pdfToWord(file);
          filename = getFallbackFilename(file.name, '_Converted.docx');
        } else {
          return;
        }

        const normalized = normalizeOutput(output, 'application/pdf');
        const processingOverlay = document.getElementById('processingOverlay');
        const workspaceBody = document.getElementById('workspaceBody');
        const resultCard = document.getElementById('resultCard');
        const downloadButton = document.getElementById('downloadResultBtn') || document.getElementById('downloadBtn');
        if (processingOverlay) processingOverlay.style.display = 'none';
        if (workspaceBody) workspaceBody.style.display = 'none';
        if (resultCard) resultCard.style.display = 'block';
        if (downloadButton) {
          downloadButton.href = normalized.downloadUrl;
          downloadButton.download = filename || normalized.filename;
        }
      } catch (error) {
        const overlay = document.getElementById('processingOverlay');
        if (overlay) overlay.style.display = 'none';
        console.error('[CodeWithAli] Safe processing fallback failed:', error);
        if (typeof showToast === 'function') showToast(error.message || 'PDF processing failed.', 'error');
      }
    };
  }

  function installFixes() {
    patchMemoryManager();
    ensureDownloadButtonId();
    injectLayoutFixes();
    attachSafeFallback();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installFixes, { once: true });
  } else {
    installFixes();
  }
  setTimeout(installFixes, 250);
  setTimeout(installFixes, 1000);
})();
