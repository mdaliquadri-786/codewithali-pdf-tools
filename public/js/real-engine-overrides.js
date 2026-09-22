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
      return {
        downloadUrl: output.downloadUrl,
        filename: output.filename || 'processed-file'
      };
    }

    if (output instanceof Blob) {
      return { downloadUrl: URL.createObjectURL(output), filename: 'processed-file' };
    }

    if (output instanceof ArrayBuffer) {
      return {
        downloadUrl: URL.createObjectURL(new Blob([output], { type: defaultType })),
        filename: 'processed-file'
      };
    }

    if (ArrayBuffer.isView(output)) {
      return {
        downloadUrl: URL.createObjectURL(new Blob([output.buffer], { type: defaultType })),
        filename: 'processed-file'
      };
    }

    throw new TypeError('Unsupported output type for file download generation.');
  }

  function patchMemoryManager() {
    if (typeof MemoryManager === 'undefined' || !MemoryManager || typeof MemoryManager.createTrackedUrl !== 'function') return;

    const original = MemoryManager.createTrackedUrl.bind(MemoryManager);
    MemoryManager.createTrackedUrl = function (output) {
      if (output && typeof output.downloadUrl === 'string' && output.downloadUrl.length > 0) {
        return output.downloadUrl;
      }
      if (output instanceof Blob) return original(output);
      if (output instanceof ArrayBuffer) return original(new Blob([output], { type: 'application/pdf' }));
      if (ArrayBuffer.isView(output)) return original(new Blob([output.buffer], { type: 'application/pdf' }));
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

  function attachSafeFallback() {
    const actionButton = document.getElementById('actionSubmitBtn');
    if (!actionButton || actionButton.dataset.safePatchInstalled) return;
    actionButton.dataset.safePatchInstalled = 'true';

    const originalHandler = actionButton.onclick;
    actionButton.onclick = async function (event) {
      try {
        if (typeof originalHandler === 'function') {
          await originalHandler.call(this, event);
          return;
        }
      } catch (error) {
        console.error('[CodeWithAli] original action handler failed:', error);
      }

      const tool = getToolKey();
      const input = document.querySelector('input[type="file"]');
      if (!input || !input.files || input.files.length === 0) return;

      const files = Array.from(input.files);
      const file = files[0];
      const engine = window.ClientPDFEngine;
      if (!engine) return;

      try {
        let output;
        let filename = 'processed-file';

        if (tool === 'merge') {
          if (files.length < 2) throw new Error('Please select at least two PDF files to merge.');
          output = await engine.mergePDFs(files);
          filename = 'CodeWithAli_Merged.pdf';
        }
        else if (tool === 'split') {
          output = await engine.splitPDF(file, 'range', '1');
          filename = getFallbackFilename(file.name, '_Split.pdf');
        }
        else if (tool === 'compress') {
          output = await engine.compressPDF(file, 'balanced');
          filename = `CodeWithAli_Compressed_${file.name}`;
        }
        else if (tool === 'rotate') {
          output = await engine.rotatePDF(file, 90);
          filename = `CodeWithAli_Rotated_${file.name}`;
        }
        else if (tool === 'pdf-to-word') {
          output = await engine.pdfToWord(file);
          filename = getFallbackFilename(file.name, '_Converted.docx');
        }
        else {
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
