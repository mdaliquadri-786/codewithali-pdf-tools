/**
 * CodeWithAli PDF Tools Suite - Real Engine Overrides
 * ---------------------------------------------------
 * Load this AFTER script.js (and after ocr-engine.js / word-to-pdf.js /
 * excel-to-pdf.js). It is PURE ADDITION — it never edits, requires editing,
 * or depends on the exact contents of script.js, so there is no line-hunting
 * and no risk of corrupting that file. It works by re-assigning a couple of
 * global functions and the action button's click handler after script.js has
 * already run.
 *
 * WHILE WIRING THIS IN, two pre-existing bugs were found that silently broke
 * EVERY tool's result screen (not just the 3 new ones) — fixed here globally:
 *   1. showResultScreen() looked for an element with id "downloadResultBtn",
 *      but tool.html's actual download link has id "downloadBtn" — so the
 *      Download button's href/filename were NEVER set, for any tool.
 *   2. setProgressBar() looked for id "progressBar", but the real progress
 *      fill element is "progressBarInner" (and "progressPercentage" was never
 *      updated at all) — so the progress bar visually never moved.
 *
 * Then it wires real, working client-side engines for the 3 tools that were
 * previously silently broken or fake:
 *   - word-to-pdf   -> real .doc/.docx parsing via Mammoth.js
 *   - excel-to-pdf  -> real .xlsx/.xls/.csv parsing via SheetJS
 *   - ocr           -> real Tesseract.js OCR, outputs a searchable PDF
 */
