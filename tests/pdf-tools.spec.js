name: Automated PDF Tools Tester

on:
  push:
    branches:
      - main
      - master

jobs:
  test:
    timeout-minutes: 15
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Wait for Vercel deployment readiness
        run: |
          for i in {1..30}; do
            status=$(curl -L -s -o /dev/null -w "%{http_code}" \
              https://codewithali-pdf-tools.vercel.app/tools/merge)

            if [ "$status" = "200" ]; then
              echo "Vercel deployment is live and ready!"
              exit 0
            fi

            echo "Deployment not ready yet (HTTP $status). Retrying in 10s..."
            sleep 10
          done

          echo "Deployment did not become ready in time."
          exit 1

      - name: Run Playwright tests
        run: npm run test:e2e

      - name: Upload Playwright artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-artifacts
          path: |
            artifacts/
            test-results/
            playwright-report/
          if-no-files-found: ignore
