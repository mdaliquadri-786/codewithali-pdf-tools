importScripts('https://cdn.jsdelivr.net/npm/pdf-lib/dist/pdf-lib.min.js');

self.onmessage = async function(e) {
    const { action, fileBuffers } = e.data;

    if (action === 'merge') {
        try {
            const PDFDocument = self.PDFLib.PDFDocument;
            const mergedPdf = await PDFDocument.create();

            for (let buffer of fileBuffers) {
                const pdf = await PDFDocument.load(buffer);
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }

            const pdfBytes = await mergedPdf.save();

            // Zero-copy transfer for maximum performance
            self.postMessage(
                { success: true, result: pdfBytes },
                [pdfBytes.buffer] 
            );
        } catch (error) {
            self.postMessage({ success: false, error: error.message });
        }
    }
};
