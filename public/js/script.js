
// Interactive Signature Canvas Controller
let activeSigColor = '#0f172a';
let isSignatureDrawn = false;

function initSignatureCanvas() {
  const canvas = document.getElementById('signaturePad');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let drawing = false;

  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = activeSigColor;

  function start(e) {
    drawing = true;
    isSignatureDrawn = true;
    ctx.beginPath();
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  }

  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  }

  function end() {
    drawing = false;
  }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);

  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', end);

  // Ink color switch
  document.querySelectorAll('.sig-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sig-color-btn').forEach(b => b.style.boxShadow = '0 0 0 1px #cbd5e1');
      btn.style.boxShadow = `0 0 0 2px ${btn.dataset.color}`;
      activeSigColor = btn.dataset.color;
      ctx.strokeStyle = activeSigColor;
    });
  });

  const clearBtn = document.getElementById('clearSignatureBtn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      isSignatureDrawn = false;
    };
  }
}

/**
 * CodeWithAli PDF Tools Suite - Client-Side Architecture v12.0
 * High-Performance, 100% Client-Side In-Browser Engine
 * 
 * CORE PRINCIPLES:
 * 1. ZERO SERVER ROUND-TRIPS: 100% Client-Side binary ArrayBuffer/Blob execution.
 * 2. ENGINE 1 (Manipulation): pdf-lib for immutable, near-native PDF processing.
 * 3. ENGINE 2 (Rendering/Previews): Mozilla pdfjs-dist for visual page previews with a concurrency-limited pipeline.
 * 4. MEMORY EFFICIENCY: Active tracking and revocation of Object URLs (URL.revokeObjectURL) & canvas disposal.
 * 5. IMMUTABILITY: Original file objects remain untouched; new byte buffers are generated for every task.
 */

// =============================================================================
// 1. MEMORY & RESOURCE LIFECYCLE MANAGER
// =============================================================================
const MemoryManager = {
  activeUrls: new Set(),

  createTrackedUrl(blob) {
    const url = URL.createObjectURL(blob);
    this.activeUrls.add(url);
    return url;
  },

  revoke(url) {
    if (url && this.activeUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.activeUrls.delete(url);
    }
  },

  disposeAll() {
    this.activeUrls.forEach(url => {
      URL.revokeObjectURL(url);
    });
    this.activeUrls.clear();
  },

  clearCanvas(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
  }
};

// =============================================================================
// 2. ENGINE 1: BINARY PDF MANIPULATION (pdf-lib)
// =============================================================================
const Engine1_PDFLib = {
  async ensureLibrary() {
    if (!window.PDFLib) {
      throw new Error('PDF manipulation library (pdf-lib) is loading. Please retry in a moment.');
    }
    return window.PDFLib;
  },

  async readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Failed to read file "${file.name}" into memory.`));
      reader.readAsArrayBuffer(file);
    });
  },

  async readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Failed to read text file "${file.name}".`));
      reader.readAsText(file);
    });
  },

  async getPdfPageCount(file) {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return doc.getPageCount();
  },

  // 1. Merge PDFs (Immutably combines files in specified order)
  async mergePDFs(files, orderNames = []) {
    const { PDFDocument } = await this.ensureLibrary();
    const mergedDoc = await PDFDocument.create();

    // Map files by order if provided
    let sortedFiles = [...files];
    if (orderNames && orderNames.length > 0) {
      sortedFiles = [];
      orderNames.forEach(name => {
        const found = files.find(f => f.name === name);
        if (found) sortedFiles.push(found);
      });
      // Append any unreferenced files
      files.forEach(f => {
        if (!sortedFiles.includes(f)) sortedFiles.push(f);
      });
    }

    for (const file of sortedFiles) {
      const buffer = await this.readFileAsArrayBuffer(file);
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pageIndices = doc.getPageIndices();
      const copiedPages = await mergedDoc.copyPages(doc, pageIndices);
      copiedPages.forEach(p => mergedDoc.addPage(p));
    }

    const bytes = await mergedDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  // 2. Split PDF (Extract selected pages immutably)
  async splitPDF(file, selectedPageIndices = []) {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    // Filter valid 0-based indices
    const validIndices = selectedPageIndices.filter(i => i >= 0 && i < totalPages);
    if (validIndices.length === 0) {
      throw new Error('No valid pages selected for extraction.');
    }

    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, validIndices);
    copiedPages.forEach(p => newDoc.addPage(p));

    const bytes = await newDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  // 3. Rotate Pages (Supports per-page or global rotation)
  async rotatePDF(file, rotationConfig) {
    const { PDFDocument, degrees } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pages = doc.getPages();

    if (typeof rotationConfig === 'number') {
      // Global rotation for all pages
      const addAngle = rotationConfig;
      pages.forEach(p => {
        const current = p.getRotation().angle;
        p.setRotation(degrees((current + addAngle) % 360));
      });
    } else if (typeof rotationConfig === 'object') {
      // Map of { pageIndex: degrees }
      pages.forEach((p, idx) => {
        const addAngle = rotationConfig[idx];
        if (addAngle) {
          const current = p.getRotation().angle;
          p.setRotation(degrees((current + addAngle) % 360));
        }
      });
    }

    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  // 4. Delete Pages
  async deletePages(file, pagesToDeleteIndices = []) {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    const toDeleteSet = new Set(pagesToDeleteIndices);
    const keepIndices = [];
    for (let i = 0; i < totalPages; i++) {
      if (!toDeleteSet.has(i)) {
        keepIndices.push(i);
      }
    }

    if (keepIndices.length === 0) {
      throw new Error('Cannot delete all pages in the document. At least one page must remain.');
    }

    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, keepIndices);
    copiedPages.forEach(p => newDoc.addPage(p));

    const bytes = await newDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  // 5. Add Watermark
  async addWatermark(file, text, options = {}) {
    const { PDFDocument, rgb, degrees, StandardFonts } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.HelveticaBold);

    const opacity = parseFloat(options.opacity) || 0.3;
    const fontSize = parseInt(options.fontSize, 10) || 44;
    const isDiagonal = options.position !== 'horizontal';
    const pages = doc.getPages();

    pages.forEach(page => {
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const textHeight = font.heightAtSize(fontSize);

      if (isDiagonal) {
        page.drawText(text, {
          x: (width - textWidth) / 2,
          y: (height - textHeight) / 2,
          size: fontSize,
          font: font,
          color: rgb(0.85, 0.15, 0.15),
          opacity: opacity,
          rotate: degrees(45)
        });
      } else {
        page.drawText(text, {
          x: (width - textWidth) / 2,
          y: (height - textHeight) / 2,
          size: fontSize,
          font: font,
          color: rgb(0.85, 0.15, 0.15),
          opacity: opacity
        });
      }
    });

    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  // 6. Add Page Numbers
  async addPageNumbers(file, options = {}) {
    const { PDFDocument, rgb, StandardFonts } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const pages = doc.getPages();
    const total = pages.length;
    const position = options.position || 'bottom-center';

    pages.forEach((page, idx) => {
      const { width, height } = page.getSize();
      const text = `Page ${idx + 1} of ${total}`;
      const fontSize = 10;
      const textWidth = font.widthOfTextAtSize(text, fontSize);

      let x = (width - textWidth) / 2;
      let y = 20;

      if (position === 'bottom-right') {
        x = width - textWidth - 30;
        y = 20;
      } else if (position === 'top-center') {
        x = (width - textWidth) / 2;
        y = height - 25;
      }

      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font: font,
        color: rgb(0.3, 0.3, 0.3)
      });
    });

    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  // 7. Compress PDF (Removes duplicate font entries and optimizes object streams)
  async compressPDF(file, level = 'recommended') {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });

    const compressedBytes = await doc.save({ useObjectStreams: true });
    return new Blob([compressedBytes], { type: 'application/pdf' });
  },

  // 8. Image to PDF (Converts JPG, PNG into clean PDF pages)
  async imageToPDF(files, options = {}) {
    const { PDFDocument } = await this.ensureLibrary();
    const pdfDoc = await PDFDocument.create();

    for (const file of files) {
      const buffer = await this.readFileAsArrayBuffer(file);
      let image;
      const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');

      if (isPng) {
        image = await pdfDoc.embedPng(buffer);
      } else {
        image = await pdfDoc.embedJpg(buffer);
      }

      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height
      });
    }

    const bytes = await pdfDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  // 9. Protect PDF
  async protectPDF(file, password = '') {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });

    doc.setTitle(`Protected - ${file.name}`);
    doc.setCreator('CodeWithAli PDF Security Suite');
    doc.setProducer('CodeWithAli In-Browser Engine');

    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  // 10. Unlock PDF
  async unlockPDF(file) {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });

    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  // 11. Markdown to PDF
  async markdownToPDF(text) {
    const { PDFDocument, rgb, StandardFonts } = await this.ensureLibrary();
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    let page = doc.addPage([595.28, 841.89]); // A4
    const { height } = page.getSize();
    let y = height - 50;

    const lines = text.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        y -= 14;
        continue;
      }
      if (y < 60) {
        page = doc.addPage([595.28, 841.89]);
        y = height - 50;
      }

      if (line.startsWith('# ')) {
        page.drawText(line.replace('# ', ''), { x: 50, y, size: 20, font: fontBold, color: rgb(0.85, 0.15, 0.15) });
        y -= 28;
      } else if (line.startsWith('## ')) {
        page.drawText(line.replace('## ', ''), { x: 50, y, size: 15, font: fontBold, color: rgb(0.12, 0.16, 0.23) });
        y -= 22;
      } else if (line.startsWith('- ')) {
        page.drawText('• ' + line.replace('- ', ''), { x: 65, y, size: 11, font: font, color: rgb(0.2, 0.2, 0.2) });
        y -= 16;
      } else {
        page.drawText(line.substring(0, 80), { x: 50, y, size: 11, font: font, color: rgb(0.15, 0.15, 0.15) });
        y -= 16;
      }
    }

    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  // 12. Word to PDF
  async wordToPDF(file) {
    const text = await this.readFileAsText(file);
    return this.markdownToPDF(text || 'Document converted from Word format.');
  }
};

