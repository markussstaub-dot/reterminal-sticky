// QR-Code abfotografieren statt tippen (Markus, 16.11.2026): Foto → jsQR → Inhalt. Läuft offline, das Foto wird
// weder gespeichert noch verschickt. Eigene Codes haben die Form „sticky:<art>?schlüssel=wert&…“, damit später
// weitere Arten dazukommen können (Orte, Spickzettel, Einstellungen fürs zweite Fold …).
import jsQR from 'jsqr';

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
