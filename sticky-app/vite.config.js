import { defineConfig } from 'vite';

// Relative Pfade für den Capacitor-WebView; Versionsnummer setzt apk.ps1 (STICKY_VERSION)
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(process.env.STICKY_VERSION || 'dev') },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5205, strictPort: true },
});
