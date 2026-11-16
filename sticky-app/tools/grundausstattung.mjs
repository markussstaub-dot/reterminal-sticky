// microSD-Grundausstattung („SD base kit“) fürs Release bauen – wiederholbar, ohne Handy.
//
//   node tools/grundausstattung.mjs                 Englisch, Firmware-Version aus firmware-ble.ino
//   node tools/grundausstattung.mjs --de            Deutsch
//   node tools/grundausstattung.mjs --aus <Ordner>  Ziel (Standard: %LOCALAPPDATA%\sticky-build\grundausstattung)
//
// Ablauf: Vite-Dev-Server starten, Edge headless mit FRISCHEM Profil öffnen (kein localStorage → keine Orte, kein
// Wetterort, keine Lineal-Kalibrierung, keine Zettel), dort `window.__sticky.grundausstattung()` aus main.js aufrufen
// (dieselben Zeichenfunktionen, mit denen die App ein frisches Gerät bespielt) und das Ergebnis schreiben:
//   <aus>/soll/…                              der Ordner für die Karte
//   <aus>/edc-sticky-sd-basekit-<fw>.zip       dasselbe als ZIP (mit README/LIESMICH)
// Persönliches kommt so nicht hinein: Spickzettel, Handbuch-PDFs, Home und Notizen baut grundausstattung() gar nicht.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const en = !args.includes('--de');
const ausI = args.indexOf('--aus');
const aus = resolve(ausI >= 0 ? args[ausI + 1] : join(process.env.LOCALAPPDATA ?? tmpdir(), 'sticky-build', 'grundausstattung'));
const fw = readFileSync(join(app, '..', 'firmware-ble', 'firmware-ble.ino'), 'utf8').match(/FW_VERSION = "([^"]+)"/)[1];

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
if (!edge) throw new Error('Kein Edge/Chrome gefunden');

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await createServer({ root: app, logLevel: 'error', server: { port: 5291, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const profil = mkdtempSync(join(tmpdir(), 'sticky-grund-'));
const browser = spawn(edge, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profil}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });

try {
  let port;
  for (let i = 0; i < 100 && !port; i++) { await warte(100); try { port = readFileSync(join(profil, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* noch nicht */ } }
  if (!port) throw new Error('Browser meldet keinen DevTools-Port');
  const ziel = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(ziel.webSocketDebuggerUrl);
  await new Promise((ok, f) => { ws.onopen = ok; ws.onerror = f; });
  let id = 0;
  const offen = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (offen.has(d.id)) { offen.get(d.id)(d); offen.delete(d.id); } };
  const cdp = (method, params = {}) => new Promise((ok) => { offen.set(++id, ok); ws.send(JSON.stringify({ id, method, params })); });

  const ausdruck = `(async () => {
    for (let i = 0; i < 200 && !window.__sticky?.grundausstattung; i++) await new Promise((r) => setTimeout(r, 100));
    // die App legt beim Start Standards an (Beispiel-Zettel, Geräteliste); Ortsbezogenes darf es nicht geben
    const heikel = Object.keys(localStorage).filter((k) => /wetter|ort|lineal80|link/i.test(k));
    if (heikel.length) throw new Error('Profil nicht leer: ' + heikel.join(', '));
    const opt = ${JSON.stringify({ fw, en })};
    const dateien = window.__sticky.grundausstattung(opt);
    const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
    const zip = new Uint8Array(await window.__sticky.grundZip(opt).arrayBuffer());
    return JSON.stringify({ dateien: dateien.map((d) => ({ p: d.p, b: b64(d.daten) })), zip: b64(zip) });
  })()`;
  const r = await cdp('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails || !r.result?.result?.value) throw new Error('Im Browser: ' + JSON.stringify(r.result?.exceptionDetails ?? r).slice(0, 800));
  const { dateien, zip } = JSON.parse(r.result.result.value);
  ws.close();

  rmSync(join(aus, 'soll'), { recursive: true, force: true });
  for (const d of dateien) {
    const pfad = join(aus, d.p);
    mkdirSync(dirname(pfad), { recursive: true });
    writeFileSync(pfad, Buffer.from(d.b, 'base64'));
  }
  const zipName = `edc-sticky-sd-basekit-${fw}${en ? '' : '-de'}.zip`;
  writeFileSync(join(aus, zipName), Buffer.from(zip, 'base64'));
  console.log(`${dateien.length} Dateien (${en ? 'Englisch' : 'Deutsch'}, FW ${fw}) → ${aus}\n${zipName}`);
} finally {
  browser.kill();
  await server.close();
  await warte(300);
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* Edge hält evtl. noch Dateien */ }
}
