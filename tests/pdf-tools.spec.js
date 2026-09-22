const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

test.describe('CodeWithAli PDF Tools - Live Vercel Tests', () => {
    // Fix: Increase global test suite timeout to 120 seconds to prevent early cancellation
    test.describe.configure({ timeout: 120000 });

    const dummyPdfPath = path.join(__dirname, 'dummy.pdf');

    test.beforeAll(async () => {
        const pdfDoc = await PDFDocument.create();
        pdfDoc.addPage([612, 792]);
        pdfDoc.addPage([612, 792]);
        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(dummyPdfPath, pdfBytes);
    });

    const tools = ['merge', 'split', 'compress', 'rotate', 'pdf-to-word'];

    for (const tool of tools) {
        test(`Testing Tool: ${tool.toUpperCase()}`, async ({ page }) => {
            const consoleErrors = [];

            page.on('console', message => {
                if (message.type() === 'error') {
                    consoleErrors.push(`[Browser Console Error] ${message.text()}`);
                }
            });

            page.on('pageerror', error => {
                consoleErrors.push(`[Page Exception] ${error.message}`);
            });

            page.on('response', response => {
                if (response.status() >= 400) {
                    consoleErrors.push(`[HTTP ${response.status()}] ${response.url()}`);
                }
            });

            await page.goto(`https://codewithali-pdf-tools.vercel.app/tools/${tool}`);
            await expect(page.locator('#workspaceTitle')).toBeVisible({ timeout: 15000 });

            await page.locator('input[type="file"]').setInputFiles(dummyPdfPath);

            await expect(page.locator('.file-card')).toBeVisible({ timeout: 10000 });

            if (tool === 'pdf-to-word') {
                const imageRadio = page.locator('input[name="wordMode"][value="image"]');
                if (await imageRadio.isVisible()) {
                    await imageRadio.check();
                }
            }

            await page.locator('#actionSubmitBtn').click();

            const resultCard = page.locator('#resultCard');
            const errorMessage = page.locator('.toast-error');

            await expect.poll(
                async () => {
                    if (await resultCard.isVisible()) {
                        return 'success';
                    }

                    if (await errorMessage.isVisible()) {
                        return `error: ${await errorMessage.innerText()}`;
                    }

                    return 'pending';
                },
                {
                    timeout: 90000,
                    intervals: [1000, 2000, 5000],
                    message: () => [
                        'Processing failed or timed out.',
                        ...consoleErrors
                    ].join('\n')
                }
            ).toBe('success');

            const downloadHref = await page.locator('#downloadResultBtn, #downloadBtn').getAttribute('href');
            expect(downloadHref).toMatch(/^(blob:|data:)/);
        });
    }
});
