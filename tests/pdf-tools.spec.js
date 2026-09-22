const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('CodeWithAli PDF Tools - Live Vercel Tests', () => {
    // Test karne ke liye ek halki Dummy PDF generate karte hain
    const dummyPdfPath = path.join(__dirname, 'dummy.pdf');
    test.beforeAll(() => {
        if (!fs.existsSync(dummyPdfPath)) {
            fs.writeFileSync(dummyPdfPath, '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n188\n%%EOF');
        }
    });

    const tools = ['merge', 'split', 'compress', 'rotate', 'pdf-to-word'];

    for (const tool of tools) {
        test(`Testing Tool: ${tool.toUpperCase()}`, async ({ page }) => {
            
            // Vercel site ke specific tool par jayein
            await page.goto(`https://codewithali-pdf-tools.vercel.app/tools/${tool}`);
            
            // UI load hone ka wait karein 
            await expect(page.locator('#workspaceTitle')).toBeVisible({ timeout: 15000 });
            
            // Background mein PDF file upload karein
            await page.locator('input[type="file"]').setInputFiles(dummyPdfPath);
            await expect(page.locator('.file-card')).toBeVisible({ timeout: 10000 });

            // Agar PDF to Word tool hai, toh "Exact Visual Layout" option select karein
            if (tool === 'pdf-to-word') {
                const imageRadio = page.locator('input[name="wordMode"][value="image"]');
                if (await imageRadio.isVisible()) {
                    await imageRadio.check();
                }
            }
            
            // Process button par click karein
            await page.locator('#actionSubmitBtn').click();
            
            // Result screen aane ka wait karein (Max 30 seconds for backend processing)
            await expect(page.locator('#resultCard')).toBeVisible({ timeout: 30000 });
            
            // Validate karein ki Download button mein ek valid file (blob URL) aa chuki hai
            const downloadHref = await page.locator('#downloadResultBtn, #downloadBtn').getAttribute('href');
            expect(downloadHref).toContain('blob:');
        });
    }
});
