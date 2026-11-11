import { defineConfig } from 'vite';

// Relative Pfade für den Capacitor-WebView; Versionsnummer setzt apk.ps1 (STICKY_VERSION)
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(process.env.STICKY_VERSION || 'dev') },
  build: { outDir: 'dist', emptyOutDir: true },
  // Entwicklung: das private Handbuch-PDF liegt außerhalb des Projekts (%LOCALAPPDATA%\sticky-bordbuch, nicht im Repo)
  server: { port: 5205, strictPort: true, fs: { allow: ['.', `${process.env.LOCALAPPDATA ?? ''}/sticky-bordbuch`] } },
});
