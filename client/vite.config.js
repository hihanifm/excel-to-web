import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '0.0.1'),
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
