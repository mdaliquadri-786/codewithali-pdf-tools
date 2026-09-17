/**
 * CodeWithAli PDF Tools Suite - REAL Excel (.xlsx/.xls/.csv) to PDF Converter
 * Uses SheetJS (lazy-loaded) to genuinely parse binary .xlsx/.xls workbooks
 * (multiple sheets, real cell values), then lays each sheet out as a paginated
 * table in a real PDF via pdf-lib. Plain .csv still works too.
 *
 * Drop this file in public/js/excel-to-pdf.js and load it BEFORE script.js:
 *   <script src="js/excel-to-pdf.js"></script>
 */

window.RealExcelToPDF = {
  _xlsxLoading: null,

  async ensureSheetJS() {
    if (window.XLSX) return window.XLSX;
    if (this._xlsxLoading) return this._xlsxLoading;

    this._xlsxLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => reject(new Error('Could not load the spreadsheet parser (SheetJS). Check your internet connection and try again.'));
      document.head.appendChild(s);
    });

    return this._xlsxLoading;
  },

  parseCsvText(text) {
    // Minimal RFC4180-aware CSV split (handles quoted commas/newlines).
    const rows = [];
    let row = [], field = '', inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else { field += c; }
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c === '\r') { /* skip */ }
        else { field += c; }
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => c && c.trim().length));
  },

  async parseWorkbook(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv') {
      const text = await file.text();
      return { sheets: [{ name: file.name.replace(/\.[^/.]+$/, '') || 'Sheet1', rows: this.parseCsvText(text) }] };
    }

    await this.ensureSheetJS();
    const buffer = await file.arrayBuffer();
    const wb = window.XLSX.read(buffer, { type: 'array' });

    const sheets = wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
        .map(row => row.map(cell => (cell === null || cell === undefined) ? '' : String(cell)));
      return { name, rows: rows.filter(r => r.some(c => c && c.trim().length)) };
    }).filter(s => s.rows.length > 0);

    if (sheets.length === 0) throw new Error('No data rows were found in this spreadsheet.');
    return { sheets };
  },

  /**
   * @param {File} file - a .xlsx, .xls, or .csv file
   * @returns {Promise<Blob>} application/pdf blob
   */
  async convert(file) {
    if (!window.PDFLib) throw new Error('pdf-lib is not loaded yet — please retry in a moment.');

    const { sheets } = await this.parseWorkbook(file);
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;

    const doc = await PDFDocument.create();
    const regular = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const pageW = 841.89, pageH = 595.28; // landscape A4 — friendlier for wide tables
    const margin = 30;
    const rowH = 18;
    const fontSize = 8;
    const maxColsBeforeShrink = 10;

    sheets.forEach((sheet) => {
      const colCount = Math.max(1, ...sheet.rows.map(r => r.length));
      const usableW = pageW - margin * 2;
      const colW = Math.max(45, usableW / Math.max(colCount, maxColsBeforeShrink >= colCount ? colCount : maxColsBeforeShrink));
      const cellCharLimit = Math.max(6, Math.floor(colW / 4.6));

      let page = doc.addPage([pageW, pageH]);
      let y = pageH - margin;

      page.drawText(sheet.name, { x: margin, y, size: 13, font: bold, color: rgb(0.9, 0.19, 0.18) });
      y -= 12;
      page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 1, color: rgb(0.9, 0.19, 0.18) });
      y -= 18;

      sheet.rows.forEach((row, rIdx) => {
        if (y - rowH < margin) {
          page = doc.addPage([pageW, pageH]);
          y = pageH - margin;
        }

        let x = margin;
        const isHeader = rIdx === 0;

        for (let cIdx = 0; cIdx < colCount; cIdx++) {
          const raw = row[cIdx] !== undefined ? String(row[cIdx]) : '';
          const cell = raw.length > cellCharLimit ? raw.slice(0, cellCharLimit - 1) + '…' : raw;

          page.drawRectangle({
            x, y: y - rowH, width: colW, height: rowH,
            borderColor: rgb(0.82, 0.85, 0.89), borderWidth: 0.5,
            color: isHeader ? rgb(0.95, 0.96, 0.98) : rgb(1, 1, 1)
          });
          page.drawText(cell, {
            x: x + 4, y: y - rowH + 5, size: fontSize,
            font: isHeader ? bold : regular,
            color: rgb(0.1, 0.1, 0.1)
          });
          x += colW;
        }
        y -= rowH;
      });
    });

    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  }
};
