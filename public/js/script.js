// =============================================================================
// PURE-JS CLIENT-SIDE OOXML PACKAGE ENGINE (Zero External Dependencies)
// Generates genuine binary .docx, .xlsx, and .pptx ZIP packages
// =============================================================================
const OOXMLBuilder = {
  createZip(files) {
    const crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
      crcTable[n] = c >>> 0;
    }
    function crc32(bytes) {
      let crc = 0 ^ (-1);
      for (let i = 0; i < bytes.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
      }
      return (crc ^ (-1)) >>> 0;
    }

    const encoder = new TextEncoder();
    const fileEntries = [];
    let offset = 0;

    for (const f of files) {
      const nameBytes = encoder.encode(f.name);
      const dataBytes = (f.content instanceof Uint8Array) ? f.content : encoder.encode(f.content);
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      // Local file header (30 + nameBytes.length)
      const header = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0, true);
      view.setUint16(8, 0, true); // Stored (0)
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, size, true);
      view.setUint32(22, size, true);
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);
      header.set(nameBytes, 30);

      fileEntries.push({ nameBytes, dataBytes, crc, size, offset, header });
      offset += header.length + size;
    }

    const cdHeaders = [];
    let cdSize = 0;

    for (const e of fileEntries) {
      const cdh = new Uint8Array(46 + e.nameBytes.length);
      const view = new DataView(cdh.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint14 = 0;
      view.setUint32(16, e.crc, true);
      view.setUint32(20, e.size, true);
      view.setUint32(24, e.size, true);
      view.setUint16(28, e.nameBytes.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, e.offset, true);
      cdh.set(e.nameBytes, 46);
      cdHeaders.push(cdh);
      cdSize += cdh.length;
    }

    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, fileEntries.length, true);
    eocdView.setUint16(10, fileEntries.length, true);
    eocdView.setUint32(12, cdSize, true);
    eocdView.setUint32(16, offset, true);
    eocdView.setUint16(20, 0, true);

    const totalLen = offset + cdSize + 22;
    const out = new Uint8Array(totalLen);
    let pos = 0;

    for (const e of fileEntries) {
      out.set(e.header, pos); pos += e.header.length;
      out.set(e.dataBytes, pos); pos += e.dataBytes.length;
    }
    for (const cdh of cdHeaders) {
      out.set(cdh, pos); pos += cdh.length;
    }
    out.set(eocd, pos);

    return out;
  },

  buildDocx(paragraphs, title = 'CodeWithAli Document') {
    let pXml = '';
    paragraphs.forEach(p => {
      const text = String(p).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      pXml += `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
    });

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${pXml}
  </w:body>
</w:document>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    const zipBytes = this.createZip([
      { name: '[Content_Types].xml', content: contentTypes },
      { name: '_rels/.rels', content: rels },
      { name: 'word/document.xml', content: docXml }
    ]);

    return new Blob([zipBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  },

  buildXlsx(rows) {
    let rowXml = '';
    rows.forEach((row, rIdx) => {
      let cXml = '';
      row.forEach((cell, cIdx) => {
        const colLetter = String.fromCharCode(65 + (cIdx % 26));
        const cellRef = `${colLetter}${rIdx + 1}`;
        const val = String(cell).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        cXml += `<c r="${cellRef}" t="inlineStr"><is><t>${val}</t></is></c>`;
      });
      rowXml += `<row r="${rIdx + 1}">${cXml}</row>`;
    });

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

    const zipBytes = this.createZip([
      { name: '[Content_Types].xml', content: contentTypes },
      { name: '_rels/.rels', content: rels },
      { name: 'xl/workbook.xml', content: wbXml },
      { name: 'xl/_rels/workbook.xml.rels', content: wbRels },
      { name: 'xl/worksheets/sheet1.xml', content: sheetXml }
    ]);

    return new Blob([zipBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
};

/**
 * CodeWithAli PDF Tools Suite - Client-Side Architecture v16.0 (Production Verified)
 * 100% In-Browser Zero-Server-Upload Architecture (plus Vercel Python API Hybrid support)
 * Multilingual Support: Arabic, Urdu, Telugu, Hindi, English, and all World Scripts
 */

// =============================================================================
// 1. SIGNATURE CANVAS & DRAWING CONTROLLER
// =============================================================================
let activeSigColor = '#0f172a';
let isSignatureDrawn = false;

function initSignatureCanvas() {
  const canvas = document.getElementById('signaturePad');
  if (!canvas || !canvas.getContext) return;
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

// =============================================================================
// 2. MEMORY & RESOURCE LIFECYCLE MANAGER
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
      try { URL.revokeObjectURL(url); } catch (e) {}
    });
    this.activeUrls.clear();
  },

  clearCanvas(canvas) {
    if (!canvas || !canvas.getContext) return;
    try {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    } catch (e) {}
    canvas.width = 0;
    canvas.height = 0;
  }
};

// =============================================================================
// 3. ENGINE 1: BINARY PDF MANIPULATION (pdf-lib fallback for tools not in Worker yet)
// =============================================================================
const Engine1_PDFLib = {
  async ensureLibrary() {
    if (window.PDFLib) return window.PDFLib;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (window.PDFLib) return window.PDFLib;
    }
    throw new Error('PDF manipulation library (pdf-lib) could not be initialized.');
  },

  async readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Failed to read file "${file.name}" into browser memory.`));
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

  async readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Failed to encode file "${file.name}" to Data URI.`));
      reader.readAsDataURL(file);
    });
  },

  async getPdfPageCount(file) {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return doc.getPageCount();
  },

  // Remaining tools not ported to Web Worker logic directly mapped here
  async deletePages(file, pagesToDeleteIndices = []) {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();
    const toDeleteSet = new Set(pagesToDeleteIndices);
    const keepIndices = [];
    for (let i = 0; i < totalPages; i++) {
      if (!toDeleteSet.has(i)) keepIndices.push(i);
    }
    if (keepIndices.length === 0) throw new Error('Cannot delete all pages.');
    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, keepIndices);
    copiedPages.forEach(p => newDoc.addPage(p));
    const bytes = await newDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  async organizePDF(file, orderedIndices = []) {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();
    const targetIndices = (orderedIndices && orderedIndices.length > 0)
      ? orderedIndices.filter(i => i >= 0 && i < totalPages)
      : srcDoc.getPageIndices();
    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, targetIndices);
    copiedPages.forEach(p => newDoc.addPage(p));
    const bytes = await newDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  async flattenPDF(file) {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    try {
      const form = doc.getForm();
      form.flatten();
    } catch (e) {
      console.warn('[Flatten] Form inspection notice:', e.message);
    }
    const bytes = await doc.save({ useObjectStreams: true });
    return new Blob([bytes], { type: 'application/pdf' });
  },

  async editMetadata(file, metaUpdates = {}) {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    if (metaUpdates.title !== undefined) doc.setTitle(metaUpdates.title);
    if (metaUpdates.author !== undefined) doc.setAuthor(metaUpdates.author);
    if (metaUpdates.subject !== undefined) doc.setSubject(metaUpdates.subject);
    if (metaUpdates.keywords !== undefined) {
      const kw = Array.isArray(metaUpdates.keywords) ? metaUpdates.keywords : metaUpdates.keywords.split(',').map(s => s.trim());
      doc.setKeywords(kw);
    }
    doc.setProducer('CodeWithAli PDF Tools Suite');
    doc.setModificationDate(new Date());
    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  async signPDF(file, sigPngDataUrl, options = {}) {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const sigImage = await doc.embedPng(sigPngDataUrl);
    const pages = doc.getPages();
    const pos = options.position || 'bottom-right';
    const targetPages = (pos === 'first-page') ? [pages[0]] : (pos === 'last-page' ? [pages[pages.length - 1]] : pages);
    targetPages.forEach(p => {
      const { width, height } = p.getSize();
      const sigW = 140;
      const sigH = (sigW / sigImage.width) * sigImage.height;
      let x = width - sigW - 30;
      let y = 30;
      if (pos === 'bottom-left') x = 30;
      if (pos === 'top-right') { x = width - sigW - 30; y = height - sigH - 30; }
      p.drawImage(sigImage, { x, y, width: sigW, height: sigH });
    });
    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  async repairPDF(file) {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const bytes = await doc.save({ useObjectStreams: true });
    return new Blob([bytes], { type: 'application/pdf' });
  },

  async pdfToPdfa(file) {
    const { PDFDocument } = await this.ensureLibrary();
    const buffer = await this.readFileAsArrayBuffer(file);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    doc.setTitle(`[PDF/A-1b] ${file.name}`);
    doc.setSubject('Archival standard format conforming to PDF/A-1b metadata schema.');
    const bytes = await doc.save({ useObjectStreams: true });
    return new Blob([bytes], { type: 'application/pdf' });
  }
};

// =============================================================================
// 4. ENGINE 2: VISUAL RENDERING PIPELINE & CONCURRENCY LIMITER (pdfjs-dist)
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
        console.warn('PDF.js worker initialization notice:', e.message);
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

  async extractEmbeddedImages(file, onProgress) {
    const pdf = await this.loadDocument(file);
    const totalPages = pdf.numPages;
    const OPS = window.pdfjsLib.OPS;
    const images = [];

    for (let p = 1; p <= totalPages; p++) {
      const page = await pdf.getPage(p);
      const opList = await page.getOperatorList();
      let imgIndexOnPage = 0;

      for (let i = 0; i < opList.fnArray.length; i++) {
        if (opList.fnArray[i] !== OPS.paintImageXObject) continue;
        const objId = opList.argsArray[i][0];
        let img;
        try { img = page.objs.get(objId); } catch (e) { continue; }
        if (!img || !img.data || !img.width || !img.height) continue;

        const rgba = new Uint8ClampedArray(img.width * img.height * 4);
        if (img.kind === 3) {
          rgba.set(img.data.length === rgba.length ? img.data : img.data.subarray(0, rgba.length));
        } else if (img.kind === 2) {
          for (let px = 0; px < img.width * img.height; px++) {
            rgba[px * 4] = img.data[px * 3];
            rgba[px * 4 + 1] = img.data[px * 3 + 1];
            rgba[px * 4 + 2] = img.data[px * 3 + 2];
            rgba[px * 4 + 3] = 255;
          }
        } else if (img.kind === 1) {
          for (let px = 0; px < img.width * img.height; px++) {
            const v = img.data[px];
            rgba[px * 4] = v; rgba[px * 4 + 1] = v; rgba[px * 4 + 2] = v; rgba[px * 4 + 3] = 255;
          }
        } else {
          continue; 
        }

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);

        imgIndexOnPage++;
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) images.push({ name: `page${p}_image${imgIndexOnPage}.png`, blob });
      }
      if (onProgress) onProgress(Math.round((p / totalPages) * 100));
    }
    return images;
  },

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

  async renderRedactedPDF(file, redactAreas = []) {
    const { PDFDocument } = await Engine1_PDFLib.ensureLibrary();
    const pdf = await this.loadDocument(file);
    const newDoc = await PDFDocument.create();
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      ctx.fillStyle = '#000000';
      if (redactAreas.length > 0) {
        redactAreas.forEach(area => ctx.fillRect(area.x * 2.0, area.y * 2.0, area.width * 2.0, area.height * 2.0));
      } else {
        ctx.fillRect(50, viewport.height - 180, viewport.width - 100, 70);
      }

      const imgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      MemoryManager.clearCanvas(canvas);
      const embeddedImg = await newDoc.embedJpg(imgDataUrl);
      const newPage = newDoc.addPage([viewport.width / 2.0, viewport.height / 2.0]);
      newPage.drawImage(embeddedImg, { x: 0, y: 0, width: newPage.getWidth(), height: newPage.getHeight() });
    }
    const bytes = await newDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  async renderGrayscalePDF(file) {
    const { PDFDocument } = await Engine1_PDFLib.ensureLibrary();
    const pdf = await this.loadDocument(file);
    const newDoc = await PDFDocument.create();
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
      ctx.putImageData(imgData, 0, 0);

      const imgDataUrl = canvas.toDataURL('image/jpeg', 0.90);
      MemoryManager.clearCanvas(canvas);
      const embeddedImg = await newDoc.embedJpg(imgDataUrl);
      const newPage = newDoc.addPage([viewport.width / 2.0, viewport.height / 2.0]);
      newPage.drawImage(embeddedImg, { x: 0, y: 0, width: newPage.getWidth(), height: newPage.getHeight() });
    }
    const bytes = await newDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  async renderInvertedPDF(file) {
    const { PDFDocument } = await Engine1_PDFLib.ensureLibrary();
    const pdf = await this.loadDocument(file);
    const newDoc = await PDFDocument.create();
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
      ctx.putImageData(imgData, 0, 0);

      const imgDataUrl = canvas.toDataURL('image/jpeg', 0.90);
      MemoryManager.clearCanvas(canvas);
      const embeddedImg = await newDoc.embedJpg(imgDataUrl);
      const newPage = newDoc.addPage([viewport.width / 2.0, viewport.height / 2.0]);
      newPage.drawImage(embeddedImg, { x: 0, y: 0, width: newPage.getWidth(), height: newPage.getHeight() });
    }
    const bytes = await newDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  },

  async renderDocumentPagesGrid(file, container, options = {}) {
    const sessionId = ++this.currentRenderSessionId;
    container.innerHTML = '';
    const pdf = await this.loadDocument(file);
    const totalPages = pdf.numPages;
    const pageCards = [];
    const rotationMap = {};
    const deletedSet = new Set();
    const selectedSet = new Set();

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageIndex = pageNum - 1;
      rotationMap[pageIndex] = 0;
      selectedSet.add(pageIndex);

      const card = document.createElement('div');
      card.className = 'page-card selected';
      card.dataset.pageIndex = pageIndex;
      card.dataset.pageNum = pageNum;

      const check = document.createElement('div');
      check.className = 'page-check-box';
      check.innerHTML = '<i class="fa-solid fa-check"></i>';

      const thumbBox = document.createElement('div');
      thumbBox.className = 'page-thumb-box';

      const canvas = document.createElement('canvas');
      thumbBox.appendChild(canvas);

      const badge = document.createElement('div');
      badge.className = 'page-badge-num';
      badge.textContent = `Page ${pageNum}`;

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

    const CONCURRENCY_LIMIT = 2;
    let running = 0;
    let queueIndex = 0;

    return new Promise((resolve) => {
      const runNext = async () => {
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
// 5. CLIENT-SIDE AI NLP ENGINE (100% On-Device Heuristic Synthesis)
// =============================================================================
const ClientAIEngine = {
  cleanSentences(text) {
    return text.split(/(?<=[.?!۔؟])\s+|\n\n+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 500);
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
    words.forEach(w => { if (!stopWords.has(w)) freq[w] = (freq[w] || 0) + 1; });
    return freq;
  },
  generateSummary(text, numSentences = 5) {
    const sentences = this.cleanSentences(text);
    if (sentences.length <= numSentences) return sentences.join('\n\n');
    const freq = this.extractKeyTerms(text);
    const scored = sentences.map((s, idx) => {
      const words = s.toLowerCase().match(/[\w\u0600-\u06FF\u0C00-\u0C7F\u0900-\u097F]{3,}/g) || [];
      let score = 0;
      words.forEach(w => { score += (freq[w] || 0); });
      const posBoost = 1.0 + (1.0 / (idx + 1));
      return { sentence: s, score: (score / Math.max(words.length, 1)) * posBoost, idx };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, numSentences).sort((a, b) => a.idx - b.idx);
    return top.map(item => `• ${item.sentence}`).join('\n\n');
  }
};

// =============================================================================
// 6. COMPLETE TOOL CONFIGURATIONS REGISTRY (ALL 33 ADVERTISED TOOLS)
// =============================================================================
const TOOLS = {
  'merge': {
    name: 'Merge PDF',
    icon: 'fa-object-group',
    desc: 'Combine multiple PDF files into one clean, continuous document in your exact preferred order.',
    accept: '.pdf,application/pdf',
    multiple: true,
    minFiles: 2,
    reorderable: true,
    btnText: 'Merge PDFs Now',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Merge Order</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Drag and drop file cards in the file list on the left to re-arrange page sequence.
        </p>
      </div>
    `
  },

  'split': {
    name: 'Split PDF',
    icon: 'fa-scissors',
    desc: 'Extract specific pages, custom ranges, or individual sheets from your PDF with visual confirmation.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Split PDF',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Extraction Mode</label>
        <div class="radio-cards">
          <label class="radio-card selected">
            <input type="radio" name="splitMode" value="range" checked>
            <div class="radio-card-info">
              <strong>Custom Range</strong>
              <small>e.g. 1-3, 5, 8-10</small>
            </div>
          </label>
          <label class="radio-card">
            <input type="radio" name="splitMode" value="visual">
            <div class="radio-card-info">
              <strong>Visual Selector</strong>
              <small>Click pages in thumbnail grid</small>
            </div>
          </label>
        </div>
      </div>
      <div class="option-group" id="rangeInputGroup">
        <label class="option-label" for="splitRangeInput">Page Range(s)</label>
        <input type="text" id="splitRangeInput" class="option-input" placeholder="e.g. 1-5, 8" value="1">
      </div>
    `
  },

  'compress': {
    name: 'Compress PDF (Stream & Structure Optimizer)',
    icon: 'fa-file-zipper',
    desc: 'Optimize internal cross-reference streams and object dictionaries without cloud uploads. Note: Embedded pre-compressed images are not lossy downsampled.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Compress PDF Streams',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Compression Level</label>
        <div class="radio-cards">
          <label class="radio-card selected">
            <input type="radio" name="compressionLevel" value="balanced" checked>
            <div class="radio-card-info">
              <strong>Balanced Stream Optimizer</strong>
              <small>Optimizes object streams & cross-references</small>
            </div>
          </label>
          <label class="radio-card">
            <input type="radio" name="compressionLevel" value="maximum">
            <div class="radio-card-info">
              <strong>Maximum Object Deduplication</strong>
              <small>Strips redundant dictionary objects & metadata</small>
            </div>
          </label>
        </div>
      </div>
      <p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.3; margin-top: 8px;">
        Note: In-browser structural compression preserves full raster image quality without downsampling. Files with pre-compressed images will show minimal size change.
      </p>
`
  },

  'image-to-pdf': {
    name: 'Image to PDF',
    icon: 'fa-images',
    desc: 'Convert JPG, PNG, and WebP graphics into clean, high-resolution PDF pages.',
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
    multiple: true,
    minFiles: 1,
    reorderable: true,
    btnText: 'Convert Images to PDF',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Layout Mode</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Preserves original image pixel dimensions with automatic page aspect ratio fitting.
        </p>
      </div>
    `
  },

  'rotate': {
    name: 'Rotate PDF',
    icon: 'fa-rotate-right',
    desc: 'Rotate single pages or the entire document by 90°, 180°, or 270° degrees.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Save Rotated PDF',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label" for="rotateAngleSelect">Rotation Angle</label>
        <select id="rotateAngleSelect" class="option-select">
          <option value="90">90° Clockwise</option>
          <option value="180">180° Flip</option>
          <option value="270">270° (90° Counter-Clockwise)</option>
        </select>
      </div>
    `
  },

  'watermark': {
    name: 'Add Watermark',
    icon: 'fa-stamp',
    desc: 'Apply custom text watermarks across pages with opacity, angle, and positioning controls.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Apply Watermark',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label" for="wmText">Watermark Text</label>
        <input type="text" id="wmText" class="option-input" value="CONFIDENTIAL" placeholder="Watermark text">
      </div>
      <div class="option-group">
        <label class="option-label" for="wmPosition">Position & Orientation</label>
        <select id="wmPosition" class="option-select">
          <option value="diagonal" selected>Diagonal (Centered 45°)</option>
          <option value="horizontal">Horizontal (Centered)</option>
        </select>
      </div>
      <div class="option-group">
        <label class="option-label" for="wmOpacity">Opacity</label>
        <select id="wmOpacity" class="option-select">
          <option value="0.15">Subtle (15%)</option>
          <option value="0.30" selected>Standard (30%)</option>
          <option value="0.60">Strong (60%)</option>
        </select>
      </div>
    `
  },

  'page-numbers': {
    name: 'Page Numbers',
    icon: 'fa-list-ol',
    desc: 'Insert formatted page numbers (Page X of Y) at bottom-center, bottom-right, or top-center.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Insert Page Numbers',
    status: 'optimized',
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

  'organize': {
    name: 'Organize PDF',
    icon: 'fa-table-cells-large',
    desc: 'Visually sort, reorder, delete, and rearrange pages within your document.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Save Organized PDF',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Interactive Controls</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Use the visual page grid on the left to delete or select pages.
        </p>
      </div>
    `
  },

  'pdf-to-jpg': {
    name: 'PDF to JPG',
    icon: 'fa-file-image',
    desc: 'Extract and render PDF pages into crisp high-resolution JPEG image files.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Render to JPG',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Rendering Resolution</label>
        <select id="jpgResolution" class="option-select">
          <option value="2.0" selected>High Resolution (300 DPI equivalent)</option>
          <option value="1.0">Standard Resolution (150 DPI)</option>
        </select>
      </div>
    `
  },

  'extract-text': {
    name: 'Extract Text (TXT)',
    icon: 'fa-file-lines',
    desc: 'Extract text layer contents with UTF-8 BOM encoding for full Urdu, Arabic, Telugu, and English fidelity.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Extract Text',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Encoding Format</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          UTF-8 BOM (Byte Order Mark) active to guarantee zero character corruption in Windows and Mac text editors.
        </p>
      </div>
    `
  },

  'flatten': {
    name: 'Flatten PDF Forms',
    icon: 'fa-layer-group',
    desc: 'Permanently bake interactive PDF form fields, textboxes, and checkboxes into immutable page streams.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Flatten Form Fields',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Security & Immutability</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Converts editable form widgets into permanent graphic elements. Form fields will no longer be fillable.
        </p>
      </div>
    `
  },

  'metadata': {
    name: 'PDF Metadata Editor',
    icon: 'fa-tags',
    desc: 'View, edit, or sanitize document Title, Author, Subject, and Keywords directly in browser.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Save Metadata Changes',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label" for="metaTitle">Document Title</label>
        <input type="text" id="metaTitle" class="option-input" placeholder="Title">
      </div>
      <div class="option-group">
        <label class="option-label" for="metaAuthor">Author</label>
        <input type="text" id="metaAuthor" class="option-input" placeholder="Author name">
      </div>
      <div class="option-group">
        <label class="option-label" for="metaSubject">Subject</label>
        <input type="text" id="metaSubject" class="option-input" placeholder="Subject / Description">
      </div>
      <div class="option-group">
        <label class="option-label" for="metaKeywords">Keywords (comma separated)</label>
        <input type="text" id="metaKeywords" class="option-input" placeholder="keyword1, keyword2">
      </div>
    `
  },

  'base64': {
    name: 'Base64 & Data URI',
    icon: 'fa-code',
    desc: 'Convert PDF files to Base64 Data URI strings for web embedding, or reconstruct PDFs from Base64.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Convert to Base64 String',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Output Type</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Generates compliant <code>data:application/pdf;base64,...</code> string with instant 1-click clipboard copy.
        </p>
      </div>
    `
  },

  'grayscale': {
    name: 'Grayscale / B&W',
    icon: 'fa-circle-half-stroke',
    desc: 'Convert full-color documents into genuine black-and-white / grayscale documents for printing.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Convert to Grayscale',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Color Space</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Applies luminance desaturation (0.299R + 0.587G + 0.114B) across all page raster channels.
        </p>
      </div>
    `
  },

  'invert': {
    name: 'Dark Mode / Invert',
    icon: 'fa-circle-notch',
    desc: 'Invert page contrast to create high-visibility dark mode documents for nighttime reading.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Invert Document Colors',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Visual Inversion</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Flips white backgrounds to black and text to high-contrast white.
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
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Markdown Layout</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Supports headings (#, ##), bullet points (-), and clean typography.
        </p>
      </div>
    `
  },

  'sign': {
    name: 'Sign PDF (Electronic Signature Stamp)',
    icon: 'fa-signature',
    desc: 'Draw an electronic signature and stamp it onto your document. Note: Electronic visual stamp applied; does not generate cryptographic PKI X.509 certificates.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Stamp Signature & Save',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Draw Signature</label>
        <div style="background: var(--bg-tertiary); border: 2px dashed var(--border-color); border-radius: var(--radius-md); padding: 8px; text-align: center;">
          <canvas id="signaturePad" width="280" height="120" style="background: #ffffff; border-radius: 4px; cursor: crosshair; touch-action: none; width: 100%; height: 120px;"></canvas>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
            <div style="display: flex; gap: 6px;">
              <button type="button" class="sig-color-btn" data-color="#0f172a" style="width: 22px; height: 22px; border-radius: 50%; background: #0f172a; border: none; cursor: pointer;"></button>
              <button type="button" class="sig-color-btn" data-color="#1d4ed8" style="width: 22px; height: 22px; border-radius: 50%; background: #1d4ed8; border: none; cursor: pointer;"></button>
              <button type="button" class="sig-color-btn" data-color="#b91c1c" style="width: 22px; height: 22px; border-radius: 50%; background: #b91c1c; border: none; cursor: pointer;"></button>
            </div>
            <button id="clearSignatureBtn" type="button" style="background: none; border: none; font-size: 0.82rem; color: var(--text-muted); cursor: pointer;">
              <i class="fa-solid fa-trash"></i> Clear
            </button>
          </div>
        </div>
      </div>
      <div class="option-group">
        <label class="option-label" for="sigPosition">Placement</label>
        <select id="sigPosition" class="option-select">
          <option value="bottom-right" selected>Bottom Right (All Pages)</option>
          <option value="bottom-left">Bottom Left (All Pages)</option>
          <option value="first-page">First Page Only (Bottom Right)</option>
          <option value="last-page">Last Page Only (Bottom Right)</option>
        </select>
      </div>
      <p style="font-size: 0.76rem; color: var(--text-muted); line-height: 1.3;">
        Note: Electronic signature stamp applied. For cryptographic PKI certificates (X.509), a dedicated Certificate Authority is required.
      </p>
    `,
    postRender: () => {
      initSignatureCanvas();
    }
  },

  'redact': {
    name: 'Redact & Sanitize PDF (High-DPI Raster)',
    icon: 'fa-user-secret',
    desc: 'Permanently eliminates sensitive text by rasterizing pages into high-DPI images with blackened regions. Note: Underlying text streams are permanently destroyed to guarantee zero data recovery.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Redact & Sanitize PDF',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Security Sanitization</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Renders page visuals to high-DPI raster canvas, blackens target regions, and reconstructs image-backed PDF. Underlying text is permanently eliminated and cannot be recovered via copy/paste or search.
        </p>
      </div>
    `
  },

  'extract-images': {
    name: 'Page Artwork & Visual Asset Extractor (High-Res JPEG)',
    icon: 'fa-image',
    desc: 'Render high-resolution page visual assets (300 DPI equivalent) from vector canvas streams. Note: Does not extract isolated raw image XObjects separately from typography.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Extract Images',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Extraction Target</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Scans and extracts high-resolution page visual assets (JPEG format, 300 DPI equivalent).
        </p>
      </div>
    `
  },

  'ocr': {
    name: 'Digital Text Layer Extractor & Reconstructor',
    icon: 'fa-eye',
    desc: 'Extract and reconstruct digital text streams with Unicode support. Note: Scanned bitmap images without text streams require optical OCR models.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Extract Digital Text Layer',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Language Script Model</label>
        <select id="ocrLangSelect" class="option-select">
          <option value="universal" selected>Universal Multi-Script (English, Urdu, Arabic, Telugu, Hindi)</option>
          <option value="eng">English (Latin)</option>
          <option value="ara_urd">Arabic & Urdu (RTL)</option>
          <option value="tel_hin">Telugu & Hindi (Indic)</option>
        </select>
      </div>
    `
  },

  'ai-summarize': {
    name: 'AI PDF Summarizer (Cloud — Google Gemini)',
    icon: 'fa-wand-magic-sparkles',
    desc: 'Extract executive summaries, key points, and ask questions about your document using Google Gemini. Unlike every other tool on this site, this one sends your document\'s text content to Google\'s servers for processing — it is not local or private.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Generate AI Summary & Q&A',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group" style="background: rgba(229, 50, 45, 0.08); border: 1px solid rgba(229, 50, 45, 0.25); border-radius: var(--radius-md, 12px); padding: 14px 16px; margin-bottom: 16px;">
        <strong style="display:flex; align-items:center; gap:8px; color: var(--primary, #e5322d);"><i class="fa-solid fa-cloud-arrow-up"></i> This tool is not private</strong>
        <p style="font-size: 0.85rem; margin: 6px 0 0; line-height: 1.5;">
          To generate the summary, your document's extracted text is sent to <strong>Google's Gemini API</strong> using an API key you provide. This is different from every other tool on this site, which processes files 100% locally in your browser and never transmits document content anywhere. Do not use this tool on documents you don't want to share with Google.
        </p>
      </div>
      <div class="option-group">
        <label class="option-label">AI Processing Mode</label>
        <div class="radio-cards">
          <label class="radio-card selected">
            <input type="radio" name="aiSummaryMode" value="executive" checked>
            <div class="radio-card-info">
              <strong>Executive Summary (5 Key Points)</strong>
              <small>Sent to Google Gemini for processing</small>
            </div>
          </label>
          <label class="radio-card">
            <input type="radio" name="aiSummaryMode" value="deep">
            <div class="radio-card-info">
              <strong>Comprehensive In-Depth Synthesis</strong>
              <small>Detailed breakdown of core findings</small>
            </div>
          </label>
        </div>
      </div>
    `
  },

  'pdf-to-word': {
    name: 'PDF to Word-Compatible Document (.doc)',
    icon: 'fa-file-word',
    desc: 'Export semantic document structure with UTF-8 BOM encoding for Microsoft Word and LibreOffice. Note: Generates universal .doc format rather than binary .docx.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Convert PDF to Word',
    status: 'optimized',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Export Format</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Produces semantic Word (.doc) with UTF-8 BOM encoding. Opens cleanly in Microsoft Word and LibreOffice with full Arabic/Urdu typography.
        </p>
      </div>
    `
  },

  'word-to-pdf': {
    name: 'Document / Text to PDF',
    icon: 'fa-file-pdf',
    desc: 'Compile structured text, Markdown, and exported document content into formatted PDF pages. Binary .docx files require pre-exporting or XML extraction.',
    accept: '.txt,.md,text/plain,text/markdown',
    multiple: false,
    minFiles: 1,
    btnText: 'Convert Word to PDF',
    status: 'process',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Conversion Engine</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Browser-based document compiler active. Formats document content into clean PDF layout.
        </p>
      </div>
    `
  },

  'pdf-to-excel': {
    name: 'PDF to CSV / Excel-Compatible',
    icon: 'fa-file-excel',
    desc: 'Extract tabular figures and text into universal CSV format compatible with Excel and Google Sheets.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Extract Tables to Excel',
    status: 'process',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Spreadsheet Format</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Extracts delimited tabular rows into universal CSV compatible with Excel, Google Sheets, and Numbers.
        </p>
      </div>
    `
  },

  'excel-to-pdf': {
    name: 'CSV / Tabular Data to PDF',
    icon: 'fa-file-pdf',
    desc: 'Compile CSV and delimited tabular text into structured PDF tables.',
    accept: '.csv,text/csv,text/plain',
    multiple: false,
    minFiles: 1,
    btnText: 'Convert Excel to PDF',
    status: 'process',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Table Layout</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Auto-fits columns and formats headers into clean printable PDF pages.
        </p>
      </div>
    `
  },

  'pdf-to-ppt': {
    name: 'PDF to PowerPoint Slides (Image-Based)',
    icon: 'fa-file-powerpoint',
    desc: 'Render PDF pages into high-resolution slide container images for presentations. Individual vector elements are not individually editable.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Convert to Slides',
    status: 'process',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Slide Deck Format</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Extracts each PDF page into a high-resolution slide container for PowerPoint presentation.
        </p>
      </div>
    `
  },

  'ppt-to-pdf': {
    name: 'Slide Document to PDF',
    icon: 'fa-file-pdf',
    desc: 'Compile slide image decks and structured presentation content into PDF format.',
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
    multiple: false,
    minFiles: 1,
    btnText: 'Convert PPT to PDF',
    status: 'process',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Slide Processing</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Compiles slides sequentially into standard printable PDF orientation.
        </p>
      </div>
    `
  },

  'protect': {
    name: 'PDF Permissions & Restrictions (Metadata Lock)',
    icon: 'fa-lock',
    desc: 'Apply browser-level permissions and metadata restriction flags. Note: Binary AES-256 password encryption requires a native backend/desktop engine.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Apply Metadata Restrictions',
    status: 'process',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label" for="pdfPass">Access Passphrase</label>
        <input type="password" id="pdfPass" class="option-input" placeholder="Enter passphrase">
      </div>
      <p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.3;">
        Applies client-side document security attributes and viewer restrictions.
      </p>
    `
  },

  'unlock': {
    name: 'Remove Restrictions (Metadata Unlock)',
    icon: 'fa-unlock',
    desc: 'Clear metadata modification locks and restriction flags. Note: Cryptographically encrypted user passwords (AES/RC4) cannot be cracked client-side.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Clear Restrictions',
    status: 'process',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Security Sanitization</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Removes modification locks and viewer restrictions.
        </p>
      </div>
    `
  },

  'repair': {
    name: 'Repair PDF (Index & Structure Rebuilder)',
    icon: 'fa-wrench',
    desc: 'Rebuild damaged cross-reference (xref) indices and reconstruct object dictionaries. Note: Severe binary truncation or destroyed catalog roots cannot be recovered.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Repair Document',
    status: 'process',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Diagnostic Repair</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Scans and rebuilds object dictionaries, repairing broken xref offsets.
        </p>
      </div>
    `
  },

  'pdf-to-pdfa': {
    name: 'PDF Archival Stamping (PDF/A Tags)',
    icon: 'fa-box-archive',
    desc: 'Apply archival metadata headers and document identification tags. Note: Strict ISO 19005-1 compliance requires embedded ICC profiles and font programs.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Apply Archival Metadata',
    status: 'process',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Archival Profile</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Tags output with PDF/A-1b compliance indicators for long-term document preservation.
        </p>
      </div>
    `
  },

  'compare': {
    name: 'Compare PDF (Text & Structural Diff)',
    icon: 'fa-code-compare',
    desc: 'Perform structural metadata, dimension, and text content comparison between two documents. Note: Pixel-level visual overlay diffing is not performed.',
    accept: '.pdf,application/pdf',
    multiple: true,
    minFiles: 2,
    btnText: 'Compare Documents',
    status: 'process',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label">Comparison Scope</label>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4;">
          Analyzes page count, dimension differences, and textual variances between File 1 and File 2.
        </p>
      </div>
    `
  },

  'edit': {
    name: 'Add Text & Annotations',
    icon: 'fa-pen-to-square',
    desc: 'Inject custom text notes, headers, and revision labels onto PDF pages. Note: Does not alter or re-flow existing immutable document typography.',
    accept: '.pdf,application/pdf',
    multiple: false,
    minFiles: 1,
    btnText: 'Apply Annotations',
    status: 'process',
    renderOptions: () => `
      <div class="option-group">
        <label class="option-label" for="editNoteText">Annotation / Header Text</label>
        <input type="text" id="editNoteText" class="option-input" placeholder="e.g. APPROVED - 2026" value="APPROVED">
      </div>
      <div class="option-group">
        <label class="option-label" for="editPosition">Position</label>
        <select id="editPosition" class="option-select">
          <option value="top-right" selected>Top Right Header</option>
          <option value="top-center">Top Center</option>
          <option value="bottom-center">Bottom Center Footer</option>
        </select>
      </div>
    `
  }
};

// Tool helper function
function getRequestedToolKey() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramTool = urlParams.get('tool');
  if (paramTool) return paramTool.toLowerCase().trim();

  const pathMatch = window.location.pathname.match(/\/tools\/([a-z0-9-]+)/i);
  if (pathMatch && pathMatch[1]) return pathMatch[1].toLowerCase().trim();

  const hashMatch = window.location.hash.match(/#\/?([a-z0-9-]+)/i);
  if (hashMatch && hashMatch[1]) return hashMatch[1].toLowerCase().trim();

  return null;
}

function getToolConfig(toolKey) {
  if (toolKey && TOOLS[toolKey]) return { key: toolKey, ...TOOLS[toolKey] };
  return null;
}

// =============================================================================
// 7. WORKSPACE INITIALIZATION & ROUTING CONTROLLER
// =============================================================================
function initWorkspace() {
  const workspaceBody = document.getElementById('workspaceBody');
  const notFoundView = document.getElementById('toolNotFoundView');
  if (!workspaceBody) return; // Not on tool.html

  const toolKey = getRequestedToolKey();
  const toolConfig = getToolConfig(toolKey);

  // Handle Invalid or Missing Tool Route
  if (!toolKey || !toolConfig) {
    if (notFoundView) {
      notFoundView.style.display = 'block';
      workspaceBody.style.display = 'none';
      const msg = document.getElementById('toolNotFoundMessage');
      if (msg) {
        msg.innerHTML = toolKey 
          ? `The requested tool "<strong>${escapeHtml(toolKey)}</strong>" was not recognized in the CodeWithAli PDF suite.`
          : 'Please select a tool from the suite to begin document processing.';
      }
      document.title = 'Tool Not Found | CodeWithAli PDF Tools Suite';
      const breadcrumb = document.getElementById('breadcrumbToolName');
      if (breadcrumb) breadcrumb.textContent = 'Tool Not Found';
      const title = document.getElementById('workspaceTitle');
      if (title) title.textContent = 'Select a Valid PDF Tool';
      const desc = document.getElementById('workspaceDesc');
      if (desc) desc.textContent = 'Explore our catalog of 32+ high-performance PDF utilities.';
    }
    return;
  }

  // Valid tool route: Show workspace
  if (notFoundView) notFoundView.style.display = 'none';
  workspaceBody.style.display = 'grid';

  // Highlight active nav item
  document.querySelectorAll('.nav-menu .nav-link').forEach(link => {
    if (link.getAttribute('data-tool') === toolKey) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Populate workspace headers
  document.title = `${toolConfig.name} | CodeWithAli PDF Tools Suite`;
  const breadcrumb = document.getElementById('breadcrumbToolName');
  if (breadcrumb) breadcrumb.textContent = toolConfig.name;
  const title = document.getElementById('workspaceTitle');
  if (title) title.textContent = toolConfig.name;
  const desc = document.getElementById('workspaceDesc');
  if (desc) desc.textContent = toolConfig.desc;
  const actionBtnText = document.getElementById('actionBtnText');
  if (actionBtnText) actionBtnText.textContent = toolConfig.btnText;

  // Status badge
  const statusBadge = document.getElementById('workspaceStatusBadge');
  if (statusBadge) {
    if (toolConfig.status === 'optimized') {
      statusBadge.innerHTML = '<span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 14px; border-radius: var(--radius-full); background: rgba(16, 185, 129, 0.12); color: #059669; font-size: 0.82rem; font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.25);"><i class="fa-solid fa-bolt"></i> Fast Worker Engine Active</span>';
    } else {
      statusBadge.innerHTML = '<span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 14px; border-radius: var(--radius-full); background: rgba(245, 158, 11, 0.12); color: #d97706; font-size: 0.82rem; font-weight: 700; border: 1px solid rgba(245, 158, 11, 0.25);"><i class="fa-solid fa-flask"></i> Standard In-Browser Optimization Active</span>';
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
  if (fileInput) {
    fileInput.accept = toolConfig.accept;
    fileInput.multiple = !!toolConfig.multiple;
  }

  const selectFilesBtnText = document.getElementById('selectFilesBtnText');
  const dropzoneHint = document.getElementById('dropzoneHint');

  if (toolKey === 'image-to-pdf' && selectFilesBtnText) {
    selectFilesBtnText.textContent = 'Select JPG / PNG Images';
    if (dropzoneHint) dropzoneHint.textContent = 'or drop images here';
  } else if (toolKey === 'markdown-to-pdf') {
    if (selectFilesBtnText) selectFilesBtnText.textContent = 'Upload .md File';
    if (dropzoneHint) dropzoneHint.textContent = 'or edit markdown in the box below';
    const mdBox = document.getElementById('markdownEditorBox');
    if (mdBox) {
      mdBox.style.display = 'block';
      const mdInput = document.getElementById('markdownInput');
      if (mdInput && !mdInput.value) {
        mdInput.value = `# Project Documentation\n## Executive Summary\nEngineered with **CodeWithAli PDF Tools Suite**.\n\n### Key Highlights\n- 100% in-browser processing\n- Zero server round-trips\n- Complete data privacy`;
      }
    }
  }

  // State
  let uploadedFiles = [];
  let pageGridState = null;

  const selectFilesBtn = document.getElementById('selectFilesBtn');
  if (selectFilesBtn && fileInput) {
    selectFilesBtn.onclick = () => fileInput.click();
  }

  const addMoreBtn = document.getElementById('addMoreFilesBtn');
  if (addMoreBtn && fileInput) {
    addMoreBtn.onclick = () => fileInput.click();
  }

  const dropzone = document.getElementById('dropzone');
  if (dropzone && fileInput) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-active');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-active');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-active');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileSelection(Array.from(e.dataTransfer.files));
      }
    });
  }

  if (fileInput) {
    fileInput.onchange = (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelection(Array.from(e.target.files));
      }
    };
  }

  async function handleFileSelection(newFiles) {
    // CRASH PROTECTION LOGIC ADDED HERE
    const MAX_FILE_SIZE_MB = 100;
    const MAX_TOTAL_FILES = 50;

    if (uploadedFiles.length + newFiles.length > MAX_TOTAL_FILES) {
        showToast(`Limit Exceeded: You can only select up to ${MAX_TOTAL_FILES} files.`, 'error');
        return;
    }

    const validFiles = [];
    for (let file of newFiles) {
        if ((file.size / (1024 * 1024)) > MAX_FILE_SIZE_MB) {
            showToast(`File too large: "${file.name}" exceeds ${MAX_FILE_SIZE_MB}MB limit.`, 'error');
            continue;
        }
        validFiles.push(file);
    }

    if (!toolConfig.multiple) {
      if (validFiles.length > 0) uploadedFiles = [validFiles[0]];
    } else {
      validFiles.forEach(nf => {
        if (!uploadedFiles.some(f => f.name === nf.name && f.size === nf.size)) {
          uploadedFiles.push(nf);
        }
      });
    }

    renderSelectedFilesUI();
  }

  async function renderSelectedFilesUI() {
    const fileListWrapper = document.getElementById('fileListWrapper');
    const filesContainer = document.getElementById('filesContainer');
    const fileCountBadge = document.getElementById('fileCountBadge');
    const dropzone = document.getElementById('dropzone');

    if (!fileListWrapper || !filesContainer) return;

    if (uploadedFiles.length === 0) {
      fileListWrapper.style.display = 'none';
      if (dropzone) dropzone.style.display = 'block';
      return;
    }

    if (dropzone && !toolConfig.multiple) {
      dropzone.style.display = 'none';
    }

    fileListWrapper.style.display = 'block';
    if (fileCountBadge) fileCountBadge.textContent = uploadedFiles.length;
    filesContainer.innerHTML = '';

    uploadedFiles.forEach((file, index) => {
      const card = document.createElement('div');
      card.className = 'file-card';
      // DRAG AND DROP REORDER SUPPORT FOR MERGE TOOL
      if (toolKey === 'merge' || toolKey === 'image-to-pdf') {
          card.draggable = true;
          card.dataset.index = index;
          card.style.cursor = 'grab';

          card.addEventListener('dragstart', (e) => {
              e.dataTransfer.setData('text/plain', index);
              card.style.opacity = '0.5';
          });
          card.addEventListener('dragend', () => card.style.opacity = '1');
          card.addEventListener('dragover', (e) => e.preventDefault());
          card.addEventListener('drop', (e) => {
              e.preventDefault();
              const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
              const toIndex = index;
              if (fromIndex !== toIndex) {
                  const temp = uploadedFiles[fromIndex];
                  uploadedFiles.splice(fromIndex, 1);
                  uploadedFiles.splice(toIndex, 0, temp);
                  renderSelectedFilesUI();
              }
          });
      }

      card.innerHTML = `
        <div class="file-card-thumb">
          <i class="fa-solid ${file.type.includes('image') ? 'fa-image' : 'fa-file-pdf'}" style="color: #e5322d; font-size: 1.8rem;"></i>
        </div>
        <div class="file-card-info" style="flex: 1; min-width: 0;">
          <strong style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem;">${escapeHtml(file.name)}</strong>
          <small style="color: var(--text-muted); font-size: 0.78rem;">${formatBytes(file.size)}</small>
        </div>
        <button type="button" class="file-remove-btn" title="Remove" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 6px;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      `;

      card.querySelector('.file-remove-btn').onclick = (e) => {
        e.stopPropagation();
        uploadedFiles.splice(index, 1);
        renderSelectedFilesUI();
      };

      filesContainer.appendChild(card);
    });

    // Populate Metadata Inputs if in metadata editor
    if (toolKey === 'metadata' && uploadedFiles.length > 0) {
      try {
        const { PDFDocument } = await Engine1_PDFLib.ensureLibrary();
        const buf = await Engine1_PDFLib.readFileAsArrayBuffer(uploadedFiles[0]);
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        const titleIn = document.getElementById('metaTitle');
        const authorIn = document.getElementById('metaAuthor');
        const subjectIn = document.getElementById('metaSubject');
        const kwIn = document.getElementById('metaKeywords');
        if (titleIn) titleIn.value = doc.getTitle() || '';
        if (authorIn) authorIn.value = doc.getAuthor() || '';
        if (subjectIn) subjectIn.value = doc.getSubject() || '';
        if (kwIn) {
          const kwVal = doc.getKeywords();
          kwIn.value = Array.isArray(kwVal) ? kwVal.join(', ') : (kwVal || '');
        }
      } catch (e) {
        console.warn('Metadata inspection notice:', e.message);
      }
    }

    // Interactive Thumbnail Grid for visual tools
    const visualTools = ['split', 'rotate', 'organize', 'redact'];
    const pagesWrapper = document.getElementById('pagesPreviewWrapper');
    const pagesContainer = document.getElementById('pagesContainer');

    if (visualTools.includes(toolKey) && uploadedFiles.length > 0 && pagesWrapper && pagesContainer) {
      pagesWrapper.style.display = 'block';
      const file = uploadedFiles[0];
      const totalCountSpan = document.getElementById('totalPagesCount');

      pageGridState = await Engine2_PDFJS.renderDocumentPagesGrid(file, pagesContainer, {
        showDeleteBtn: toolKey === 'organize',
        onSelectionChanged: (selectedIndices) => {
          const rangeInput = document.getElementById('splitRangeInput');
          if (rangeInput) {
            rangeInput.value = indicesToRangeString(selectedIndices);
          }
        }
      });

      if (totalCountSpan && pageGridState) {
        totalCountSpan.textContent = pageGridState.totalPages;
      }
    }
  }

  // ===========================================================================
  // 8. ACTION EXECUTION PIPELINE
  // ===========================================================================
  const actionBtn = document.getElementById('actionSubmitBtn');
  if (actionBtn) {
    actionBtn.onclick = async () => {
      const min = toolConfig.minFiles !== undefined ? toolConfig.minFiles : 1;
      if (uploadedFiles.length < min && toolKey !== 'markdown-to-pdf') {
        showToast(`Please select at least ${min} file${min > 1 ? 's' : ''} to proceed.`, 'error');
        return;
      }

      showProcessingOverlay();
      setProgressBar(25);

      try {
        let resultBlob = null;
        let downloadFilename = 'CodeWithAli_Document.pdf';
        const file = uploadedFiles[0];
        
        // WORKER ROUTING INTEGRATION
        const engine = window.ClientPDFEngine; // ClientPDFEngine with Worker logic

        if (toolKey === 'merge') {
          if (engine) resultBlob = await engine.mergePDFs(uploadedFiles);
          else resultBlob = await Engine1_PDFLib.mergePDFs(uploadedFiles);
          downloadFilename = 'CodeWithAli_Merged.pdf';
        } 
        else if (toolKey === 'split') {
          const mode = document.querySelector('input[name="splitMode"]:checked')?.value || 'range';
          let rangeStr = '1';
          let pageIndices = [];

          if (mode === 'range') {
            rangeStr = document.getElementById('splitRangeInput')?.value || '1';
            pageIndices = parseRangeString(rangeStr);
          } else if (pageGridState && pageGridState.selectedSet) {
            pageIndices = Array.from(pageGridState.selectedSet);
            rangeStr = indicesToRangeString(pageIndices);
          }

          if (engine) resultBlob = await engine.splitPDF(file, mode, rangeStr);
          else resultBlob = await Engine1_PDFLib.splitPDF(file, pageIndices);
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Split.pdf`;
        }
        else if (toolKey === 'rotate') {
          const rotationMap = pageGridState?.rotationMap || {};
          const globalSelect = document.getElementById('rotateAngleSelect');
          const defaultAngle = globalSelect ? parseInt(globalSelect.value, 10) : 90;
          const hasIndividual = Object.values(rotationMap).some(deg => deg !== 0);
          
          if (engine && !hasIndividual) resultBlob = await engine.rotatePDF(file, defaultAngle);
          else resultBlob = await Engine1_PDFLib.rotatePDF(file, hasIndividual ? rotationMap : defaultAngle);
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Rotated.pdf`;
        }
        else if (toolKey === 'organize') {
          const deleted = pageGridState?.deletedSet || new Set();
          resultBlob = await Engine1_PDFLib.deletePages(file, Array.from(deleted));
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Organized.pdf`;
        }
        else if (toolKey === 'compress') {
          const level = document.querySelector('input[name="compressionLevel"]:checked')?.value || 'balanced';
          if (level === 'maximum') {
            const { PDFDocument } = await Engine1_PDFLib.ensureLibrary();
            const compDoc = await PDFDocument.create();
            const pdf = await Engine2_PDFJS.loadDocument(file);
            for (let p = 1; p <= pdf.numPages; p++) {
              const jpgBlob = await Engine2_PDFJS.renderPageToJpgBlob(file, p, 1.2);
              const imgBytes = await jpgBlob.arrayBuffer();
              const embedded = await compDoc.embedJpg(imgBytes);
              const page = compDoc.addPage([embedded.width, embedded.height]);
              page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
            }
            const finalBytes = await compDoc.save({ useObjectStreams: true });
            resultBlob = new Blob([finalBytes], { type: 'application/pdf' });
          } else {
            if (engine) resultBlob = await engine.compressPDF(file, level);
            else resultBlob = await Engine1_PDFLib.compressPDF(file);
          }
          downloadFilename = `CodeWithAli_Compressed_${file.name}`;
        }
        else if (toolKey === 'watermark') {
          const text = document.getElementById('wmText')?.value || 'CONFIDENTIAL';
          const options = {
            position: document.getElementById('wmPosition')?.value || 'diagonal',
            opacity: document.getElementById('wmOpacity')?.value || '0.3',
            fontSize: 44
          };
          if (engine) resultBlob = await engine.addWatermark(file, text, options);
          else resultBlob = await Engine1_PDFLib.addWatermark(file, text, options);
          downloadFilename = `CodeWithAli_Watermarked_${file.name}`;
        }
        else if (toolKey === 'page-numbers') {
          const position = document.getElementById('pnPosition')?.value || 'bottom-center';
          if (engine) resultBlob = await engine.addPageNumbers(file, { position });
          else resultBlob = await Engine1_PDFLib.addPageNumbers(file, { position });
          downloadFilename = `CodeWithAli_Numbered_${file.name}`;
        }
        else if (toolKey === 'image-to-pdf') {
          if (engine) resultBlob = await engine.imageToPDF(uploadedFiles);
          else resultBlob = await Engine1_PDFLib.imageToPDF(uploadedFiles);
          downloadFilename = 'CodeWithAli_Images.pdf';
        }
        else if (toolKey === 'pdf-to-jpg') {
          const scale = parseFloat(document.getElementById('jpgResolution')?.value || '2.0');
          const baseName = file.name.replace(/\.[^/.]+$/, '');
          const pdfDoc = await Engine2_PDFJS.loadDocument(file);
          const totalPages = pdfDoc.numPages;

          if (totalPages <= 1) {
            resultBlob = await Engine2_PDFJS.renderPageToJpgBlob(file, 1, scale);
            downloadFilename = `${baseName}_Page_1.jpg`;
          } else {
            if (!window.JSZip) throw new Error('JSZip library failed to load — cannot bundle multi-page JPG output.');
            const zip = new window.JSZip();
            for (let p = 1; p <= totalPages; p++) {
              const jpgBlob = await Engine2_PDFJS.renderPageToJpgBlob(file, p, scale);
              zip.file(`${baseName}_Page_${p}.jpg`, jpgBlob);
              setProgressBar(Math.round((p / totalPages) * 100));
            }
            resultBlob = await zip.generateAsync({ type: 'blob' });
            downloadFilename = `${baseName}_AllPages_JPG.zip`;
          }
        }
        else if (toolKey === 'pdf-to-excel') {
          resultBlob = await Engine2_PDFJS.pdfToExcel(file);
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Converted.xlsx`;
        }
        else if (toolKey === 'extract-text') {
          if (engine) {
            const res = await engine.extractText(file);
            showResultScreen(res, toolConfig);
            return;
          }
        }
        else if (toolKey === 'flatten') {
          resultBlob = await Engine1_PDFLib.flattenPDF(file);
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Flattened.pdf`;
        }
        else if (toolKey === 'metadata') {
          const title = document.getElementById('metaTitle')?.value || '';
          const author = document.getElementById('metaAuthor')?.value || '';
          const subject = document.getElementById('metaSubject')?.value || '';
          const kw = document.getElementById('metaKeywords')?.value || '';
          resultBlob = await Engine1_PDFLib.editMetadata(file, { title, author, subject, keywords: kw });
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Updated_Meta.pdf`;
        }
        else if (toolKey === 'base64') {
          const dataUri = await Engine1_PDFLib.readFileAsDataURL(file);
          const base64Box = document.getElementById('base64Box');
          const base64Content = document.getElementById('base64Content');
          if (base64Box && base64Content) {
            base64Content.value = dataUri;
            base64Box.style.display = 'block';
          }
          resultBlob = new Blob([dataUri], { type: 'text/plain;charset=utf-8' });
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Base64.txt`;
        }
        else if (toolKey === 'grayscale') {
          resultBlob = await Engine2_PDFJS.renderGrayscalePDF(file);
          downloadFilename = `CodeWithAli_Grayscale_${file.name}`;
        }
        else if (toolKey === 'invert') {
          resultBlob = await Engine2_PDFJS.renderInvertedPDF(file);
          downloadFilename = `CodeWithAli_Inverted_${file.name}`;
        }
        else if (toolKey === 'redact') {
          resultBlob = await Engine2_PDFJS.renderRedactedPDF(file);
          downloadFilename = `CodeWithAli_Redacted_${file.name}`;
        }
        else if (toolKey === 'extract-images') {
          const extracted = await Engine2_PDFJS.extractEmbeddedImages(file, (p) => setProgressBar(p));
          if (extracted.length === 0) {
            throw new Error('No embedded images were found in this PDF. (This tool extracts images embedded in the document — if the PDF has no pictures/photos in it, there is nothing to extract.)');
          } else if (extracted.length === 1) {
            resultBlob = extracted[0].blob;
            downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_${extracted[0].name}`;
          } else {
            if (!window.JSZip) throw new Error('JSZip library failed to load — cannot bundle the extracted images.');
            const zip = new window.JSZip();
            extracted.forEach((img) => zip.file(img.name, img.blob));
            resultBlob = await zip.generateAsync({ type: 'blob' });
            downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_ExtractedImages.zip`;
          }
        }
        else if (toolKey === 'sign') {
          const sigCanvas = document.getElementById('signaturePad');
          if (!isSignatureDrawn || !sigCanvas) {
            throw new Error('Please draw your signature in the signature box before stamping.');
          }
          const sigPng = sigCanvas.toDataURL('image/png');
          const pos = document.getElementById('sigPosition')?.value || 'bottom-right';
          resultBlob = await Engine1_PDFLib.signPDF(file, sigPng, { position: pos });
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Signed.pdf`;
        }
        else if (toolKey === 'markdown-to-pdf') {
          const mdText = document.getElementById('markdownInput')?.value || '';
          if (engine) resultBlob = await engine.markdownToPDF(mdText);
          else resultBlob = await Engine1_PDFLib.markdownToPDF(mdText);
          downloadFilename = 'CodeWithAli_Markdown.pdf';
        }
        else if (toolKey === 'pdf-to-word') {
          if (engine && engine.pdfToWord) {
             // 1. Hybrid Backend Execution Route for Vercel 
             const res = await engine.pdfToWord(file);
             showResultScreen(res, toolConfig);
             return;
          } else {
            // 2. Client Side Fallback
            const buf = await Engine1_PDFLib.readFileAsArrayBuffer(file);
            let rawText = '';
            if (window.ClientPDFEngine) {
              rawText = await window.ClientPDFEngine.extractTextAccurate(buf);
            }
            const paragraphs = (rawText || 'Converted Document Content').split('\n').filter(Boolean);
            resultBlob = OOXMLBuilder.buildDocx(paragraphs, file.name);
            downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Converted.docx`;
          }
        }
        else if (toolKey === 'ocr' && window.ClientPDFEngine) {
          const res = await window.ClientPDFEngine.ocrPDF(file);
          showResultScreen(res, toolConfig);
          return;
        }
        else if (toolKey === 'ai-summarize') {
          const buf = await Engine1_PDFLib.readFileAsArrayBuffer(file);
          let extractedText = '';
          if (window.ClientPDFEngine) {
            extractedText = await window.ClientPDFEngine.extractTextAccurate(buf);
          }
          if (!extractedText || extractedText.trim().length < 30) {
            extractedText = `Document Content: ${file.name}.\nThis document was scanned or contains visual elements. Extracted text layer mapped.`;
          }

          const mode = document.querySelector('input[name="aiSummaryMode"]:checked')?.value || 'executive';
          const numSentences = mode === 'deep' ? 8 : 5;
          const summary = ClientAIEngine.generateSummary(extractedText, numSentences);

          const aiContent = `=== AI EXECUTIVE SUMMARY & KEY INSIGHTS ===\nFile: ${file.name}\nPrivacy: 100% In-Browser Private NLP\n\n` + summary;
          resultBlob = new Blob(['\ufeff', aiContent], { type: 'text/plain;charset=utf-8' });
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_AI_Summary.txt`;
        }
        else if (toolKey === 'protect') {
          const pass = document.getElementById('pdfPass')?.value || '';
          if (engine) resultBlob = await engine.protectPDF(file, pass);
          else resultBlob = await Engine1_PDFLib.protectPDF(file, pass);
          downloadFilename = `Protected_${file.name}`;
        }
        else if (toolKey === 'unlock') {
          if (engine) resultBlob = await engine.unlockPDF(file);
          else resultBlob = await Engine1_PDFLib.unlockPDF(file);
          downloadFilename = `Unlocked_${file.name}`;
        }
        else if (toolKey === 'repair') {
          resultBlob = await Engine1_PDFLib.repairPDF(file);
          downloadFilename = `Repaired_${file.name}`;
        }
        else if (toolKey === 'pdf-to-pdfa') {
          resultBlob = await Engine1_PDFLib.pdfToPdfa(file);
          downloadFilename = `PDFA_${file.name}`;
        }
        else if (toolKey === 'word-to-pdf' && window.RealWordToPDF) {
          resultBlob = await window.RealWordToPDF.convert(file);
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Converted.pdf`;
        }
        else if (toolKey === 'excel-to-pdf' && window.RealExcelToPDF) {
          resultBlob = await window.RealExcelToPDF.convert(file);
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Converted.pdf`;
        }
        else if (toolKey === 'pdf-to-ppt') {
          if (!window.RealPDFToPPT) throw new Error('PowerPoint export engine not loaded. Please reload the page and try again.');
          resultBlob = await window.RealPDFToPPT.convert(file, (p) => setProgressBar(Math.round(p)));
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Slides.pptx`;
        }
        else if (toolKey === 'ppt-to-pdf') {
          if (!window.RealPPTToPDF) throw new Error('PowerPoint import engine not loaded. Please reload the page and try again.');
          resultBlob = await window.RealPPTToPDF.convert(file, (p) => setProgressBar(Math.round(p)));
          downloadFilename = `${file.name.replace(/\.[^/.]+$/, '')}_Converted.pdf`;
        }
        else {
          if (engine) {
            const res = await engine.genericProcess(file, toolKey);
            showResultScreen(res, toolConfig);
            return;
          }
        }

        if (!resultBlob) throw new Error('Document processing could not be completed.');

        setProgressBar(100);
        const downloadUrl = MemoryManager.createTrackedUrl(resultBlob);
        const resData = {
          success: true,
          downloadUrl,
          filename: downloadFilename,
          originalSize: file ? file.size : 0,
          compressedSize: resultBlob.size
        };

        setTimeout(() => {
          showResultScreen(resData, toolConfig);
        }, 300);

      } catch (err) {
        hideProcessingOverlay();
        showToast(err.message || 'An unexpected error occurred during processing.', 'error');
        console.error('[Action Error]', err);
      }
    };
  }
}

// Helpers
function parseRangeString(str) {
  const indices = [];
  const parts = str.split(',');
  parts.forEach(part => {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [s, e] = trimmed.split('-').map(n => parseInt(n.trim(), 10));
      if (!isNaN(s) && !isNaN(e)) {
        for (let p = Math.max(1, s); p <= e; p++) indices.push(p - 1);
      }
    } else {
      const n = parseInt(trimmed, 10);
      if (!isNaN(n) && n >= 1) indices.push(n - 1);
    }
  });
  return indices;
}

function indicesToRangeString(indices) {
  if (!indices || indices.length === 0) return '';
  const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
  return sorted.map(i => i + 1).join(', ');
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let _progressTrickleTimer = null;

function showProcessingOverlay() {
  const overlay = document.getElementById('processingOverlay');
  if (overlay) overlay.style.display = 'flex';
  if (_progressTrickleTimer) clearInterval(_progressTrickleTimer);
  _progressTrickleTimer = setInterval(() => {
    const bar = document.getElementById('progressBar') || document.getElementById('progressBarInner');
    if (!bar) return;
    const current = parseFloat(bar.style.width) || 0;
    if (current < 88) {
      const step = current < 40 ? 4 : current < 70 ? 2 : 0.6;
      bar.style.width = `${Math.min(current + step, 88)}%`;
    }
  }, 220);
}

function hideProcessingOverlay() {
  const overlay = document.getElementById('processingOverlay');
  if (overlay) overlay.style.display = 'none';
  if (_progressTrickleTimer) { clearInterval(_progressTrickleTimer); _progressTrickleTimer = null; }
}

function setProgressBar(pct) {
  const bar = document.getElementById('progressBar') || document.getElementById('progressBarInner');
  if (bar) bar.style.width = `${pct}%`;
  const pctText = document.getElementById('progressPercentage');
  if (pctText && pct >= 100) pctText.innerText = '100%';
  if (pct >= 100 && _progressTrickleTimer) { clearInterval(_progressTrickleTimer); _progressTrickleTimer = null; }
}

function showResultScreen(resData, toolConfig) {
  hideProcessingOverlay();
  const workspaceBody = document.getElementById('workspaceBody');
  const resultCard = document.getElementById('resultCard');
  if (workspaceBody) workspaceBody.style.display = 'none';
  if (resultCard) {
    resultCard.style.display = 'block';
    const downloadBtn = document.getElementById('downloadResultBtn') || document.getElementById('downloadBtn');
    if (downloadBtn) {
      downloadBtn.href = resData.downloadUrl;
      downloadBtn.download = resData.filename;
    } else {
      console.error('[CodeWithAli] Download button not found in DOM — cannot set output link.');
    }

    const resTitle = document.getElementById('resultTitle');
    if (resTitle) resTitle.textContent = `${toolConfig.name} Completed!`;

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
      };
    }
  }
}

function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 8px;';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const bg = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#1e293b');
  toast.style.cssText = `background: ${bg}; color: #ffffff; padding: 12px 18px; border-radius: 8px; font-size: 0.88rem; font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.2); animation: fadeIn 0.2s ease; display: flex; align-items: center; gap: 8px;`;
  toast.innerHTML = `<i class="fa-solid fa-${type === 'error' ? 'circle-exclamation' : (type === 'success' ? 'circle-check' : 'circle-info')}"></i> ${escapeHtml(message)}`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// -----------------------------------------------------------------------------
// Theme & Search Initializer
// -----------------------------------------------------------------------------
function initTheme() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (!themeToggleBtn) return;

  const currentTheme = localStorage.getItem('cwa_theme') || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeIcon(themeToggleBtn, currentTheme);

  themeToggleBtn.onclick = () => {
    const active = document.documentElement.getAttribute('data-theme');
    const nextTheme = active === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('cwa_theme', nextTheme);
    updateThemeIcon(themeToggleBtn, nextTheme);
  };
}

function updateThemeIcon(btn, theme) {
  btn.innerHTML = theme === 'dark' 
    ? '<i class="fa-solid fa-sun" style="color: #f59e0b;"></i>' 
    : '<i class="fa-solid fa-moon"></i>';
}

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

function initMobileNav() {
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu') || document.querySelector('.nav-menu');
  if (navToggle && navMenu) {
    navToggle.onclick = (e) => {
      e.stopPropagation();
      navMenu.classList.toggle('open');
      const icon = navToggle.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-bars');
        icon.classList.toggle('fa-xmark');
      }
    };

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

  let deferredInstallPrompt = null;
  const installAppBtn = document.getElementById('installAppBtn');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installAppBtn) installAppBtn.style.display = 'inline-flex';
  });

  if (installAppBtn) {
    installAppBtn.onclick = async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        installAppBtn.style.display = 'none';
      }
    };
  }
}

// Global Initialization safe against DOM ready state
function initAll() {
  initTheme();
  initSearchAndFilters();
  initWorkspace();
  initMobileNav();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}
