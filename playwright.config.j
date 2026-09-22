const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 1, // Agar error aaye toh ek baar wapas try karega
  reporter: 'html', // Professional HTML report generate karega
  use: {
    // Aapki live site ka URL jahan test run hoga
    baseURL: 'https://codewithali-pdf-tools.vercel.app',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
