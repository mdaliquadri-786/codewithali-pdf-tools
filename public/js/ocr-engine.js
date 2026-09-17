/**
 * CodeWithAli PDF Tools Suite - REAL OCR Engine
 * Uses Tesseract.js (lazy-loaded) + pdf.js to actually recognize text on
 * scanned/image-only PDF pages, instead of only reading an existing text layer.
 *
 * Drop this file in public/js/ocr-engine.js and load it BEFORE script.js:
 *   <script src="js/ocr-engine.js"></script>
 *
 * It does NOT touch your CDN <script> tags in index.html/tool.html — Tesseract
 * is only fetched on-demand the first time someone actually runs OCR, so it
 * never slows down the rest of the offline-first app.
 */

window.RealOCREngine = {
  _tesseractLoading: null,

  async ensureTesseract() {
    if (window.Tesseract) return window.Tesseract;
    if (this._tesseractLoading) return this._tesseractLoading;

    this._tesseractLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.5/tesseract.min.js';
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => reject(new Error('Could not load the OCR engine (Tesseract.js). Check your internet connection and try again.'));
      document.head.appendChild(s);
    });

    return this._tesseractLoading;
  },

  async renderPageCanvas(pdf, pageNum, scale) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { canvas, viewport };
  },

  /**
   * Runs real OCR over every page of a PDF file.
   * @param {File} file
   * @param {Object} options
   *   lang: tesseract language code(s), e.g. 'eng', 'eng+ara', 'eng+urd', 'eng+tel', 'eng+hin'
   *   scale: render scale for OCR accuracy (2.0 ≈ 200 DPI, 2.5 ≈ 250 DPI)
   *   buildSearchablePdf: if true, also returns a searchable PDF (image + invisible text layer)
   *   onProgress: callback({ stage, progress, page, totalPages })
   */
  async ocrPdfFile(file, options = {}) {
    const {
      lang = 'eng',
      scale = 2.0,
      buildSearchablePdf = false,
      onProgress = () => {}
    } = options;

    if (!window.pdfjsLib) throw new Error('pdf.js is not loaded yet — please retry in a moment.');
    if (!window.PDFLib) throw new Error('pdf-lib is not loaded yet — please retry in a moment.');

    await this.ensureTesseract();

    if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    const totalPages = pdf.numPages;

    const worker = await window.Tesseract.createWorker(lang, 1, {
      logger: (m) => {
        if (m && m.status) {
          onProgress({ stage: m.status, progress: m.progress || 0 });
        }
      }
    });

    let fullText = '';
    const pageAssets = [];

    try {
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        onProgress({ stage: 'rendering', progress: 0, page: pageNum, totalPages });
        const { canvas, viewport } = await this.renderPageCanvas(pdf, pageNum, scale);

        onProgress({ stage: 'recognizing', progress: 0, page: pageNum, totalPages });
        const { data } = await worker.recognize(canvas);

        fullText += (pageNum > 1 ? '\n\n' : '') + `--- Page ${pageNum} ---\n` + (data.text || '').trim();

        if (buildSearchablePdf) {
          pageAssets.push({ pageNum, words: data.words || [], viewport, jpgUrl: canvas.toDataURL('image/jpeg', 0.85) });
        }

        canvas.width = 0;
        canvas.height = 0;
      }
    } finally {
      await worker.terminate();
    }

    let searchablePdfBlob = null;

    if (buildSearchablePdf && pageAssets.length > 0) {
      const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
      const outDoc = await PDFDocument.create();
      const font = await outDoc.embedFont(StandardFonts.Helvetica);

      for (const asset of pageAssets) {
        const pw = asset.viewport.width / scale;
        const ph = asset.viewport.height / scale;
        const jpgBytes = await fetch(asset.jpgUrl).then(r => r.arrayBuffer());
        const img = await outDoc.embedJpg(jpgBytes);

        const page = outDoc.addPage([pw, ph]);
        page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });

        // Invisible (opacity 0) text layer positioned over each recognized word,
        // so the page LOOKS like the scan but is copy/search-able underneath.
        asset.words.forEach((w) => {
          if (!w.text || !w.text.trim() || !w.bbox) return;
          const x = w.bbox.x0 / scale;
          const yTop = w.bbox.y0 / scale;
          const boxW = (w.bbox.x1 - w.bbox.x0) / scale;
          const boxH = (w.bbox.y1 - w.bbox.y0) / scale;
          const fontSize = Math.max(4, Math.min(boxH * 0.85, 40));
          const y = ph - yTop - boxH;

          try {
            page.drawText(w.text, {
              x, y, size: fontSize, font,
              color: rgb(0, 0, 0),
              opacity: 0
            });
          } catch (e) {
            // Some OCR'd glyphs (rare control chars) aren't valid PDF text — skip them,
            // the visible page image is unaffected either way.
          }
        });
      }

      const bytes = await outDoc.save();
      searchablePdfBlob = new Blob([bytes], { type: 'application/pdf' });
    }

    return {
      success: true,
      text: fullText.trim(),
      pageCount: totalPages,
      searchablePdfBlob
    };
  }
};
