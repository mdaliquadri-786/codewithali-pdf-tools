const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

const baseUrl = 'https://codewithali-pdf-tools.vercel.app';
const tools = [
    'merge',
    'split',
    'compress',
    'rotate',
    'pdf-to-word'
];

const testDirectory = __dirname;
const artifactsDirectory = path.join(
    testDirectory,
    '..',
    'artifacts'
);

const firstPdfPath = path.join(
    testDirectory,
    'dummy-first.pdf'
);

const secondPdfPath = path.join(
    testDirectory,
    'dummy-second.pdf'
);

test.describe('CodeWithAli PDF Tools - Live Vercel Tests', () => {
    test.describe.configure({
        mode: 'serial',
        timeout: 180000
    });

    test.beforeAll(async () => {
        fs.mkdirSync(artifactsDirectory, {
            recursive: true
        });

        const pdfDocument = await PDFDocument.create();

        pdfDocument.addPage([612, 792]);
        pdfDocument.addPage([612, 792]);

        const pdfBytes = await pdfDocument.save();

        fs.writeFileSync(firstPdfPath, pdfBytes);
        fs.writeFileSync(secondPdfPath, pdfBytes);
    });

    test.afterAll(async () => {
        for (const filePath of [
            firstPdfPath,
            secondPdfPath
        ]) {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    });

    for (const tool of tools) {
        test(
            `Testing Tool: ${tool.toUpperCase()}`,
            async ({ page }) => {
                const diagnostics = [];

                page.on('console', message => {
                    if (message.type() === 'error') {
                        diagnostics.push(
                            `[Browser Console Error] ${message.text()}`
                        );
                    }
                });

                page.on('pageerror', error => {
                    diagnostics.push(
                        [
                            '[Page Exception]',
                            error.stack || error.message
                        ].join('\n')
                    );
                });

                page.on('requestfailed', request => {
                    const failure = request.failure();

                    diagnostics.push(
                        [
                            `[Request Failed] ${request.method()} ${request.url()}`,
                            `Reason: ${
                                failure?.errorText || 'unknown'
                            }`
                        ].join('\n')
                    );
                });

                page.on('response', response => {
                    if (response.status() >= 400) {
                        diagnostics.push(
                            `[HTTP ${response.status()}] ${response.url()}`
                        );
                    }
                });

                const saveFailureScreenshot = async () => {
                    fs.mkdirSync(artifactsDirectory, {
                        recursive: true
                    });

                    const screenshotPath = path.join(
                        artifactsDirectory,
                        `${tool}-failure.png`
                    );

                    await page.screenshot({
                        path: screenshotPath,
                        fullPage: true
                    });
                };

                try {
                    await page.goto(
                        `${baseUrl}/tools/${tool}`,
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

                    const fileInput = page.locator(
                        'input[type="file"]'
                    );

                    await expect(fileInput).toBeAttached({
                        timeout: 10000
                    });

                    /*
                     * Merge requires at least two separate PDF files.
                     * The other tools use one PDF.
                     */
                    if (tool === 'merge') {
                        await fileInput.setInputFiles([
                            firstPdfPath,
                            secondPdfPath
                        ]);
                    } else {
                        await fileInput.setInputFiles(firstPdfPath);
                    }

                    await expect(
                        page.locator('.file-card').first()
                    ).toBeVisible({
                        timeout: 10000
                    });

                    if (tool === 'pdf-to-word') {
                        const imageRadio = page.locator(
                            'input[name="wordMode"][value="image"]'
                        );

                        if (
                            await imageRadio.count() > 0 &&
                            await imageRadio.isVisible()
                        ) {
                            await imageRadio.check();
                        }
                    }

                    const submitButton = page.locator(
                        '#actionSubmitBtn'
                    );

                    await expect(submitButton).toBeEnabled({
                        timeout: 10000
                    });

                    await submitButton.click();

                    const resultCard = page.locator(
                        '#resultCard'
                    );

                    const errorMessage = page.locator(
                        '.toast-error'
                    );

                    await expect
                        .poll(
                            async () => {
                                if (await resultCard.isVisible()) {
                                    return 'success';
                                }

                                if (await errorMessage.isVisible()) {
                                    const text = (
                                        await errorMessage.innerText()
                                    ).trim();

                                    return `error: ${text}`;
                                }

                                return 'pending';
                            },
                            {
                                timeout: 90000,
                                intervals: [1000, 2000, 5000],
                                message: [
                                    `Tool ${tool} did not finish.`,
                                    'The result card did not appear.'
                                ].join(' ')
                            }
                        )
                        .toBe('success');

                    const downloadLink = page
                        .locator(
                            '#downloadResultBtn, #downloadBtn'
                        )
                        .first();

                    await expect(downloadLink).toBeVisible({
                        timeout: 10000
                    });

                    await expect(downloadLink).toHaveAttribute(
                        'href',
                        /^(blob:|data:)/,
                        {
                            timeout: 10000
                        }
                    );
                } catch (error) {
                    try {
                        await saveFailureScreenshot();
                    } catch (screenshotError) {
                        diagnostics.push(
                            [
                                '[Screenshot Error]',
                                screenshotError.message
                            ].join(' ')
                        );
                    }

                    const failureDetails = [
                        `Tool: ${tool}`,
                        `URL: ${baseUrl}/tools/${tool}`,
                        '',
                        'Original error:',
                        error.stack || error.message
                    ];

                    if (diagnostics.length > 0) {
                        failureDetails.push(
                            '',
                            'Browser and network diagnostics:',
                            ...diagnostics
                        );
                    }

                    throw new Error(
                        failureDetails.join('\n'),
                        {
                            cause: error
                        }
                    );
                }
            }
        );
    }
});
