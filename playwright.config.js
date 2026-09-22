const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: false,
    retries: 1,
    timeout: 180000,
    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report' }]
    ],
    use: {
        baseURL: 'https://codewithali-pdf-tools.vercel.app',
        headless: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 30000,
        navigationTimeout: 30000
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome']
            }
        }
    ]
});
