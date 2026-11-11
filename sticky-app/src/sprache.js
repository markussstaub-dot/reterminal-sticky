// Spracherkennung Stufe 1 (Handy, offline): eigenes Android-Plugin mit whisper.cpp.
// Im Browser eine Attrappe mit festem Text, damit die Oberfläche ohne Gerät testbar ist.
import { registerPlugin } from '@capacitor/core';

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

export const Spracherkennung = registerPlugin('Spracherkennung', {
  web: {
    async status() {
      return { modelle: [{ name: 'attrappe.bin', bytes: 0 }], geladen: null, system: 'Browser-Attrappe' };
    },
    async vorladen() { return { ladeMs: 0 }; },
    async erkennen({ modell }) {
      await warte(400);
      return { text: 'Das ist eine Attrappe aus dem Browser, die echte Erkennung läuft nur in der APK.', ms: 400, ladeMs: 0, modell, threads: 0 };
    },
  },
});

// Wortliste als Vorgabe für whisper (initial_prompt): Eigennamen, die sonst verhört werden (Testfahrt 11.11.2026)
export const WOERTER_STANDARD = 'Microlino, Bubble Log, Fold, Sticky, Bexbach, Homburg, Tanke, Akku, Ladesäule, Ampel, Kreisel';

export const MODELLE = [
  { datei: 'ggml-small-q5_1.bin', name: 'small (190 MB)' },
  { datei: 'ggml-base-q5_1.bin', name: 'base (60 MB)' },
];

/** Int16-PCM → Base64 für die Übergabe an das Plugin */
export function pcmBase64(pcm) {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