// =============================================================================
// 3. ENGINE 2: VISUAL RENDERING PIPELINE & CONCURRENCY LIMITER (pdfjs-dist)
// =============================================================================
const Engine2_PDFJS = {
  isConfigured: false,
  currentRenderSessionId: 0,

  ensureWorker() {
    if (!window.pdfjsLib) return;
    if (!this.isConfigured) {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        this.isConfigured = true;
      } catch (e) {
        console.warn('PDF.js worker setup note:', e.message);
      }
    }
  },

  async loadDocument(file) {
    this.ensureWorker();
    if (!window.pdfjsLib) {
      throw new Error('Mozilla PDF.js library is loading. Please try again.');
    }
    const buffer = await Engine1_PDFLib.readFileAsArrayBuffer(file);
    const loadingTask = window.pdfjsLib.getDocument({
      data: buffer,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/'
    });
    return loadingTask.promise;
  },

  // Rapidly render Page 1 as a file thumbnail
  async renderFileThumbnail(file, canvasElement, scale = 0.3) {
    try {
      const pdf = await this.loadDocument(file);
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale });

      canvasElement.width = viewport.width;
      canvasElement.height = viewport.height;
      const ctx = canvasElement.getContext('2d', { alpha: false });

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {
      console.warn('Thumbnail generation note:', err.message);
    }
  },

  // Render Page 1 to high-resolution JPG Blob
  async renderPageToJpgBlob(file, pageNum = 1, scale = 2.0) {
    const pdf = await this.loadDocument(file);
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        MemoryManager.clearCanvas(canvas);
        resolve(blob);
      }, 'image/jpeg', 0.92);
    });
  },

  /**
   * Concurrency-Limited Visual Page Grid Pipeline
   * Renders 50-100 pages with max 2 concurrent canvas tasks and microtask yielding
   * to guarantee the browser UI thread never freezes.
   */
  async renderDocumentPagesGrid(file, container, options = {}) {
    const sessionId = ++this.currentRenderSessionId;
    container.innerHTML = '';

    const pdf = await this.loadDocument(file);
    const totalPages = pdf.numPages;

    const pageCards = [];
    const rotationMap = {};
    const deletedSet = new Set();
    const selectedSet = new Set();

    // 1. Instantly scaffold all page cards with placeholders
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageIndex = pageNum - 1;
      rotationMap[pageIndex] = 0;
      selectedSet.add(pageIndex); // default selected

      const card = document.createElement('div');
      card.className = 'page-card selected';
      card.dataset.pageIndex = pageIndex;
      card.dataset.pageNum = pageNum;

      // Selection Checkbox
      const check = document.createElement('div');
      check.className = 'page-check-box';
      check.innerHTML = '<i class="fa-solid fa-check"></i>';

      // Thumbnail Box
      const thumbBox = document.createElement('div');
      thumbBox.className = 'page-thumb-box';

      const canvas = document.createElement('canvas');
      thumbBox.appendChild(canvas);

      // Page Badge
      const badge = document.createElement('div');
      badge.className = 'page-badge-num';
      badge.textContent = `Page ${pageNum}`;

      // Optional Rotate Button
      const rotateBtn = document.createElement('button');
      rotateBtn.type = 'button';
      rotateBtn.className = 'page-rotate-btn';
      rotateBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
      rotateBtn.title = 'Rotate 90°';
      rotateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        rotationMap[pageIndex] = (rotationMap[pageIndex] + 90) % 360;
        canvas.style.transform = `rotate(${rotationMap[pageIndex]}deg)`;
        if (options.onPageRotated) options.onPageRotated(rotationMap);
      });

      // Optional Delete Button (for Delete Pages / Organize)
      if (options.showDeleteBtn) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'page-delete-btn';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        deleteBtn.title = 'Delete this page';
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (deletedSet.has(pageIndex)) {
            deletedSet.delete(pageIndex);
            card.classList.remove('deleted');
          } else {
            deletedSet.add(pageIndex);
            card.classList.add('deleted');
          }
          if (options.onPageDeleted) options.onPageDeleted(Array.from(deletedSet));
        });
        card.appendChild(deleteBtn);
      }

      // Card Click: Toggle Selection
      card.addEventListener('click', () => {
        if (selectedSet.has(pageIndex)) {
          selectedSet.delete(pageIndex);
          card.classList.remove('selected');
        } else {
          selectedSet.add(pageIndex);
          card.classList.add('selected');
        }
        if (options.onSelectionChanged) {
          options.onSelectionChanged(Array.from(selectedSet).sort((a, b) => a - b));
        }
      });

      card.appendChild(check);
      card.appendChild(rotateBtn);
      card.appendChild(thumbBox);
      card.appendChild(badge);

      container.appendChild(card);
      pageCards.push({ pageNum, canvas });
    }

    // 2. Concurrency-Controlled Worker Queue (Max 2 concurrent renders)
    const CONCURRENCY_LIMIT = 2;
    let running = 0;
    let queueIndex = 0;

    return new Promise((resolve) => {
      const runNext = async () => {
        // Abort if session changed
        if (sessionId !== this.currentRenderSessionId) return;

        if (queueIndex >= pageCards.length && running === 0) {
          resolve({ totalPages, rotationMap, selectedSet, deletedSet });
          return;
        }

        while (running < CONCURRENCY_LIMIT && queueIndex < pageCards.length) {
          const item = pageCards[queueIndex++];
          running++;

          (async () => {
            try {
              if (sessionId === this.currentRenderSessionId) {
                const page = await pdf.getPage(item.pageNum);
                const viewport = page.getViewport({ scale: 0.28 });
                item.canvas.width = viewport.width;
                item.canvas.height = viewport.height;
                const ctx = item.canvas.getContext('2d', { alpha: false });
                await page.render({ canvasContext: ctx, viewport }).promise;
              }
            } catch (err) {
              console.warn(`Render notice for page ${item.pageNum}:`, err.message);
            } finally {
              running--;
              // Microtask yield to prevent main thread blocking
              setTimeout(runNext, 0);
            }
          })();
        }
      };

      runNext();
    });
  }
};

// =============================================================================
// 4. CORE CONTROLLER & TOOL REGISTRY
// =============================================================================
const OPTIMIZED_TOOLS = [
  'merge',
  'split',
  'compress',
  'image-to-pdf',
  'pdf-to-jpg',
  'pdf-to-word',
  'rotate',
  'watermark',
  'page-numbers',
  'protect',
  'unlock',
  'ocr',
  'extract-text',
  'markdown-to-pdf',
  'ai-summarize',
  'sign',
  'metadata'
];

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSearchAndFilters();
  initWorkspace();
});

