const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

test.describe('CodeWithAli PDF Tools - Live Vercel Tests', () => {
    test.describe.configure({ timeout: 120000 });

    const dummyPdfPath = path.join(__dirname, 'dummy.pdf');

    test.beforeAll(async () => {
        const pdfDoc = await PDFDocument.create();

        pdfDoc.addPage([612, 792]);
        pdfDoc.addPage([612, 792]);

        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(dummyPdfPath, pdfBytes);
    });

    const tools = [
        'merge',
        'split',
        'compress',
        'rotate',
        'pdf-to-word'
    ];

    for (const tool of tools) {
        test(`Testing Tool: ${tool.toUpperCase()}`, async ({ page }) => {
            const consoleErrors = [];

            page.on('console', (message) => {
                if (message.type() === 'error') {
                    consoleErrors.push(
                        `[Browser Console Error] ${message.text()}`
                    );
                }
            });

            page.on('pageerror', (error) => {
                consoleErrors.push(
                    `[Page Exception] ${error.message}`
                );
            });

            page.on('response', async (response) => {
                if (response.status() >= 400) {
                    let body = '';

                    try {
                        body = await response.text();
                    } catch {
                        body = '<response body unavailable>';
                    }

                    consoleErrors.push(
                        `[HTTP ${response.status()}] ${response.url()}\n${body}`
                    );
                }
            });

            await page.goto(
                `https://codewithali-pdf-tools.vercel.app/tools/${tool}`,
                {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                }
            );

            await expect(
                page.locator('#workspaceTitle')
            ).toBeVisible({
                timeout: 15000
            });

            const fileInput = page.locator('input[type="file"]');

            await expect(fileInput).toBeAttached({
                timeout: 10000
            });

            await fileInput.setInputFiles(dummyPdfPath);

            await expect(
                page.locator('.file-card')
            ).toBeVisible({
                timeout: 10000
            });

            if (tool === 'pdf-to-word') {
                const imageRadio = page.locator(
                    'input[name="wordMode"][value="image"]'
                );

                if (await imageRadio.isVisible()) {
                    await imageRadio.check();
                }
            }

            const submitButton = page.locator('#actionSubmitBtn');

            await expect(submitButton).toBeEnabled({
                timeout: 10000
            });

            await submitButton.click();

            const resultCard = page.locator('#resultCard');
            const errorMessage = page.locator('.toast-error');

            /*
             * expect.poll() returns a Playwright assertion object.
             * Therefore, the matcher must be chained directly to it.
             */
            await expect
                .poll(
                    async () => {
                        if (await resultCard.isVisible()) {
                            return 'success';
                        }

                        if (await errorMessage.isVisible()) {
                            const errorText = (
                                await errorMessage.innerText()
                            ).trim();

                            return `error: ${errorText}`;
                        }

                        return 'pending';
                    },
                    {
                        timeout: 90000,
                        intervals: [1000, 2000, 5000],
                        message: () => [
                            `Tool: ${tool}`,
                            'Processing failed or timed out.',
                            ...consoleErrors
                        ].join('\n')
                    }
                )
                .toBe('success');

            /*
             * Wait for the download link and for its href to be populated.
             * .first() avoids ambiguity if both fallback IDs exist in the DOM.
             */
            const downloadLink = page
                .locator('#downloadResultBtn, #downloadBtn')
                .first();

            await expect(downloadLink).toBeVisible({
                timeout: 10000
            });

            await expect(downloadLink).toHaveAttribute(
                'href',
                /^(blob:|data:)/
            );
        });
    }
});
