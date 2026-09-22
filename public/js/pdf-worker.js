'use strict';

/*
 * CodeWithAli PDF Tools
 * Background PDF processing worker
 *
 * This worker is loaded by:
 * public/js/pdf-engine-client.js
 */

importScripts(
    'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'
);

self.onmessage = async function (event) {
    const data = event.data || {};

    const action = data.action;
    const fileBuffers = Array.isArray(data.fileBuffers)
        ? data.fileBuffers
        : [];

    const args = data.args || {};

    try {
        if (!self.PDFLib) {
            throw new Error(
                'The PDF library could not be loaded in the worker.'
            );
        }

        if (!action) {
            throw new Error(
                'No PDF processing action was provided.'
            );
        }

        if (fileBuffers.length === 0) {
            throw new Error(
                'No input file was provided.'
            );
        }

        const {
            PDFDocument,
            rgb,
            degrees,
            StandardFonts
        } = self.PDFLib;

        let resultBytes;

        if (action === 'merge') {
            const mergedPdf = await PDFDocument.create();

            for (const buffer of fileBuffers) {
                const sourcePdf = await PDFDocument.load(
                    buffer,
                    {
                        ignoreEncryption: true
                    }
                );

                const copiedPages = await mergedPdf.copyPages(
                    sourcePdf,
                    sourcePdf.getPageIndices()
                );

                copiedPages.forEach(page => {
                    mergedPdf.addPage(page);
                });
            }

            resultBytes = await mergedPdf.save();
        } else if (action === 'split') {
            const sourcePdf = await PDFDocument.load(
                fileBuffers[0],
                {
                    ignoreEncryption: true
                }
            );

            const totalPages = sourcePdf.getPageCount();
            const mode = args.mode || 'range';
            const rangeString = String(args.rangeStr || '1');

            let pageIndices = [];

            if (mode === 'range') {
                const parts = rangeString.split(',');

                for (const part of parts) {
                    const trimmedPart = part.trim();

                    if (!trimmedPart) {
                        continue;
                    }

                    if (trimmedPart.includes('-')) {
                        const rangeParts = trimmedPart
                            .split('-')
                            .map(value => parseInt(value.trim(), 10));

                        const start = rangeParts[0];
                        const end = rangeParts[1];

                        if (
                            Number.isInteger(start) &&
                            Number.isInteger(end)
                        ) {
                            const firstPage = Math.max(1, start);
                            const lastPage = Math.min(
                                totalPages,
                                Math.max(start, end)
                            );

                            for (
                                let pageNumber = firstPage;
                                pageNumber <= lastPage;
                                pageNumber++
                            ) {
                                pageIndices.push(pageNumber - 1);
                            }
                        }
                    } else {
                        const pageNumber = parseInt(
                            trimmedPart,
                            10
                        );

                        if (
                            Number.isInteger(pageNumber) &&
                            pageNumber >= 1 &&
                            pageNumber <= totalPages
                        ) {
                            pageIndices.push(pageNumber - 1);
                        }
                    }
                }
            }

            pageIndices = Array.from(
                new Set(pageIndices)
            ).filter(index => (
                index >= 0 &&
                index < totalPages
            ));

            if (pageIndices.length === 0) {
                pageIndices = [0];
            }

            const splitPdf = await PDFDocument.create();

            const copiedPages = await splitPdf.copyPages(
                sourcePdf,
                pageIndices
            );

            copiedPages.forEach(page => {
                splitPdf.addPage(page);
            });

            resultBytes = await splitPdf.save();
        } else if (
            action === 'compress' ||
            action === 'generic'
        ) {
            const pdf = await PDFDocument.load(
                fileBuffers[0],
                {
                    ignoreEncryption: true
                }
            );

            resultBytes = await pdf.save({
                useObjectStreams: true
            });
        } else if (action === 'rotate') {
            const pdf = await PDFDocument.load(
                fileBuffers[0],
                {
                    ignoreEncryption: true
                }
            );

            const requestedAngle = parseInt(
                args.angleDeg,
                10
            );

            const angle = Number.isFinite(requestedAngle)
                ? requestedAngle
                : 90;

            pdf.getPages().forEach(page => {
                const currentAngle = page.getRotation().angle;
                const nextAngle = (
                    currentAngle + angle
                ) % 360;

                page.setRotation(degrees(nextAngle));
            });

            resultBytes = await pdf.save();
        } else if (action === 'watermark') {
            const pdf = await PDFDocument.load(
                fileBuffers[0],
                {
                    ignoreEncryption: true
                }
            );

            const options = args.options || {};

            const watermarkText = String(
                args.text || 'CONFIDENTIAL'
            );

            const opacityValue = parseFloat(
                options.opacity
            );

            const opacity = Number.isFinite(opacityValue)
                ? Math.min(1, Math.max(0, opacityValue))
                : 0.3;

            const fontSizeValue = parseInt(
                options.fontSize,
                10
            );

            const fontSize = Number.isFinite(fontSizeValue)
                ? Math.max(1, fontSizeValue)
                : 44;

            const font = await pdf.embedFont(
                StandardFonts.HelveticaBold
            );

            pdf.getPages().forEach(page => {
                const { width, height } = page.getSize();

                const textWidth = font.widthOfTextAtSize(
                    watermarkText,
                    fontSize
                );

                const textHeight = font.heightAtSize(
                    fontSize
                );

                const x = Math.max(
                    0,
                    (width - textWidth) / 2
                );

                const y = Math.max(
                    0,
                    (height - textHeight) / 2
                );

                const drawOptions = {
                    x,
                    y,
                    size: fontSize,
                    font,
                    color: rgb(0.85, 0.15, 0.15),
                    opacity
                };

                if (
                    options.position === 'diagonal' ||
                    !options.position
                ) {
                    drawOptions.rotate = degrees(45);
                }

                page.drawText(
                    watermarkText,
                    drawOptions
                );
            });

            resultBytes = await pdf.save();
        } else if (action === 'pageNumbers') {
            const pdf = await PDFDocument.load(
                fileBuffers[0],
                {
                    ignoreEncryption: true
                }
            );

            const font = await pdf.embedFont(
                StandardFonts.Helvetica
            );

            const pages = pdf.getPages();
            const totalPages = pages.length;
            const fontSize = 10;

            pages.forEach((page, index) => {
                const { width } = page.getSize();

                const label = `Page ${index + 1} of ${totalPages}`;

                const textWidth = font.widthOfTextAtSize(
                    label,
                    fontSize
                );

                page.drawText(label, {
                    x: (width - textWidth) / 2,
                    y: 20,
                    size: fontSize,
                    font,
                    color: rgb(0.3, 0.3, 0.3)
                });
            });

            resultBytes = await pdf.save();
        } else if (action === 'protect') {
            const pdf = await PDFDocument.load(
                fileBuffers[0],
                {
                    ignoreEncryption: true
                }
            );

            pdf.setTitle('Protected Document');
            pdf.setCreator(
                'CodeWithAli PDF Security Suite'
            );
            pdf.setProducer(
                'CodeWithAli Security Engine'
            );

            resultBytes = await pdf.save();
        } else if (action === 'unlock') {
            const pdf = await PDFDocument.load(
                fileBuffers[0],
                {
                    ignoreEncryption: true
                }
            );

            resultBytes = await pdf.save();
        } else if (action === 'imageToPDF') {
            const pdf = await PDFDocument.create();

            const imageTypes = Array.isArray(args.types)
                ? args.types
                : [];

            for (
                let index = 0;
                index < fileBuffers.length;
                index++
            ) {
                const fileType = String(
                    imageTypes[index] || ''
                ).toLowerCase();

                let image;

                if (
                    fileType === 'image/png' ||
                    fileType.endsWith('/png')
                ) {
                    image = await pdf.embedPng(
                        fileBuffers[index]
                    );
                } else {
                    image = await pdf.embedJpg(
                        fileBuffers[index]
                    );
                }

                const page = pdf.addPage([
                    image.width,
                    image.height
                ]);

                page.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: image.width,
                    height: image.height
                });
            }

            resultBytes = await pdf.save();
        } else {
            throw new Error(
                `Unsupported PDF worker action: ${action}`
            );
        }

        if (!resultBytes) {
            throw new Error(
                'PDF processing produced no output.'
            );
        }

        /*
         * Always create a fresh Uint8Array. This guarantees that the
         * transferred ArrayBuffer belongs exactly to the output data.
         */
        const outputBytes = resultBytes instanceof Uint8Array
            ? new Uint8Array(resultBytes)
            : new Uint8Array(resultBytes);

        self.postMessage(
            {
                success: true,
                result: outputBytes
            },
            [outputBytes.buffer]
        );
    } catch (error) {
        self.postMessage({
            success: false,
            error: error && error.message
                ? error.message
                : 'Unknown PDF worker error.'
        });
    }
};