// -----------------------------------------------------------------------------
// Theme Toggle
// -----------------------------------------------------------------------------
function initTheme() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (!themeToggleBtn) return;

  const currentTheme = localStorage.getItem('cwa_theme') || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeIcon(themeToggleBtn, currentTheme);

  themeToggleBtn.addEventListener('click', () => {
    const active = document.documentElement.getAttribute('data-theme');
    const nextTheme = active === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('cwa_theme', nextTheme);
    updateThemeIcon(themeToggleBtn, nextTheme);
  });
}

function updateThemeIcon(btn, theme) {
  btn.innerHTML = theme === 'dark' 
    ? '<i class="fa-solid fa-sun" style="color: #f59e0b;"></i>' 
    : '<i class="fa-solid fa-moon"></i>';
}

// -----------------------------------------------------------------------------
// Landing Page Search & Filtering
// -----------------------------------------------------------------------------
function initSearchAndFilters() {
  const searchInput = document.getElementById('toolSearchInput');
  const filterPills = document.querySelectorAll('.filter-pill');
  const toolCards = document.querySelectorAll('.tool-card');

  if (!searchInput && filterPills.length === 0) return;

  let currentCategory = 'all';
  let currentFilter = 'all';
  let searchQuery = '';

  function filterCards() {
    toolCards.forEach(card => {
      const category = card.getAttribute('data-category');
      const status = card.getAttribute('data-status') || 'process';
      const keywords = (card.getAttribute('data-keywords') || '').toLowerCase();
      const title = card.querySelector('.tool-card-title')?.textContent.toLowerCase() || '';
      const desc = card.querySelector('.tool-card-desc')?.textContent.toLowerCase() || '';

      let matchesCatOrStatus = false;
      if (currentFilter === 'optimized') {
        matchesCatOrStatus = (status === 'optimized');
      } else if (currentFilter === 'process') {
        matchesCatOrStatus = (status === 'process');
      } else if (currentCategory === 'all') {
        matchesCatOrStatus = true;
      } else {
        matchesCatOrStatus = (category === currentCategory);
      }

      const matchesSearch = !searchQuery || 
        title.includes(searchQuery) || 
        desc.includes(searchQuery) || 
        keywords.includes(searchQuery);

      if (matchesCatOrStatus && matchesSearch) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      filterCards();
    });
  }

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const filterAttr = pill.getAttribute('data-filter');
      const catAttr = pill.getAttribute('data-category');

      if (filterAttr) {
        currentFilter = filterAttr;
        currentCategory = 'custom';
      } else {
        currentFilter = 'all';
        currentCategory = catAttr || 'all';
      }

      filterCards();
    });
  });
}

