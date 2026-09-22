(function () {
    'use strict';

    /*
     * This file contains deployment-safe frontend fixes.
     *
     * Important fix:
     * ClientPDFEngine methods return a result object containing an existing
     * downloadUrl. The main script previously passed that object directly to
     * URL.createObjectURL(), which caused:
     *
     * TypeError: Failed to execute 'createObjectURL' on 'URL':
     * Overload resolution failed.
     */

    function getToolKey() {
        const queryTool = new URLSearchParams(
            window.location.search
        ).get('tool');

        if (queryTool) {
            return queryTool.toLowerCase().trim();
        }

        const match = window.location.pathname.match(
            /\/tools\/([a-z0-9-]+)/i
        );

        return match ? match[1].toLowerCase() : null;
    }

    function getFileBaseName(fileName) {
        return String(fileName || 'document')
            .replace(/\.[^/.]+$/, '');
    }

    function normalizeOutput(output, fallbackType) {
        if (!output) {
            throw new TypeError(
                'PDF processing returned no output.'
            );
        }

        /*
         * Some engines already return:
         *
         * {
         *   success: true,
         *   downloadUrl: 'blob:...',
         *   filename: '...'
         * }
         *
         * Keep that existing URL instead of passing the object to
         * URL.createObjectURL().
         */
        if (
            typeof output === 'object' &&
            typeof output.downloadUrl === 'string' &&
            output.downloadUrl.length > 0
        ) {
            return {
                downloadUrl: output.downloadUrl,
                filename: output.filename || 'processed-file',
                result: output
            };
        }

        if (output instanceof Blob) {
            return {
                downloadUrl: URL.createObjectURL(output),
                filename: 'processed-file',
                result: output
            };
        }

        if (output instanceof ArrayBuffer) {
            const blob = new Blob([output], {
                type: fallbackType
            });

            return {
                downloadUrl: URL.createObjectURL(blob),
                filename: 'processed-file',
                result: blob
            };
        }

        if (ArrayBuffer.isView(output)) {
            const blob = new Blob([output], {
                type: fallbackType
            });

            return {
                downloadUrl: URL.createObjectURL(blob),
                filename: 'processed-file',
                result: blob
            };
        }

        throw new TypeError(
            'The PDF engine returned an unsupported output type.'
        );
    }

    function patchMemoryManager() {
        if (
            typeof MemoryManager === 'undefined' ||
            !MemoryManager ||
            typeof MemoryManager.createTrackedUrl !== 'function'
        ) {
            return;
        }

        const originalCreateTrackedUrl =
            MemoryManager.createTrackedUrl.bind(MemoryManager);

        MemoryManager.createTrackedUrl = function (output) {
            /*
             * If the engine already created a download URL, reuse it.
             * Do not call URL.createObjectURL() on the result object.
             */
            if (
                output &&
                typeof output.downloadUrl === 'string' &&
                output.downloadUrl.length > 0
            ) {
                return output.downloadUrl;
            }

            if (output instanceof Blob) {
                return originalCreateTrackedUrl(output);
            }

            if (output instanceof ArrayBuffer) {
                return originalCreateTrackedUrl(
                    new Blob([output], {
                        type: 'application/pdf'
                    })
                );
            }

            if (ArrayBuffer.isView(output)) {
                return originalCreateTrackedUrl(
                    new Blob([output], {
                        type: 'application/pdf'
                    })
                );
            }

            throw new TypeError(
                'Invalid output supplied for download URL generation.'
            );
        };
    }

    function ensureDownloadButtonId() {
        const oldButton = document.getElementById('downloadBtn');
        const newButton = document.getElementById('downloadResultBtn');

        if (oldButton && !newButton) {
            oldButton.id = 'downloadResultBtn';
        }
    }

    function injectLayoutFixes() {
        if (document.getElementById('codewithali-layout-fixes')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'codewithali-layout-fixes';

        style.textContent = `
            .files-container {
                display: grid !important;
                grid-template-columns:
                    repeat(auto-fill, minmax(220px, 1fr)) !important;
                gap: 12px !important;
                width: 100% !important;
            }

            .file-card {
                min-width: 0 !important;
                max-width: 100% !important;
                overflow: hidden !important;
            }

            .file-card-info {
                min-width: 0 !important;
                overflow: hidden !important;
            }

            .file-card-info strong {
                display: block !important;
                width: 100% !important;
                overflow: hidden !important;
                white-space: nowrap !important;
                text-overflow: ellipsis !important;
            }
        `;

        document.head.appendChild(style);
    }

    function patchResultScreen() {
        if (typeof showResultScreen !== 'function') {
            return;
        }

        /*
         * The original function is retained. This wrapper only guarantees that
         * the download URL is valid before the result card is displayed.
         */
        const originalShowResultScreen =
            window.__codeWithAliOriginalShowResultScreen ||
            showResultScreen;

        if (window.__codeWithAliResultScreenPatched) {
            return;
        }

        window.__codeWithAliOriginalShowResultScreen =
            originalShowResultScreen;

        window.__codeWithAliResultScreenPatched = true;

        window.showResultScreen = function (result, toolConfig) {
            if (
                result &&
                typeof result.downloadUrl === 'string' &&
                result.downloadUrl.length > 0
            ) {
                originalShowResultScreen(result, toolConfig);
                return;
            }

            const normalized = normalizeOutput(
                result,
                'application/pdf'
            );

            originalShowResultScreen(
                {
                    success: true,
                    downloadUrl: normalized.downloadUrl,
                    filename: normalized.filename
                },
                toolConfig
            );
        };
    }

    function installActionFallback() {
        const actionButton = document.getElementById(
            'actionSubmitBtn'
        );

        if (!actionButton || actionButton.dataset.safePatchInstalled) {
            return;
        }

        actionButton.dataset.safePatchInstalled = 'true';

        /*
         * This fallback is used only if the original application handler
         * fails to produce a result. It supports the five CI-tested tools.
         */
        const originalHandler = actionButton.onclick;

        actionButton.onclick = async function (event) {
            try {
                if (typeof originalHandler === 'function') {
                    await originalHandler.call(this, event);
                    return;
                }
            } catch (error) {
                console.error(
                    '[CodeWithAli] Original action handler failed:',
                    error
                );
            }

            const tool = getToolKey();
            const input = document.querySelector(
                'input[type="file"]'
            );

            if (!input || !input.files || input.files.length === 0) {
                return;
            }

            const files = Array.from(input.files);
            const file = files[0];
            const engine = window.ClientPDFEngine;

            if (!engine) {
                return;
            }

            try {
                let output;
                let filename;

                if (tool === 'merge') {
                    if (files.length < 2) {
                        throw new Error(
                            'Please select at least two PDF files to merge.'
                        );
                    }

                    output = await engine.mergePDFs(files);
                    filename = 'CodeWithAli_Merged.pdf';
                } else if (tool === 'split') {
                    output = await engine.splitPDF(
                        file,
                        'range',
                        '1'
                    );

                    filename =
                        `${getFileBaseName(file.name)}_Split.pdf`;
                } else if (tool === 'compress') {
                    output = await engine.compressPDF(
                        file,
                        'balanced'
                    );

                    filename =
                        `CodeWithAli_Compressed_${file.name}`;
                } else if (tool === 'rotate') {
                    output = await engine.rotatePDF(file, 90);

                    filename =
                        `CodeWithAli_Rotated_${file.name}`;
                } else if (tool === 'pdf-to-word') {
                    output = await engine.pdfToWord(file);

                    filename =
                        `${getFileBaseName(file.name)}_Converted.docx`;
                } else {
                    return;
                }

                const normalized = normalizeOutput(
                    output,
                    tool === 'pdf-to-word'
                        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                        : 'application/pdf'
                );

                const resultCard = document.getElementById(
                    'resultCard'
                );

                const workspaceBody = document.getElementById(
                    'workspaceBody'
                );

                const processingOverlay = document.getElementById(
                    'processingOverlay'
                );

                const downloadButton =
                    document.getElementById('downloadResultBtn') ||
                    document.getElementById('downloadBtn');

                if (processingOverlay) {
                    processingOverlay.style.display = 'none';
                }

                if (workspaceBody) {
                    workspaceBody.style.display = 'none';
                }

                if (resultCard) {
                    resultCard.style.display = 'block';
                }

                if (downloadButton) {
                    downloadButton.href = normalized.downloadUrl;
                    downloadButton.download =
                        filename || normalized.filename;
                }
            } catch (error) {
                const overlay = document.getElementById(
                    'processingOverlay'
                );

                if (overlay) {
                    overlay.style.display = 'none';
                }

                console.error(
                    '[CodeWithAli] Safe processing fallback failed:',
                    error
                );

                if (typeof showToast === 'function') {
                    showToast(
                        error.message ||
                            'PDF processing failed.',
                        'error'
                    );
                }
            }
        };
    }

    function installFixes() {
        patchMemoryManager();
        ensureDownloadButtonId();
        injectLayoutFixes();
        patchResultScreen();
        installActionFallback();
    }

    /*
     * MemoryManager is created while script.js is evaluated. Wait until the
     * document is ready, then install the fixes.
     */
    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            installFixes,
            { once: true }
        );
    } else {
        installFixes();
    }

    /*
     * A short delayed pass is necessary because script.js initializes some
     * controls asynchronously.
     */
    setTimeout(installFixes, 250);
    setTimeout(installFixes, 1000);
})();
