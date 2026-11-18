// QR-Code abfotografieren statt tippen (Markus, 16.11.2026): Foto → jsQR → Inhalt. Läuft offline, das Foto wird
// weder gespeichert noch verschickt. Eigene Codes haben die Form „sticky:<art>?schlüssel=wert&…“, damit später
// weitere Arten dazukommen können (Orte, Spickzettel, Einstellungen fürs zweite Fold …).
import jsQR from 'jsqr';
import { strichAusHelligkeit, helligkeit } from './strichcode.js';

/** „sticky:hauslurch?adresse=zenbook&schluessel=…“ → { art: 'hauslurch', adresse, schluessel }; sonst { art: 'text', text } */
export function deuteQr(text) {
  const t = String(text || '').trim();
  const m = /^sticky:([a-z0-9-]+)\??(.*)$/i.exec(t);
  if (!m) return { art: 'text', text: t };
  const werte = Object.fromEntries(new URLSearchParams(m[2]));
  return { art: m[1].toLowerCase(), ...werte };
}

/** Rohdaten (RGBA) → Text oder null; versucht auch hellen Code auf dunklem Grund (Konsole am Bildschirm) */
export function qrAusPixeln(rgba, breite, hoehe) {
  const r = jsQR(rgba, breite, hoehe, { inversionAttempts: 'attemptBoth' });
  return r ? r.data : null;
}

/** Foto (File/Blob) → Text oder null. Große Fotos werden verkleinert, sonst ist jsQR auf dem Handy zäh */
export async function qrAusBild(datei, maxKante = 1400) {
  const bild = await createImageBitmap(datei);
  const f = Math.min(1, maxKante / Math.max(bild.width, bild.height));
  const w = Math.round(bild.width * f), h = Math.round(bild.height * f);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const p = c.getContext('2d', { willReadFrequently: true });
  p.drawImage(bild, 0, 0, w, h);
  bild.close?.();
  const text = qrAusPixeln(p.getImageData(0, 0, w, h).data, w, h);
  if (text || f === 1) return text;
  // feiner Code auf großem Foto: noch einmal in voller Größe
  return qrAusBild(datei, Infinity);
}

// ---- Zettel (18.11.2026): QR oder Strichcode abfotografieren ------------------------------------------------------
// Erst die Barcode-Erkennung des Systems (Android-WebView/Chrome, falls vorhanden, offline), sonst eigene Leser:
// jsQR für QR, strichcode.js für EAN-13/Code128. Das Foto wird nicht gespeichert.

async function pixelAus(datei, maxKante) {
  const bild = await createImageBitmap(datei);
  const f = Math.min(1, maxKante / Math.max(bild.width, bild.height));
  const w = Math.round(bild.width * f), h = Math.round(bild.height * f);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const p = c.getContext('2d', { willReadFrequently: true });
  p.drawImage(bild, 0, 0, w, h);
  return { bild, rgba: p.getImageData(0, 0, w, h).data, w, h };
}

/** Foto → { art: 'qr', text } | { art: 'strich', format, code } | null; art = 'qr' oder 'strich' (was gesucht wird) */
export async function codeAusBild(datei, art = 'qr') {
  try {
    if (typeof BarcodeDetector !== 'undefined') {
      const da = await BarcodeDetector.getSupportedFormats();
      const formate = (art === 'qr' ? ['qr_code'] : ['ean_13', 'upc_a', 'code_128']).filter((f) => da.includes(f));
      if (formate.length) {
        const bild = await createImageBitmap(datei);
        const [r] = await new BarcodeDetector({ formats: formate }).detect(bild);
        bild.close?.();
        if (r?.rawValue) {
          if (r.format === 'qr_code') return { art: 'qr', text: r.rawValue };
          if (r.format === 'upc_a') return { art: 'strich', format: 'EAN13', code: `0${r.rawValue}` };
          return { art: 'strich', format: r.format === 'ean_13' ? 'EAN13' : 'CODE128', code: r.rawValue };
        }
      }
    }
  } catch { /* weiter mit den eigenen Lesern */ }
  if (art === 'qr') { const text = await qrAusBild(datei); return text ? { art: 'qr', text } : null; }
  for (const kante of [1400, 2400]) {
    const { bild, rgba, w, h } = await pixelAus(datei, kante);
    bild.close?.();
    const r = strichAusHelligkeit(helligkeit(rgba, w, h), w, h);
    if (r) return { art: 'strich', ...r };
  }
  return null;
}