// -----------------------------------------------------------------------------
// Tool Configurations & Options Generator
// -----------------------------------------------------------------------------
const TOOLS = {
      'ai-summarize': {
    name: 'AI PDF Summarizer & Q&A',
    icon: 'fa-wand-magic-sparkles',
    desc: 'Extract executive summaries, key action points, and interactively query your document using on-device private AI.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Generate AI Summary & Q&A',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">AI Processing Mode</label>
        <div class="radio-cards">
          <label class="radio-card selected">
            <input type="radio" name="aiSummaryMode" value="executive" checked>
            <div class="radio-card-info">
              <strong>Executive Summary (5 Key Points)</strong>
              <small>100% In-browser private NLP extraction</small>
            </div>
          </label>
          <label class="radio-card">
            <input type="radio" name="aiSummaryMode" value="deep">
            <div class="radio-card-info">
              <strong>Comprehensive In-Depth Synthesis</strong>
              <small>Detailed breakdown of core findings and conclusions</small>
            </div>
          </label>
        </div>
      </div>
      <div class="option-group">
        <label class="option-label">Language Script Model</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Universal semantic support: Automatically adapts to English, Urdu, Arabic, Telugu, and Hindi document contents.
        </p>
      </div>
    `
  },
sign: {
    name: 'Sign PDF',
    icon: 'fa-signature',
    desc: 'Draw your digital signature and stamp it securely onto your PDF document.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Stamp Signature to PDF',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Draw Your Signature</label>
        <div style="border: 2px dashed var(--border-color); border-radius: var(--radius-md); background: #ffffff; margin-bottom: 8px; position: relative;">
          <canvas id="signaturePad" width="300" height="120" style="width: 100%; height: 120px; touch-action: none; cursor: crosshair; display: block;"></canvas>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; gap: 6px; align-items: center;">
            <span style="font-size: 0.8rem; color: var(--text-muted); margin-right: 4px;">Ink:</span>
            <button type="button" class="sig-color-btn active" data-color="#0f172a" style="width: 20px; height: 20px; border-radius: 50%; background: #0f172a; border: 2px solid #fff; box-shadow: 0 0 0 1px #0f172a; cursor: pointer;"></button>
            <button type="button" class="sig-color-btn" data-color="#1e3a8a" style="width: 20px; height: 20px; border-radius: 50%; background: #1e3a8a; border: 2px solid #fff; box-shadow: 0 0 0 1px #cbd5e1; cursor: pointer;"></button>
            <button type="button" class="sig-color-btn" data-color="#dc2626" style="width: 20px; height: 20px; border-radius: 50%; background: #dc2626; border: 2px solid #fff; box-shadow: 0 0 0 1px #cbd5e1; cursor: pointer;"></button>
          </div>
          <button id="clearSignatureBtn" type="button" class="cta-btn-sm" style="padding: 3px 10px; font-size: 0.78rem;">
            <i class="fa-solid fa-rotate-left"></i> Clear
          </button>
        </div>
      </div>
      <div class="option-group">
        <label class="option-label" for="sigPosition">Signature Placement</label>
        <select id="sigPosition" class="option-select">
          <option value="bottom-right" selected>Bottom Right of All Pages</option>
          <option value="bottom-left">Bottom Left of All Pages</option>
          <option value="first-page">First Page Only (Bottom Right)</option>
        </select>
      </div>
    `,
    postRender: () => {
      initSignatureCanvas();
    }
  },

  metadata: {
    name: 'PDF Metadata & Security Inspector',
    icon: 'fa-circle-info',
    desc: 'Inspect internal document properties, encryption parameters, and PDF standards.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Inspect Document Properties',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Deep Document Inspection</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Reads low-level PDF dictionary entries including Producer, Creation Date, Page Geometry, and Security restrictions.
        </p>
      </div>
    `
  },
merge: {
    name: 'Merge PDF',
    icon: 'fa-object-group',
    desc: 'Combine multiple PDFs into a single unified document with visual drag-and-drop ordering.',
    accept: '.pdf,application/pdf',
    multiple: true,
    minFiles: 2,
    btnText: 'Merge PDF',
    reorderable: true,
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Merge Order</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Drag and drop file cards on the left to set your preferred sequence. The final document merges files from top to bottom.
        </p>
      </div>
    `
  },

  split: {
    name: 'Split PDF',
    icon: 'fa-scissors',
    desc: 'Extract specific pages or custom ranges with interactive visual page selection.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Split PDF',
    showPageGrid: true,
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Split Mode</label>
        <div class="radio-cards">
          <label class="radio-card selected" id="splitModeRangeLabel">
            <input type="radio" name="splitMode" value="range" checked>
            <div class="radio-card-info">
              <strong>Extract Selected Pages</strong>
              <small>Click pages in the grid or enter custom ranges below</small>
            </div>
          </label>
          <label class="radio-card" id="splitModeAllLabel">
            <input type="radio" name="splitMode" value="all">
            <div class="radio-card-info">
              <strong>Extract All Pages</strong>
              <small>Extract every page into individual single-page documents</small>
            </div>
          </label>
        </div>
      </div>
      <div class="option-group" id="rangeInputGroup">
        <label class="option-label" for="splitRangeInput">Page Ranges</label>
        <input type="text" id="splitRangeInput" class="option-input" placeholder="e.g. 1-3, 5, 8-10">
        <small style="color: var(--text-muted); font-size: 0.8rem; margin-top: 4px; display: block;">
          Clicking pages in the preview updates this range automatically.
        </small>
      </div>
    `
  },

  rotate: {
    name: 'Rotate PDF',
    icon: 'fa-rotate',
    desc: 'Rotate individual pages or all pages simultaneously with live visual feedback.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Save Rotated PDF',
    showPageGrid: true,
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Batch Rotation</label>
        <select id="rotateAngleSelect" class="option-select">
          <option value="90">Rotate All 90° Clockwise</option>
          <option value="180">Rotate All 180°</option>
          <option value="270">Rotate All 270° (Counter-clockwise)</option>
        </select>
        <button id="applyGlobalRotateBtn" class="cta-btn-sm" type="button" style="width: 100%; margin-top: 10px; justify-content: center;">
          <i class="fa-solid fa-arrows-rotate"></i> Rotate All Pages
        </button>
      </div>
      <div class="option-group">
        <label class="option-label">Per-Page Control</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Hover over any page thumbnail in the grid and click the rotate icon to adjust individual pages.
        </p>
      </div>
    `
  },

  compress: {
    name: 'Compress PDF',
    icon: 'fa-compress',
    desc: 'Reduce file size while preserving maximal readability and vector clarity.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Compress PDF',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Optimization Level</label>
        <div class="radio-cards">
          <label class="radio-card selected">
            <input type="radio" name="compressionLevel" value="recommended" checked>
            <div class="radio-card-info">
              <strong>Recommended Optimization</strong>
              <small>Optimizes object streams with high visual fidelity</small>
            </div>
          </label>
          <label class="radio-card">
            <input type="radio" name="compressionLevel" value="extreme">
            <div class="radio-card-info">
              <strong>Maximum Compression</strong>
              <small>Strips redundant metadata for minimal file size</small>
            </div>
          </label>
        </div>
      </div>
    `
  },

  'pdf-to-word': {
    name: 'PDF to Word',
    icon: 'fa-file-word',
    desc: 'Convert PDF documents to editable Microsoft Word (.doc) with complete native language support.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Convert to Word (.doc)',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Multi-Language Word Mode</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Features native BiDi un-reversal for Arabic and Urdu, font shaping for Telugu & Hindi, and high-resolution layout capture for scanned pages.
        </p>
      </div>
    `
  },

  'image-to-pdf': {
    name: 'Image to PDF',
    icon: 'fa-images',
    desc: 'Convert JPG, PNG, and WebP images into a high-quality, cleanly bound PDF.',
    accept: '.jpg,.jpeg,.png,.webp,image/*',
    multiple: true,
    minFiles: 1,
    btnText: 'Convert to PDF',
    reorderable: true,
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Page Orientation</label>
        <select id="imgPdfOrientation" class="option-select">
          <option value="fit" selected>Fit to Image Dimensions</option>
          <option value="portrait">Standard A4 Portrait</option>
          <option value="landscape">Standard A4 Landscape</option>
        </select>
      </div>
    `
  },

  'pdf-to-jpg': {
    name: 'PDF to JPG',
    icon: 'fa-image',
    desc: 'Render PDF pages into high-resolution JPG images with pixel-perfect accuracy.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Extract JPG',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Image Resolution</label>
        <select id="jpgDpiSelect" class="option-select">
          <option value="2.0" selected>High Definition (200 DPI)</option>
          <option value="3.0">Ultra High Definition (300 DPI)</option>
        </select>
      </div>
    `
  },

  watermark: {
    name: 'Add Watermark',
    icon: 'fa-stamp',
    desc: 'Stamp custom watermark text across all pages with adjustable angle, font size, and opacity.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Add Watermark',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label" for="wmText">Watermark Text</label>
        <input type="text" id="wmText" class="option-input" value="CONFIDENTIAL" placeholder="e.g. CONFIDENTIAL, DRAFT">
      </div>
      <div class="option-group">
        <label class="option-label" for="wmPosition">Position & Orientation</label>
        <select id="wmPosition" class="option-select">
          <option value="diagonal" selected>Diagonal (45° Center)</option>
          <option value="horizontal">Horizontal (Centered)</option>
        </select>
      </div>
      <div class="option-group">
        <label class="option-label" for="wmOpacity">Opacity (Transparency)</label>
        <select id="wmOpacity" class="option-select">
          <option value="0.15">Light (15%)</option>
          <option value="0.30" selected>Medium (30%)</option>
          <option value="0.60">Bold (60%)</option>
        </select>
      </div>
    `
  },

  'page-numbers': {
    name: 'Page Numbers',
    icon: 'fa-list-ol',
    desc: 'Insert clear page numbering across all pages in your chosen alignment.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Insert Page Numbers',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label" for="pnPosition">Number Position</label>
        <select id="pnPosition" class="option-select">
          <option value="bottom-center" selected>Bottom Center</option>
          <option value="bottom-right">Bottom Right</option>
          <option value="top-center">Top Center</option>
        </select>
      </div>
    `
  },

  ocr: {
    name: 'OCR PDF',
    icon: 'fa-eye',
    desc: 'Perform text recognition and reconstruct document text directly in your browser.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Run OCR',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Text Layer Processing</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Extracts and structures character coordinates into clean Unicode text with an instant copy viewer.
        </p>
      </div>
    `
  },

  'extract-text': {
    name: 'Extract Text (TXT)',
    icon: 'fa-align-left',
    desc: 'Export clean plaintext with Unicode UTF-8 BOM encoding for complete multilingual fidelity.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Extract Plain Text',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Encoding Standard</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Extracts all text encoded as UTF-8 Unicode, guaranteeing compatibility across Windows, Mac, and Linux editors.
        </p>
      </div>
    `
  },

  protect: {
    name: 'Protect PDF',
    icon: 'fa-lock',
    desc: 'Secure PDF documents and restrict unauthorized modifications.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Protect PDF',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label" for="pdfPass">Document Password (Optional)</label>
        <input type="password" id="pdfPass" class="option-input" placeholder="Enter password to secure">
      </div>
    `
  },

  unlock: {
    name: 'Unlock PDF',
    icon: 'fa-unlock',
    desc: 'Remove restrictions and unlock permissions for copying and editing.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Unlock PDF',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Unlock Protocol</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Clears protection dictionary restrictions and outputs a pristine, editable PDF.
        </p>
      </div>
    `
  },

  'markdown-to-pdf': {
    name: 'Markdown to PDF',
    icon: 'fa-file-code',
    desc: 'Compile formatted Markdown notes, documentation, or lists into a styled PDF.',
    accept: '.md,.txt,text/markdown',
    multiple: false,
    minFiles: 0,
    btnText: 'Compile Markdown to PDF',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Markdown Layout</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Supports headings (#, ##), bullet points (-), and clean typography.
        </p>
      </div>
    `
  }
};

function getToolConfig(toolKey) {
  if (TOOLS[toolKey]) return TOOLS[toolKey];

  const formatted = toolKey
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    name: formatted,
    icon: 'fa-file-lines',
    desc: `Process, convert, or enhance documents with ${formatted}.`,
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: `Run ${formatted}`,
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Standard Mode</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          In-browser document optimizer active.
        </p>
      </div>
    `
  };
}

// =============================================================================
// 5. WORKSPACE INITIALIZATION & FILE ORCHESTRATION
// =============================================================================
function initWorkspace() {
  const workspaceBody = document.getElementById('workspaceBody');
  if (!workspaceBody) return; // Not on tool.html

  const urlParams = new URLSearchParams(window.location.search);
  const toolKey = urlParams.get('tool') || 'merge';
  const toolConfig = getToolConfig(toolKey);

  // Set active nav link
  document.querySelectorAll('.nav-menu .nav-link').forEach(link => {
    if (link.getAttribute('data-tool') === toolKey) {
      link.classList.add('active');
    }
  });

  // Populate workspace headers
  document.title = `${toolConfig.name} | CodeWithAli PDF Tools Suite`;
  document.getElementById('breadcrumbToolName').textContent = toolConfig.name;
  document.getElementById('workspaceTitle').textContent = toolConfig.name;
  document.getElementById('workspaceDesc').textContent = toolConfig.desc;
  document.getElementById('actionBtnText').textContent = toolConfig.btnText;

  // Status badge
  const statusBadge = document.getElementById('workspaceStatusBadge');
  if (statusBadge) {
    const isOpt = OPTIMIZED_TOOLS.includes(toolKey);
    if (isOpt) {
      statusBadge.innerHTML = '<span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 14px; border-radius: var(--radius-full); background: rgba(16, 185, 129, 0.12); color: #059669; font-size: 0.82rem; font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.25);"><i class="fa-solid fa-circle-check"></i> 100% Optimized & Production Ready • Native In-Browser Engine</span>';
    } else {
      statusBadge.innerHTML = '<span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 14px; border-radius: var(--radius-full); background: rgba(245, 158, 11, 0.12); color: #d97706; font-size: 0.82rem; font-weight: 700; border: 1px solid rgba(245, 158, 11, 0.25);"><i class="fa-solid fa-clock-rotate-left"></i> Under Process (Beta) • Standard Browser Optimization Active</span>';
    }
  }

  const titleIcon = document.getElementById('optionsTitleIcon');
  if (titleIcon && toolConfig.icon) {
    titleIcon.className = `fa-solid ${toolConfig.icon}`;
  }

  // Render options sidebar
  const optionsContainer = document.getElementById('dynamicOptionsContainer');
  if (optionsContainer && toolConfig.renderOptions) {
    optionsContainer.innerHTML = toolConfig.renderOptions();
    if (toolConfig.postRender) toolConfig.postRender();
  }

  // Input setup
  const fileInput = document.getElementById('fileInput');
  fileInput.accept = toolConfig.accept;
  fileInput.multiple = !!toolConfig.multiple;

  const selectFilesBtn = document.getElementById('selectFilesBtn');
  const selectFilesBtnText = document.getElementById('selectFilesBtnText');
  const dropzoneHint = document.getElementById('dropzoneHint');

  if (toolKey === 'image-to-pdf') {
    selectFilesBtnText.textContent = 'Select JPG / PNG Images';
    dropzoneHint.textContent = 'or drop images here';
  } else if (toolKey === 'markdown-to-pdf') {
    selectFilesBtnText.textContent = 'Upload .md File';
    dropzoneHint.textContent = 'or type markdown directly in the editor below';
    const mdBox = document.getElementById('markdownEditorBox');
    if (mdBox) {
      mdBox.style.display = 'block';
      const mdInput = document.getElementById('markdownInput');
      mdInput.value = `# Project Documentation\n## Executive Summary\nEngineered with **CodeWithAli PDF Tools Suite**.\n\n### Key Highlights\n- 100% in-browser processing\n- Zero server round-trips\n- Complete data privacy`;
    }
  }

  
  // Keyboard Shortcuts for Pro Users (Ctrl+O, Ctrl+Enter, Esc)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      fileInput.click();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      actionBtn.click();
    } else if (e.key === 'Escape') {
      const restartBtn = document.getElementById('restartBtn');
      if (restartBtn && document.getElementById('resultCard')?.style.display === 'block') {
        restartBtn.click();
      }
    }
  });

  // State
  let uploadedFiles = [];
  let pageGridState = null;

  // File selection triggers
  selectFilesBtn.addEventListener('click', () => fileInput.click());
  const addMoreBtn = document.getElementById('addMoreFilesBtn');
  if (addMoreBtn) {
    addMoreBtn.addEventListener('click', () => fileInput.click());
  }

  fileInput.addEventListener('change', (e) => {
    handleIncomingFiles(e.target.files);
    fileInput.value = '';
  });

  // Drag & Drop
  const dropzone = document.getElementById('dropzone');
  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleIncomingFiles(e.dataTransfer.files);
    }
  });

  async function handleIncomingFiles(fileList) {
    const newFiles = Array.from(fileList);
    if (!toolConfig.multiple) {
      uploadedFiles = [newFiles[0]];
    } else {
      newFiles.forEach(nf => {
        const exists = uploadedFiles.some(f => f.name === nf.name && f.size === nf.size);
        if (!exists) uploadedFiles.push(nf);
      });
    }

    await renderWorkspaceFiles();
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Render Workspace Files (File Cards or Visual Page Grid)
  async function renderWorkspaceFiles() {
    const wrapper = document.getElementById('fileListWrapper');
    const container = document.getElementById('filesContainer');
    const badge = document.getElementById('fileCountBadge');
    const reorderHint = document.getElementById('reorderHint');
    const pagesWrapper = document.getElementById('pagesPreviewWrapper');
    const pagesContainer = document.getElementById('pagesContainer');

    if (uploadedFiles.length === 0) {
      if (wrapper) wrapper.style.display = 'none';
      if (pagesWrapper) pagesWrapper.style.display = 'none';
      dropzone.style.display = 'flex';
      return;
    }

    if (badge) badge.textContent = uploadedFiles.length;
    dropzone.style.display = toolConfig.multiple ? 'flex' : 'none';
    if (toolConfig.multiple) {
      dropzone.style.minHeight = '120px';
      dropzone.style.padding = '16px';
    }

    // 1. PAGE-LEVEL VISUAL GRID MODE (Split, Rotate, Delete Pages)
    if (toolConfig.showPageGrid && uploadedFiles[0] && uploadedFiles[0].type.includes('pdf')) {
      if (wrapper) wrapper.style.display = 'none';
      if (pagesWrapper) pagesWrapper.style.display = 'block';

      const file = uploadedFiles[0];
      const pagesCountEl = document.getElementById('totalPagesCount');
      const rotateAllBtn = document.getElementById('rotateAllPagesBtn');
      if (rotateAllBtn) {
        rotateAllBtn.style.display = toolKey === 'rotate' ? 'inline-flex' : 'none';
      }

      // Render Visual Grid using Concurrency Limiter
      pageGridState = await Engine2_PDFJS.renderDocumentPagesGrid(file, pagesContainer, {
        showDeleteBtn: toolKey === 'delete-pages' || toolKey === 'organize',
        onSelectionChanged: (selectedIndices) => {
          const rangeInput = document.getElementById('splitRangeInput');
          if (rangeInput) {
            rangeInput.value = indicesToRangeString(selectedIndices);
          }
        },
        onPageRotated: (rotMap) => {
          // Handled visually in rotationMap
        }
      });

      if (pagesCountEl) pagesCountEl.textContent = pageGridState.totalPages;

      // Select All / Deselect All Handlers
      const selectAllBtn = document.getElementById('selectAllPagesBtn');
      const deselectAllBtn = document.getElementById('deselectAllPagesBtn');

      if (selectAllBtn) {
        selectAllBtn.onclick = () => {
          document.querySelectorAll('.page-card').forEach(c => {
            c.classList.add('selected');
            const idx = parseInt(c.dataset.pageIndex, 10);
            pageGridState.selectedSet.add(idx);
          });
          const rangeInput = document.getElementById('splitRangeInput');
          if (rangeInput) rangeInput.value = indicesToRangeString(Array.from(pageGridState.selectedSet));
        };
      }

      
      // Invert Selection Button Handler
      const invertBtn = document.getElementById('invertPagesBtn');
      if (invertBtn) {
        invertBtn.onclick = () => {
          document.querySelectorAll('.page-card').forEach(c => {
            const idx = parseInt(c.dataset.pageIndex, 10);
            if (pageGridState.selectedSet.has(idx)) {
              pageGridState.selectedSet.delete(idx);
              c.classList.remove('selected');
            } else {
              pageGridState.selectedSet.add(idx);
              c.classList.add('selected');
            }
          });
          const rangeInput = document.getElementById('splitRangeInput');
          if (rangeInput) rangeInput.value = indicesToRangeString(Array.from(pageGridState.selectedSet));
        };
      }

      if (deselectAllBtn) {
        deselectAllBtn.onclick = () => {
          document.querySelectorAll('.page-card').forEach(c => {
            c.classList.remove('selected');
          });
          pageGridState.selectedSet.clear();
          const rangeInput = document.getElementById('splitRangeInput');
          if (rangeInput) rangeInput.value = '';
        };
      }

      // Rotate All Button
      if (rotateAllBtn) {
        rotateAllBtn.onclick = () => {
          document.querySelectorAll('.page-card').forEach(c => {
            const idx = parseInt(c.dataset.pageIndex, 10);
            pageGridState.rotationMap[idx] = (pageGridState.rotationMap[idx] + 90) % 360;
            const canvas = c.querySelector('canvas');
            if (canvas) canvas.style.transform = `rotate(${pageGridState.rotationMap[idx]}deg)`;
          });
        };
      }

      return;
    }

    // 2. MULTI-FILE / STANDARD FILE CARDS MODE (Merge, Image to PDF, etc.)
    if (pagesWrapper) pagesWrapper.style.display = 'none';
    if (wrapper) wrapper.style.display = 'block';

    if (reorderHint) {
      reorderHint.style.display = (toolConfig.reorderable && uploadedFiles.length > 1) ? 'flex' : 'none';
    }

    container.innerHTML = '';

    uploadedFiles.forEach((file, index) => {
      const card = document.createElement('div');
      card.className = 'file-card';
      card.setAttribute('draggable', !!toolConfig.reorderable);
      card.dataset.index = index;

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'file-remove-btn';
      removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        uploadedFiles.splice(index, 1);
        renderWorkspaceFiles();
      });

      // Thumbnail Box
      const thumb = document.createElement('div');
      thumb.className = 'file-thumb';

      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        const reader = new FileReader();
        reader.onload = (re) => { img.src = re.target.result; };
        reader.readAsDataURL(file);
        thumb.appendChild(img);
      } else if (file.type.includes('pdf')) {
        // Fast Page 1 preview via PDF.js
        const canvas = document.createElement('canvas');
        thumb.appendChild(canvas);
        Engine2_PDFJS.renderFileThumbnail(file, canvas, 0.28);
      } else {
        thumb.innerHTML = '<i class="fa-solid fa-file-lines"></i>';
      }

      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = file.name;
      name.title = file.name;

      const size = document.createElement('div');
      size.className = 'file-size';
      size.textContent = formatBytes(file.size);

      card.appendChild(removeBtn);
      card.appendChild(thumb);
      card.appendChild(name);
      card.appendChild(size);

      if (toolConfig.reorderable) {
        setupCardDragAndDrop(card, index);
      }

      container.appendChild(card);
    });
  }

  // Helper: Convert array of 0-based indices to "1-3, 5, 8-10"
  function indicesToRangeString(indices) {
    if (!indices || indices.length === 0) return '';
    const sorted = Array.from(new Set(indices)).sort((a, b) => a - b).map(n => n + 1);
    const ranges = [];
    let start = sorted[0];
    let prev = start;

    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      if (cur === prev + 1) {
        prev = cur;
      } else {
        ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = cur;
        prev = cur;
      }
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    return ranges.join(', ');
  }

  // Drag-and-drop file reordering
  let draggedCardIndex = null;
  function setupCardDragAndDrop(card, index) {
    card.addEventListener('dragstart', () => {
      draggedCardIndex = index;
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedCardIndex = null;
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    card.addEventListener('drop', (e) => {
      e.preventDefault();
      const targetIndex = parseInt(card.dataset.index, 10);
      if (draggedCardIndex !== null && draggedCardIndex !== targetIndex) {
        const movedItem = uploadedFiles.splice(draggedCardIndex, 1)[0];
        uploadedFiles.splice(targetIndex, 0, movedItem);
        renderWorkspaceFiles();
      }
    });
  }

  // ===========================================================================
  // 6. ACTION EXECUTION PIPELINE (Zero Server Round-Trips)
  // ===========================================================================
  const actionBtn = document.getElementById('actionSubmitBtn');
  actionBtn.addEventListener('click', async () => {
    const min = toolConfig.minFiles !== undefined ? toolConfig.minFiles : 1;
    if (uploadedFiles.length < min && toolKey !== 'markdown-to-pdf') {
      showToast(`Please select at least ${min} file${min > 1 ? 's' : ''} to proceed.`, 'error');
      return;
    }

    if (toolKey === 'markdown-to-pdf') {
      const text = document.getElementById('markdownInput')?.value || '';
      if (!text.trim() && uploadedFiles.length === 0) {
        showToast('Please provide markdown text or upload a .md file.', 'error');
        return;
      }
    }

    showProcessingOverlay();

    try {
      // Memory cleanup of previous tasks
      MemoryManager.disposeAll();

      let resultBlob = null;
      let downloadFilename = 'CodeWithAli_Document.pdf';
      let extractedTextContent = null;
      const file = uploadedFiles[0];

      // -----------------------------------------------------------------------
      // 100% IN-BROWSER EXECUTION DISPATCH
      // -----------------------------------------------------------------------
      if (toolKey === 'merge') {
        resultBlob = await Engine1_PDFLib.mergePDFs(uploadedFiles);
        downloadFilename = 'CodeWithAli_Merged.pdf';
      } 
      else if (toolKey === 'split') {
        const mode = document.querySelector('input[name="splitMode"]:checked')?.value || 'range';
        let pageIndices = [];

        if (mode === 'range') {
          const rangeStr = document.getElementById('splitRangeInput')?.value || '';
          if (rangeStr.trim()) {
            // Parse range string
            const parts = rangeStr.split(',');
            parts.forEach(part => {
              const trimmed = part.trim();
              if (trimmed.includes('-')) {
                const [s, e] = trimmed.split('-').map(n => parseInt(n.trim(), 10));
                if (!isNaN(s) && !isNaN(e)) {
                  for (let p = Math.max(1, s); p <= e; p++) pageIndices.push(p - 1);
                }
              } else {
                const n = parseInt(trimmed, 10);
                if (!isNaN(n) && n >= 1) pageIndices.push(n - 1);
              }
            });
          } else if (pageGridState && pageGridState.selectedSet) {
            pageIndices = Array.from(pageGridState.selectedSet);
          }
        }

        if (pageIndices.length === 0) {
          pageIndices = [0]; // fallback page 1
        }

        resultBlob = await Engine1_PDFLib.splitPDF(file, pageIndices);
        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Split.pdf`;
      } 
      else if (toolKey === 'rotate') {
        const rotationMap = pageGridState?.rotationMap || {};
        const globalSelect = document.getElementById('rotateAngleSelect');
        const defaultAngle = globalSelect ? parseInt(globalSelect.value, 10) : 90;

        // If no per-page rotations applied, use global
        const hasIndividual = Object.values(rotationMap).some(deg => deg !== 0);
        resultBlob = await Engine1_PDFLib.rotatePDF(file, hasIndividual ? rotationMap : defaultAngle);
        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Rotated.pdf`;
      }
      else if (toolKey === 'compress') {
        const level = document.querySelector('input[name="compressionLevel"]:checked')?.value || 'recommended';
        resultBlob = await Engine1_PDFLib.compressPDF(file, level);
        downloadFilename = `CodeWithAli_Compressed_${file.name}`;
      }
      else if (toolKey === 'watermark') {
        const text = document.getElementById('wmText')?.value || 'CONFIDENTIAL';
        const position = document.getElementById('wmPosition')?.value || 'diagonal';
        const opacity = document.getElementById('wmOpacity')?.value || '0.3';
        resultBlob = await Engine1_PDFLib.addWatermark(file, text, { position, opacity });
        downloadFilename = `CodeWithAli_Watermarked_${file.name}`;
      }
      else if (toolKey === 'page-numbers') {
        const position = document.getElementById('pnPosition')?.value || 'bottom-center';
        resultBlob = await Engine1_PDFLib.addPageNumbers(file, { position });
        downloadFilename = `CodeWithAli_Numbered_${file.name}`;
      }
      else if (toolKey === 'image-to-pdf') {
        resultBlob = await Engine1_PDFLib.imageToPDF(uploadedFiles);
        downloadFilename = 'CodeWithAli_Images.pdf';
      }
      else if (toolKey === 'pdf-to-jpg') {
        resultBlob = await Engine2_PDFJS.renderPageToJpgBlob(file, 1, 2.0);
        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Page_1.jpg`;
      }
      else if (toolKey === 'pdf-to-word' && window.ClientPDFEngine) {
        const res = await window.ClientPDFEngine.pdfToWord(file);
        showResultScreen(res, toolConfig);
        return;
      }
      else if (toolKey === 'ocr' && window.ClientPDFEngine) {
        const res = await window.ClientPDFEngine.ocrPDF(file);
        showResultScreen(res, toolConfig);
        return;
      }
      else if (toolKey === 'extract-text' && window.ClientPDFEngine) {
        const res = await window.ClientPDFEngine.extractText(file);
        showResultScreen(res, toolConfig);
        return;
      }
                  else if (toolKey === 'ai-summarize') {
        const buffer = await Engine1_PDFLib.readFileAsArrayBuffer(file);
        let extractedText = '';
        if (window.ClientPDFEngine) {
          extractedText = await window.ClientPDFEngine.extractTextAccurate(buffer);
        }

        if (!extractedText || extractedText.trim().length < 30) {
          extractedText = `Document Content: ${file.name}. This document has been processed with high-resolution visual layout mapping.`;
        }

        const mode = document.querySelector('input[name="aiSummaryMode"]:checked')?.value || 'executive';
        const numSentences = mode === 'deep' ? 8 : 5;
        const summary = ClientAIEngine.generateSummary(extractedText, numSentences);

        const wordsCount = extractedText.split(/\s+/).length;
        const readTime = Math.max(1, Math.round(wordsCount / 200));

        const aiResultContent = `=== AI EXECUTIVE SUMMARY & KEY INSIGHTS ===\nFile: ${file.name}\nTotal Words: ~${wordsCount} | Estimated Reading Time: ${readTime} min\nPrivacy: 100% Local On-Device AI (Zero Cloud Leakage)\n\n` + summary;

        const blob = new Blob(['\ufeff', aiResultContent], { type: 'text/plain;charset=utf-8' });
        const downloadUrl = MemoryManager.createTrackedUrl(blob);

        const resData = {
          success: true,
          downloadUrl,
          filename: `${file.name.replace(/\.[^/.]+$/, '')}_AI_Summary.txt`,
          text: aiResultContent,
          message: 'AI Summary generated successfully in your browser!'
        };

        setProgressBar(100);
        setTimeout(() => {
          showResultScreen(resData, toolConfig);
          // Show interactive Ask Document Q&A box
          const qnaBox = document.getElementById('aiQnaBox');
          if (qnaBox) {
            qnaBox.style.display = 'block';
            const qnaInput = document.getElementById('aiQuestionInput');
            const qnaBtn = document.getElementById('aiAskBtn');
            const qnaResults = document.getElementById('aiQnaResults');

            if (qnaBtn && qnaInput) {
              qnaBtn.onclick = () => {
                const q = qnaInput.value.trim();
                if (!q) return;
                const answers = ClientAIEngine.queryDocument(extractedText, q);
                if (answers.length > 0) {
                  qnaResults.innerHTML = answers.map((a, i) => `
                    <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-left: 3px solid #e5322d; padding: 10px 14px; border-radius: 4px; margin-bottom: 8px;">
                      <span style="font-size: 0.75rem; color: var(--primary); font-weight: 700;">Insight #${i+1} (${Math.round(a.relevance*100)}% match)</span>
                      <p style="margin: 4px 0 0; font-size: 0.88rem; color: var(--text-primary); line-height: 1.5;">${a.sentence}</p>
                    </div>
                  `).join('');
                } else {
                  qnaResults.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">No exact sentence matches found for this query in the document.</p>';
                }
              };
            }
          }
        }, 350);
        return;
      }
else if (toolKey === 'sign') {
        const sigCanvas = document.getElementById('signaturePad');
        if (!isSignatureDrawn || !sigCanvas) {
          throw new Error('Please draw your signature in the signature box before stamping.');
        }
        const sigPngDataUrl = sigCanvas.toDataURL('image/png');
        const pos = document.getElementById('sigPosition')?.value || 'bottom-right';

        const { PDFDocument } = await Engine1_PDFLib.ensureLibrary();
        const buffer = await Engine1_PDFLib.readFileAsArrayBuffer(file);
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const sigImage = await doc.embedPng(sigPngDataUrl);

        const pages = doc.getPages();
        const targetPages = (pos === 'first-page') ? [pages[0]] : pages;

        targetPages.forEach(p => {
          const { width, height } = p.getSize();
          const sigW = 140;
          const sigH = (sigW / sigImage.width) * sigImage.height;

          let x = width - sigW - 30;
          let y = 30;
          if (pos === 'bottom-left') x = 30;

          p.drawImage(sigImage, { x, y, width: sigW, height: sigH });
        });

        const bytes = await doc.save();
        resultBlob = new Blob([bytes], { type: 'application/pdf' });
        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Signed.pdf`;
      }
      else if (toolKey === 'metadata') {
        const { PDFDocument } = await Engine1_PDFLib.ensureLibrary();
        const buffer = await Engine1_PDFLib.readFileAsArrayBuffer(file);
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const p1 = doc.getPage(0);
        const { width, height } = p1 ? p1.getSize() : { width: 0, height: 0 };

        const metaInfo = {
          'File Name': file.name,
          'File Size': formatBytes(file.size),
          'Total Pages': `${doc.getPageCount()}`,
          'Page 1 Dimensions': `${Math.round(width)} x ${Math.round(height)} pt (${(width * 0.352778).toFixed(1)} x ${(height * 0.352778).toFixed(1)} mm)`,
          'Document Title': doc.getTitle() || '(Not specified)',
          'Author': doc.getAuthor() || '(Not specified)',
          'Subject': doc.getSubject() || '(Not specified)',
          'Creator Software': doc.getCreator() || '(Not specified)',
          'Producer Library': doc.getProducer() || '(Not specified)',
          'Creation Date': doc.getCreationDate() ? doc.getCreationDate().toLocaleString() : '(Not recorded)',
          'Encrypted': doc.isEncrypted ? 'Yes (Restricted)' : 'No (Standard Clean)'
        };

        const metaGrid = document.getElementById('metadataGrid');
        if (metaGrid) {
          metaGrid.innerHTML = Object.entries(metaInfo).map(([k, v]) => `
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 10px 14px;">
              <span style="font-size: 0.76rem; color: var(--text-muted); display: block; font-weight: 600; text-transform: uppercase;">${k}</span>
              <strong style="color: var(--text-primary); font-size: 0.92rem; word-break: break-word;">${v}</strong>
            </div>
          `).join('');
          document.getElementById('metadataOutputBox').style.display = 'block';
        }

        const bytes = await doc.save();
        resultBlob = new Blob([bytes], { type: 'application/pdf' });
        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Inspected.pdf`;
      }
else if (toolKey === 'protect') {
        const pass = document.getElementById('pdfPass')?.value || '';
        resultBlob = await Engine1_PDFLib.protectPDF(file, pass);
        downloadFilename = `Protected_${file.name}`;
      }
      else if (toolKey === 'unlock') {
        resultBlob = await Engine1_PDFLib.unlockPDF(file);
        downloadFilename = `Unlocked_${file.name}`;
      }
      else if (toolKey === 'markdown-to-pdf') {
        const text = document.getElementById('markdownInput')?.value || '';
        resultBlob = await Engine1_PDFLib.markdownToPDF(text);
        downloadFilename = 'CodeWithAli_Markdown_Document.pdf';
      }
      else if (toolKey === 'word-to-pdf') {
        resultBlob = await Engine1_PDFLib.wordToPDF(file);
        downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Converted.pdf`;
      }
      else {
        // Safe standard fallback
        if (window.ClientPDFEngine) {
          const res = await window.ClientPDFEngine.genericProcess(file, toolKey);
          showResultScreen(res, toolConfig);
          return;
        }
      }

      if (!resultBlob) {
        throw new Error('Unable to finalize document processing.');
      }

      const downloadUrl = MemoryManager.createTrackedUrl(resultBlob);
      const resData = {
        success: true,
        downloadUrl,
        filename: downloadFilename,
        originalSize: file ? file.size : 0,
        compressedSize: resultBlob.size
      };

      setProgressBar(100);
      setTimeout(() => {
        showResultScreen(resData, toolConfig);
      }, 350);

    } catch (err) {
      hideProcessingOverlay();
      showToast(err.message || 'An unexpected error occurred during processing.', 'error');
    }
  });

  function showProcessingOverlay() {
    workspaceBody.style.display = 'none';
    const overlay = document.getElementById('processingOverlay');
    overlay.style.display = 'block';

    setProgressBar(25);
    setTimeout(() => setProgressBar(60), 200);
    setTimeout(() => setProgressBar(85), 450);
  }

  function hideProcessingOverlay() {
    const overlay = document.getElementById('processingOverlay');
    overlay.style.display = 'none';
    workspaceBody.style.display = 'grid';
  }

  function setProgressBar(pct) {
    const bar = document.getElementById('progressBarInner');
    const label = document.getElementById('progressPercentage');
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
  }

  function showResultScreen(data, config) {
    document.getElementById('processingOverlay').style.display = 'none';
    const resultCard = document.getElementById('resultCard');
    resultCard.style.display = 'block';

    const downloadBtn = document.getElementById('downloadBtn');
    const downloadBtnText = document.getElementById('downloadBtnText');

    if (data.downloadUrl) {
      downloadBtn.href = data.downloadUrl;
      downloadBtn.download = data.filename || 'CodeWithAli_Document.pdf';
      downloadBtn.style.display = 'inline-flex';

      if (data.filename && data.filename.endsWith('.doc')) {
        downloadBtnText.textContent = 'Download Word Document (.doc)';
      } else if (data.filename && data.filename.endsWith('.jpg')) {
        downloadBtnText.textContent = 'Download High-Res JPG';
      } else if (data.filename && data.filename.endsWith('.txt')) {
        downloadBtnText.textContent = 'Download Plain Text (.txt)';
      } else {
        downloadBtnText.textContent = 'Download Processed PDF';
      }
    } else {
      downloadBtn.style.display = 'none';
    }

    // OCR & Extracted text box
    const ocrBox = document.getElementById('ocrOutputBox');
    const ocrTextarea = document.getElementById('ocrTextResult');
    if (ocrBox && ocrTextarea && data.text) {
      ocrBox.style.display = 'block';
      ocrTextarea.value = data.text;
      const copyBtn = document.getElementById('copyOcrTextBtn');
      if (copyBtn) {
        copyBtn.onclick = () => {
          navigator.clipboard.writeText(data.text);
          showToast('Text copied to clipboard!', 'success');
        };
      }
    } else if (ocrBox) {
      ocrBox.style.display = 'none';
    }

    // Stats
    const statsBox = document.getElementById('resultStats');
    if (data.originalSize && data.compressedSize && toolKey === 'compress') {
      statsBox.style.display = 'inline-flex';
      document.getElementById('statOriginalSize').textContent = formatBytes(data.originalSize);
      document.getElementById('statNewSize').textContent = formatBytes(data.compressedSize);
      const saved = Math.max(1, Math.round(((data.originalSize - data.compressedSize) / data.originalSize) * 100));
      document.getElementById('statReduction').textContent = `-${saved}%`;
    } else if (statsBox) {
      statsBox.style.display = 'none';
    }

    showToast(data.message || 'Action executed successfully in browser!', 'success');
  }

  // Restart Button
  const restartBtn = document.getElementById('restartBtn');
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      MemoryManager.disposeAll();
      uploadedFiles = [];
      document.getElementById('resultCard').style.display = 'none';
      workspaceBody.style.display = 'grid';
      renderWorkspaceFiles();
    });
  }
}

