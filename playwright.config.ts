import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', workers: 1, use: { baseURL: 'http://127.0.0.1:9099', headless: true, viewport: { width: 1500, height: 950 } },
  webServer: { command: 'python3 -m http.server 9099 --bind 127.0.0.1 --directory preview-dist', url: 'http://127.0.0.1:9099', reuseExistingServer: false },
});
