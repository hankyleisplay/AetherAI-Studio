import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The app version lives in the repository's root package.json (the launcher reads it too). Build it into the UI
// from there so the sidebar badge and the window title can never fall behind a release.
function readAppVersion(): string {
  for (const file of ['../package.json', './package.json']) {
    try {
      const version = JSON.parse(readFileSync(resolve(__dirname, file), 'utf-8')).version;
      if (version) return String(version);
    } catch {
      // try the next candidate
    }
  }
  return '0.0.0';
}

const APP_VERSION = readAppVersion();

const injectVersionIntoHtml = (): Plugin => ({
  name: 'inject-app-version',
  transformIndexHtml: (html) => html.replace(/__APP_VERSION__/g, APP_VERSION)
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), injectVersionIntoHtml()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION)
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
});