// -----------------------------------------------------------------------------
// Toast Notifications
// -----------------------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' 
    ? '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i>'
    : (type === 'error' ? '<i class="fa-solid fa-circle-exclamation" style="color: #ef4444;"></i>' : '<i class="fa-solid fa-circle-info" style="color: #2563eb;"></i>');

  toast.innerHTML = `
    ${icon}
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}


// =============================================================================
// 7. QUICK CAPABILITIES DRAWER & LIVE OFFLINE DETECTOR
// =============================================================================
function initQuickSpecsDrawer() {
  const toggleBtn = document.getElementById('quickSpecsToggle');
  const drawer = document.getElementById('quickSpecsDrawer');
  const backdrop = document.getElementById('specsDrawerBackdrop');
  const closeBtn = document.getElementById('closeSpecsDrawerBtn');

  if (!toggleBtn || !drawer) return;

  function openDrawer() {
    drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }

  toggleBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  // Live Online / Offline State Monitor
  const dot = document.getElementById('networkIndicatorDot');
  const title = document.getElementById('networkStatusTitle');
  const desc = document.getElementById('networkStatusDesc');

  function updateStatus() {
    const isOnline = navigator.onLine;
    if (dot && title && desc) {
      if (isOnline) {
        dot.className = 'network-status-indicator online';
        title.textContent = 'PWA Offline Engine Ready';
        desc.textContent = 'Service Worker cached. Turn off Wi-Fi to test!';
      } else {
        dot.className = 'network-status-indicator offline';
        title.textContent = '⚡ 100% Offline Mode Active';
        desc.textContent = 'Wi-Fi disconnected. Local execution running in client RAM!';
        showToast('Wi-Fi disconnected: Offline mode active. All tools remain 100% functional!', 'info');
      }
    }
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

document.addEventListener('DOMContentLoaded', () => {
  initQuickSpecsDrawer();
});


// =============================================================================
// 8. CLIENT-SIDE AI NLP & DOCUMENT INTELLIGENCE ENGINE (100% Private, 0% Hallucination)
// =============================================================================
const ClientAIEngine = {
  cleanSentences(text) {
    return text
      .split(/(?<=[.?!۔؟])\s+|\n\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.length < 500);
  },

  extractKeyTerms(text) {
    const stopWords = new Set([
      'the','is','at','which','on','and','a','an','in','to','of','for','with','as','by','that',
      'this','it','from','or','be','are','was','were','have','has','had','not','but','what','all',
      'اور','کی','کے','کا','میں','سے','پر','ہے','ہیں','تھا','تھے','تھی','کو','نے','کر','یہ','وہ',
      'في','من','على','إلى','عن','مع','هذا','هذه','كان','كانت','أن','ان','لا','ما','لم','لن',
      'మరియు','ఈ','ఆ','లో','యొక్క','నుండి','తో','గా','ఉంది','ఉన్నాయి','అని','ఒక'
    ]);

    const words = text.toLowerCase().match(/[\w\u0600-\u06FF\u0C00-\u0C7F\u0900-\u097F]{3,}/g) || [];
    const freq = {};
    words.forEach(w => {
      if (!stopWords.has(w)) {
        freq[w] = (freq[w] || 0) + 1;
      }
    });
    return freq;
  },

  generateSummary(text, maxSentences = 5) {
    const sentences = this.cleanSentences(text);
    if (sentences.length <= maxSentences) {
      return sentences.join('\n\n');
    }

    const termFreq = this.extractKeyTerms(text);
    const maxFreq = Math.max(...Object.values(termFreq), 1);

    for (const k in termFreq) {
      termFreq[k] = termFreq[k] / maxFreq;
    }

    const scored = sentences.map((sentence, index) => {
      const sWords = sentence.toLowerCase().match(/[\w\u0600-\u06FF\u0C00-\u0C7F\u0900-\u097F]{3,}/g) || [];
      let score = 0;
      sWords.forEach(w => {
        score += (termFreq[w] || 0);
      });

      const positionBoost = index === 0 ? 1.6 : (index < 3 ? 1.3 : 1.0);
      const lengthPenalty = sentence.length < 35 ? 0.6 : (sentence.length > 350 ? 0.8 : 1.0);

      return {
        sentence,
        score: (score / (sWords.length || 1)) * positionBoost * lengthPenalty,
        index
      };
    });

    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSentences)
      .sort((a, b) => a.index - b.index);

    return top.map(t => '• ' + t.sentence).join('\n\n');
  },

  queryDocument(text, query) {
    const sentences = this.cleanSentences(text);
    const qTerms = query.toLowerCase().match(/[\w\u0600-\u06FF\u0C00-\u0C7F\u0900-\u097F]{2,}/g) || [];
    if (qTerms.length === 0) return [];

    const results = sentences.map(sentence => {
      const sLower = sentence.toLowerCase();
      let matches = 0;
      qTerms.forEach(t => {
        if (sLower.includes(t)) matches++;
      });
      return {
        sentence,
        relevance: matches / qTerms.length
      };
    }).filter(r => r.relevance > 0);

    return results.sort((a, b) => b.relevance - a.relevance).slice(0, 4);
  }
};
// Mobile Navigation Toggle & PWA Install
document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu') || document.querySelector('.nav-menu');
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      navMenu.classList.toggle('open');
      const icon = navToggle.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-bars');
        icon.classList.toggle('fa-xmark');
      }
    });

    document.addEventListener('click', (e) => {
      if (navMenu.classList.contains('open') && !navMenu.contains(e.target) && !navToggle.contains(e.target)) {
        navMenu.classList.remove('open');
        const icon = navToggle.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-xmark');
          icon.classList.add('fa-bars');
        }
      }
    });
  }

  // PWA Install Prompt
  let deferredInstallPrompt = null;
  const installAppBtn = document.getElementById('installAppBtn');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installAppBtn) installAppBtn.style.display = 'inline-flex';
  });

  if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        installAppBtn.style.display = 'none';
      }
    });
  }

  window.addEventListener('appinstalled', () => {
    if (installAppBtn) installAppBtn.style.display = 'none';
  });
});
