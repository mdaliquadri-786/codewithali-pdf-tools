importScripts('https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.min.js');

self.onmessage = async function(e) {
    const { action, fileBuffers, args } = e.data;

    try {
        const { PDFDocument, rgb, degrees, StandardFonts } = self.PDFLib;
        let resultBytes;

        if (action === 'merge') {
            const mergedPdf = await PDFDocument.create();
            for (let buffer of fileBuffers) {
                const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }
            resultBytes = await mergedPdf.save();
        } 
        else if (action === 'split') {
            const srcDoc = await PDFDocument.load(fileBuffers[0], { ignoreEncryption: true });
            const totalPages = srcDoc.getPageCount();
            let indices = [];
            const { mode, rangeStr } = args;

            if (mode === 'range' && rangeStr && rangeStr.trim()) {
                const parts = rangeStr.split(',');
                parts.forEach(part => {
                    const trimmed = part.trim();
                    if (trimmed.includes('-')) {
                        const [start, end] = trimmed.split('-').map(n => parseInt(n.trim(), 10));
                        if (!isNaN(start) && !isNaN(end)) {
                            for (let i = Math.max(1, start); i <= Math.min(totalPages, end); i++) indices.push(i - 1);
                        }
                    } else {
                        const n = parseInt(trimmed, 10);
                        if (!isNaN(n) && n >= 1 && n <= totalPages) indices.push(n - 1);
                    }
                });
                indices = Array.from(new Set(indices));
            }
            if (indices.length === 0) indices = [0];

            const newDoc = await PDFDocument.create();
            const copiedPages = await newDoc.copyPages(srcDoc, indices);
            copiedPages.forEach(p => newDoc.addPage(p));
            resultBytes = await newDoc.save();
        }
        else if (action === 'compress' || action === 'generic') {
            const doc = await PDFDocument.load(fileBuffers[0], { ignoreEncryption: true });
            resultBytes = await doc.save({ useObjectStreams: true });
        }
        else if (action === 'rotate') {
            const doc = await PDFDocument.load(fileBuffers[0], { ignoreEncryption: true });
            const angle = parseInt(args.angleDeg, 10) || 90;
            doc.getPages().forEach(p => {
                const current = p.getRotation().angle;
                p.setRotation(degrees((current + angle) % 360));
            });
            resultBytes = await doc.save();
        }
        else if (action === 'watermark') {
            const doc = await PDFDocument.load(fileBuffers[0], { ignoreEncryption: true });
            const font = await doc.embedFont(StandardFonts.HelveticaBold);
            const { text, options } = args;
            const opacity = parseFloat(options.opacity) || 0.3;
            const fontSize = parseInt(options.fontSize, 10) || 44;
            
            doc.getPages().forEach(page => {
                const { width, height } = page.getSize();
                const textWidth = font.widthOfTextAtSize(text, fontSize);
                const textHeight = font.heightAtSize(fontSize);
                const x = (width - textWidth) / 2;
                const y = (height - textHeight) / 2;

                if (options.position === 'diagonal' || !options.position) {
                    page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.85, 0.15, 0.15), opacity, rotate: degrees(45) });
                } else {
                    page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.85, 0.15, 0.15), opacity });
                }
            });
            resultBytes = await doc.save();
        }
        else if (action === 'pageNumbers') {
            const doc = await PDFDocument.load(fileBuffers[0], { ignoreEncryption: true });
            const font = await doc.embedFont(StandardFonts.Helvetica);
            const pages = doc.getPages();
            const total = pages.length;
            
            pages.forEach((page, idx) => {
                const { width } = page.getSize();
                const text = `Page ${idx + 1} of ${total}`;
                const fontSize = 10;
                const textWidth = font.widthOfTextAtSize(text, fontSize);
                page.drawText(text, { x: (width - textWidth) / 2, y: 20, size: fontSize, font, color: rgb(0.3, 0.3, 0.3) });
            });
            resultBytes = await doc.save();
        }
        else if (action === 'protect') {
            const doc = await PDFDocument.load(fileBuffers[0], { ignoreEncryption: true });
            doc.setTitle(`Protected Document`);
            doc.setCreator('CodeWithAli PDF Security Suite');
            doc.setProducer('CodeWithAli Security Engine');
            resultBytes = await doc.save();
        }
        else if (action === 'unlock') {
            const doc = await PDFDocument.load(fileBuffers[0], { ignoreEncryption: true });
            resultBytes = await doc.save();
        }
        else if (action === 'imageToPDF') {
            const pdfDoc = await PDFDocument.create();
            for (let i = 0; i < fileBuffers.length; i++) {
                let image;
                if (args.types[i] === 'image/png') {
                    image = await pdfDoc.embedPng(fileBuffers[i]);
                } else {
                    image = await pdfDoc.embedJpg(fileBuffers[i]);
                }
                const page = pdfDoc.addPage([image.width, image.height]);
                page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
            }
            resultBytes = await pdfDoc.save();
        }

        self.postMessage(
            { success: true, result: resultBytes },
            [resultBytes.buffer] 
        );
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};
