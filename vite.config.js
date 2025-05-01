import { defineConfig } from 'vite';

export default defineConfig({
  // …your existing config…
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
});