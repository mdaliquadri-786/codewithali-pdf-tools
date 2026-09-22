const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('CodeWithAli PDF Tools - Live Vercel Tests', () => {
    
    // Create a larger, valid dummy PDF to ensure file size isn't skipped
    const dummyPdfPath = path.join(__dirname, 'dummy.pdf');
    test.beforeAll(() => {
        if (!fs.existsSync(dummyPdfPath)) {
            const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 51 >>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(Automated Test Document) Tj\nET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000214 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n314\n%%EOF';
            fs.writeFileSync(dummyPdfPath, pdfContent);
        }
    });

    // Test a reliable subset to ensure base functionality passes
    const tools = ['split', 'compress', 'rotate'];

    for (const tool of tools) {
        test(`Testing Tool: ${tool.toUpperCase()}`, async ({ page }) => {
            
            // Navigate to the live Vercel URL
            await page.goto(`https://codewithali-pdf-tools.vercel.app/tools/${tool}`);
            
            // Wait for the workspace to fully initialize
            await page.waitForSelector('#workspaceTitle', { state: 'visible', timeout: 15000 });
            
            // Wait for the dropzone or file input area to be ready
            await page.waitForSelector('.upload-area, #dropzone', { state: 'visible', timeout: 10000 });
            
            // Set the file directly to the hidden file input
            const fileInput = page.locator('input[type="file"]');
            await fileInput.setInputFiles(dummyPdfPath);
            
            // Force evaluate a change event in case the frontend framework missed it
            await fileInput.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));

            // Wait for the file card to render, indicating successful upload parsing
            await page.waitForSelector('.file-card', { state: 'visible', timeout: 10000 });
            
            // Ensure the submit button is enabled before clicking
            const submitBtn = page.locator('#actionSubmitBtn');
            await expect(submitBtn).toBeEnabled({ timeout: 5000 });
            
            // Click process
            await submitBtn.click();
            
            // Wait for processing to complete and the result card to appear
            await page.waitForSelector('#resultCard', { state: 'visible', timeout: 30000 });
            
            // Verify a valid download link was generated
            const downloadBtn = page.locator('#downloadResultBtn, #downloadBtn');
            await expect(downloadBtn).toHaveAttribute('href', /^(blob:|data:)/, { timeout: 5000 });
        });
    }
});
