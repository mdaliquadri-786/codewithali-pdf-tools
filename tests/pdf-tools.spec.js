const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('CodeWithAli PDF Tools - Live Vercel Tests', () => {
    const dummyPdfPath = path.join(__dirname, 'dummy.pdf');
    test.beforeAll(() => {
        if (!fs.existsSync(dummyPdfPath)) {
            const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 51 >>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(Automated Test Document) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000214 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n314\n%%EOF';
            fs.writeFileSync(dummyPdfPath, pdfContent);
        }
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

            // Advanced Network Diagnostics (To catch exactly which file gives 404)
            page.on('requestfailed', request => {
                consoleErrors.push(`[Request Failed] ${request.url()} - ${request.failure()?.errorText || 'unknown error'}`);
            });

            page.on('response', response => {
                if (response.status() === 404) {
                    consoleErrors.push(`[HTTP 404] ${response.url()}`);
                }
            });

            await page.goto(`https://codewithali-pdf-tools.vercel.app/tools/${tool}`);
            await expect(page.locator('#workspaceTitle')).toBeVisible({ timeout: 15000 });
            
            const fileInput = page.locator('input[type="file"]');
            await fileInput.setInputFiles(dummyPdfPath);
            await fileInput.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));

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

            await expect.poll(async () => {
                if (await resultCard.isVisible()) return 'success';
                
                if (await errorMessage.isVisible()) {
                    const errText = await errorMessage.innerText();
                    consoleErrors.push(`[UI Toast Error] ${errText}`);
                    return 'error';
                }
                
                return 'pending';
            }, {
                timeout: 30000,
                message: `PDF processing failed. Exact Errors:\n\n${consoleErrors.join('\n')}`
            }).toBe('success');
            
            const downloadHref = await page.locator('#downloadResultBtn, #downloadBtn').getAttribute('href');
            expect(downloadHref).toMatch(/^(blob:|data:)/);
        });
    }
});
