/**
 * CodeWithAli PDF Tools Suite - REAL Word (.docx) to PDF Converter
 * Uses Mammoth.js (lazy-loaded) to genuinely parse the binary .docx OOXML
 * package, then paginates the extracted structure into a real multi-page PDF
 * with pdf-lib. Plain .txt/.md still works too (falls back to simple text flow).
 *
 * Drop this file in public/js/word-to-pdf.js and load it BEFORE script.js:
 *   <script src="js/word-to-pdf.js"></script>
 *
 * Known scope limit (being upfront, not hiding it): this renders paragraphs,
 * headings and lists with correct pagination; it does not yet reproduce
 * embedded images/tables from the .docx. That's a reasonable next add using
 * mammoth's convertImage() hook — flag it if you want that pass done next.
 */

window.RealWordToPDF = {
  _mammothLoading: null,

  async ensureMammoth() {
    if (window.mammoth) return window.mammoth;
    if (this._mammothLoading) return this._mammothLoading;

    this._mammothLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      s.onload = () => resolve(window.mammoth);
      s.onerror = () => reject(new Error('Could not load the .docx parser (Mammoth.js). Check your internet connection and try again.'));
      document.head.appendChild(s);
    });

    return this._mammothLoading;
  },

  htmlToBlocks(htmlString) {
    const container = document.createElement('div');
    container.innerHTML = htmlString;
    const blocks = [];

    const pushListItems = (listEl) => {
      listEl.querySelectorAll(':scope > li').forEach((li) => {
        const t = li.textContent.replace(/\s+/g, ' ').trim();
        if (t) blocks.push({ type: 'li', text: t });
      });
    };

    container.childNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      const text = node.textContent.replace(/\s+/g, ' ').trim();

      if (tag === 'h1') { if (text) blocks.push({ type: 'h1', text }); }
      else if (tag === 'h2') { if (text) blocks.push({ type: 'h2', text }); }
      else if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') { if (text) blocks.push({ type: 'h3', text }); }
      else if (tag === 'ul' || tag === 'ol') { pushListItems(node); }
      else if (tag === 'blockquote') { if (text) blocks.push({ type: 'quote', text }); }
      else if (tag === 'table') {
        node.querySelectorAll('tr').forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll('td,th')).map(c => c.textContent.trim());
          if (cells.length) blocks.push({ type: 'p', text: cells.join('   |   ') });
        });
      }
      else if (text) blocks.push({ type: 'p', text });
    });

    return blocks;
  },

  wrapText(font, text, size, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';

    words.forEach((w) => {
      const trial = current ? current + ' ' + w : w;
      if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = trial;
      }
    });
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  },

  /**
   * @param {File} file - a .docx, .doc, .txt or .md file
   * @returns {Promise<Blob>} application/pdf blob
   */
  async convert(file) {
    if (!window.PDFLib) throw new Error('pdf-lib is not loaded yet — please retry in a moment.');

    const ext = file.name.split('.').pop().toLowerCase();
    let blocks;

    if (ext === 'docx') {
      await this.ensureMammoth();
      const buffer = await file.arrayBuffer();
      const { value: html, messages } = await window.mammoth.convertToHtml({ arrayBuffer: buffer });
      blocks = this.htmlToBlocks(html);
      if (blocks.length === 0) {
        throw new Error('No readable text was found in this .docx file.');
      }
    } else if (ext === 'doc') {
      // Legacy binary .doc (pre-2007) is not OOXML and mammoth cannot parse it
      // client-side. Ask for .docx, or fall through as plain text as a last resort.
      throw new Error('Legacy binary .doc files aren\'t supported client-side — please re-save the file as .docx (Word: File > Save As > Word Document (.docx)) and try again.');
    } else {
      const text = await file.text();
      blocks = text.split(/\r?\n/).map(line => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('# ')) return { type: 'h1', text: trimmed.slice(2) };
        if (trimmed.startsWith('## ')) return { type: 'h2', text: trimmed.slice(3) };
        if (trimmed.startsWith('### ')) return { type: 'h3', text: trimmed.slice(4) };
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return { type: 'li', text: trimmed.slice(2) };
        return { type: 'p', text: trimmed };
      }).filter(Boolean);
    }

    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

    const pageW = 595.28, pageH = 841.89; // A4
    const margin = 56;
    const maxWidth = pageW - margin * 2;

    let page = doc.addPage([pageW, pageH]);
    let y = pageH - margin;

    const ensureSpace = (needed) => {
      if (y - needed < margin) {
        page = doc.addPage([pageW, pageH]);
        y = pageH - margin;
      }
    };

    blocks.forEach((b) => {
      let font = regular, size = 11, lineGap = 15, indent = 0, color = rgb(0.09, 0.1, 0.13), spaceAfter = 4;

      if (b.type === 'h1') { font = bold; size = 18; lineGap = 24; color = rgb(0.9, 0.19, 0.18); spaceAfter = 10; }
      else if (b.type === 'h2') { font = bold; size = 14; lineGap = 20; spaceAfter = 8; }
      else if (b.type === 'h3') { font = bold; size = 12.5; lineGap = 18; spaceAfter = 6; }
      else if (b.type === 'li') { indent = 16; }
      else if (b.type === 'quote') { font = italic; color = rgb(0.35, 0.38, 0.44); indent = 12; }

      const prefixed = b.type === 'li' ? ('•  ' + b.text) : b.text;
      const lines = this.wrapText(font, prefixed, size, maxWidth - indent);

      lines.forEach((line) => {
        ensureSpace(lineGap);
        page.drawText(line, { x: margin + indent, y, size, font, color });
        y -= lineGap;
      });
      y -= spaceAfter;
    });

    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  }
};
