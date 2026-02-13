import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Single source of truth: VERSION file
const version = readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim() || '0.0.0';
let branch = '—';
try {
  branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim() || '—';
} catch (_) {}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BRANCH__: JSON.stringify(branch),
  },
  server: {
    port: 36001,
    host: true, // listen on all interfaces (0.0.0.0) so you can access by IP
    proxy: {
      '/api': {
        target: 'http://localhost:36000',
        changeOrigin: true,
      },
    },
  },
});