(function () {
  function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
  }

  // ---------------------------------------------------------------------
  // Fix #1 + #2 — correct element IDs, globally, for every tool on the site
  // ---------------------------------------------------------------------
  window.setProgressBar = function (pct) {
    const bar = document.getElementById('progressBarInner');
    if (bar) bar.style.width = `${pct}%`;
    const pctText = document.getElementById('progressPercentage');
    if (pctText) pctText.textContent = `${Math.round(pct)}%`;
  };

  window.showResultScreen = function (resData, toolConfig) {
    if (typeof window.hideProcessingOverlay === 'function') window.hideProcessingOverlay();

    const workspaceBody = document.getElementById('workspaceBody');
    const resultCard = document.getElementById('resultCard');
    if (workspaceBody) workspaceBody.style.display = 'none';
    if (!resultCard) return;
    resultCard.style.display = 'block';

    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
      downloadBtn.href = resData.downloadUrl;
      downloadBtn.download = resData.filename || 'CodeWithAli_Document.pdf';
    }

    const resTitle = document.getElementById('resultTitle');
    if (resTitle) resTitle.textContent = `${(toolConfig && toolConfig.name) || 'Process'} Completed!`;

    const resSubtitle = document.getElementById('resultSubtitle');
    if (resSubtitle) resSubtitle.textContent = resData.message || 'Your document is ready for instant download.';

    const resultStats = document.getElementById('resultStats');
    if (resultStats) {
      if (resData.originalSize && resData.compressedSize) {
        resultStats.style.display = 'inline-flex';
        const origEl = document.getElementById('statOriginalSize');
        const newEl = document.getElementById('statNewSize');
        const redEl = document.getElementById('statReduction');
        if (origEl) origEl.textContent = formatBytes(resData.originalSize);
        if (newEl) newEl.textContent = formatBytes(resData.compressedSize);
        if (redEl) {
          const pct = resData.originalSize > 0
            ? Math.max(0, Math.round((1 - (resData.compressedSize / resData.originalSize)) * 100))
            : 0;
          redEl.textContent = `${pct}%`;
        }
      } else {
        resultStats.style.display = 'none';
      }
    }

    const ocrBox = document.getElementById('ocrOutputBox');
    const ocrTextArea = document.getElementById('ocrTextResult');
    const extractedBox = document.getElementById('extractedTextBox');
    const extractedTextArea = document.getElementById('extractedTextContent');
    const isOcr = toolConfig && toolConfig.key === 'ocr';

    if (typeof resData.text === 'string' && resData.text.trim()) {
      if (isOcr && ocrBox && ocrTextArea) {
        ocrTextArea.value = resData.text;
        ocrBox.style.display = 'block';
        if (extractedBox) extractedBox.style.display = 'none';
      } else if (extractedBox && extractedTextArea) {
        extractedTextArea.value = resData.text;
        extractedBox.style.display = 'block';
        if (ocrBox) ocrBox.style.display = 'none';
      }
    } else {
      if (ocrBox) ocrBox.style.display = 'none';
      if (extractedBox) extractedBox.style.display = 'none';
    }

    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) {
      restartBtn.onclick = () => {
        resultCard.style.display = 'none';
        if (workspaceBody) workspaceBody.style.display = 'grid';
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.value = '';
        const filesContainer = document.getElementById('filesContainer');
        if (filesContainer) filesContainer.innerHTML = '';
        const fileListWrapper = document.getElementById('fileListWrapper');
        if (fileListWrapper) fileListWrapper.style.display = 'none';
        const dropzone = document.getElementById('dropzone');
        if (dropzone) dropzone.style.display = 'block';
        if (resultStats) resultStats.style.display = 'none';
        if (ocrBox) ocrBox.style.display = 'none';
        if (extractedBox) extractedBox.style.display = 'none';
      };
    }
  };

  // ---------------------------------------------------------------------
  // Real engines for the 3 previously fake/broken tools
  // ---------------------------------------------------------------------
  function currentToolKey() {
    const params = new URLSearchParams(window.location.search);
    return (params.get('tool') || '').toLowerCase().trim();
  }

  const toolKey = currentToolKey();

  const ACCEPT_OVERRIDES = {
    'word-to-pdf': {
      accept: '.doc,.docx,.txt,.md,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown',
      hint: 'or drop a .docx, .txt, or .md file here',
      btnText: 'Select Word / Text File',
      desc: 'Genuinely parses .docx (Word 2007+) files and converts them to a real, paginated PDF. Legacy .doc must be re-saved as .docx first (Word: File > Save As > Word Document).'
    },
    'excel-to-pdf': {
      accept: '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv',
      hint: 'or drop a .xlsx, .xls, or .csv file here',
      btnText: 'Select Spreadsheet File',
      desc: 'Genuinely parses .xlsx/.xls workbooks (every sheet, real cell values) into paginated PDF tables. .csv is also supported.'
    },
    'ocr': {
      desc: 'Real optical character recognition (Tesseract.js) — works on scanned / image-only PDF pages, not just PDFs that already have a text layer. Produces a searchable PDF.'
    }
  };

  const REAL_TOOLS = {
    'word-to-pdf': {
      name: 'Document / Text to PDF',
      run: async (file) => {
        const blob = await window.RealWordToPDF.convert(file);
        return {
          success: true,
          downloadUrl: URL.createObjectURL(blob),
          filename: `${file.name.replace(/\.[^/.]+$/, '')}_Converted.pdf`,
          message: 'Document converted to PDF successfully!'
        };
      }
    },
    'excel-to-pdf': {
      name: 'CSV / Tabular Data to PDF',
      run: async (file) => {
        const blob = await window.RealExcelToPDF.convert(file);
        return {
          success: true,
          downloadUrl: URL.createObjectURL(blob),
          filename: `${file.name.replace(/\.[^/.]+$/, '')}_Converted.pdf`,
          message: 'Spreadsheet converted to PDF successfully!'
        };
      }
    },
    'ocr': {
      name: 'Digital Text Layer Extractor & Reconstructor',
      run: async (file) => {
        const langMap = { universal: 'eng', eng: 'eng', ara_urd: 'ara+urd', tel_hin: 'tel+hin' };
        const sel = document.getElementById('ocrLangSelect');
        const lang = langMap[sel ? sel.value : 'universal'] || 'eng';

        const res = await window.RealOCREngine.ocrPdfFile(file, {
          lang,
          buildSearchablePdf: true,
          onProgress: (p) => {
            const statusEl = document.getElementById('processingStatus');
            const subEl = document.getElementById('processingSubtitle');
            if (statusEl) statusEl.textContent = p.stage === 'recognizing' ? 'Recognizing text (OCR)...' : 'Rendering page...';
            if (subEl && p.totalPages) subEl.textContent = `Page ${p.page || 1} of ${p.totalPages} — ${Math.round((p.progress || 0) * 100)}%`;
            if (p.totalPages) {
              const pct = Math.min(99, Math.round((((p.page || 1) - 1) / p.totalPages) * 100 + ((p.progress || 0) * 100 / p.totalPages)));
              window.setProgressBar(pct);
            }
          }
        });

        const blob = res.searchablePdfBlob || new Blob(['\ufeff', res.text], { type: 'text/plain;charset=utf-8' });
        return {
          success: true,
          downloadUrl: URL.createObjectURL(blob),
          filename: `${file.name.replace(/\.[^/.]+$/, '')}_Searchable.pdf`,
          text: res.text,
          message: `OCR complete — recognized text across ${res.pageCount} page(s).`
        };
      }
    }
  };

  if (!REAL_TOOLS[toolKey]) return; // Not one of the 3 pages this file changes — do nothing else.

  function bindRealEngine() {
    const actionBtn = document.getElementById('actionSubmitBtn');
    const fileInput = document.getElementById('fileInput');
    const dropzone = document.getElementById('dropzone');
    if (!actionBtn) return;

    // Widen the native file picker + update on-page copy for the 2 conversion tools.
    const acc = ACCEPT_OVERRIDES[toolKey];
    if (acc) {
      if (acc.accept && fileInput) fileInput.accept = acc.accept;
      if (acc.hint) {
        const hintEl = document.getElementById('dropzoneHint');
        if (hintEl) hintEl.textContent = acc.hint;
      }
      if (acc.btnText) {
        const btnTextEl = document.getElementById('selectFilesBtnText');
        if (btnTextEl) btnTextEl.textContent = acc.btnText;
      }
      if (acc.desc) {
        const descEl = document.getElementById('workspaceDesc');
        if (descEl) descEl.textContent = acc.desc;
      }
    }

    // Track the most-recently chosen/dropped file independently of script.js's
    // own internal state (which we deliberately don't touch or depend on).
    let latestFile = null;
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) latestFile = e.target.files[0];
      });
    }
    if (dropzone) {
      dropzone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          latestFile = e.dataTransfer.files[0];
        }
      });
    }

    // Replace whatever click handler script.js already attached for this tool
    // (its default branch for these 3 keys just fails — this takes over fully).
    actionBtn.onclick = async () => {
      const file = latestFile || (fileInput && fileInput.files && fileInput.files[0]);
      if (!file) {
        if (typeof window.showToast === 'function') window.showToast('Please select a file first.', 'error');
        return;
      }

      if (typeof window.showProcessingOverlay === 'function') window.showProcessingOverlay();
      window.setProgressBar(10);

      try {
        const resData = await REAL_TOOLS[toolKey].run(file);
        window.setProgressBar(100);
        window.showResultScreen(resData, { key: toolKey, name: REAL_TOOLS[toolKey].name });
      } catch (err) {
        console.error('[RealEngineOverride]', err);
        if (typeof window.hideProcessingOverlay === 'function') window.hideProcessingOverlay();
        if (typeof window.showToast === 'function') {
          window.showToast(err.message || 'Something went wrong while processing this file.', 'error');
        } else {
          alert(err.message || 'Something went wrong while processing this file.');
        }
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindRealEngine);
  } else {
    bindRealEngine();
  }
})();
