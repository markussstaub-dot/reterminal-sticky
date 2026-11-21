// Uhrzeit-Format einheitlich (Markus, 13.11.2026): 12 oder 24 h folgt der Einstellung des Handys; der Sticky übernimmt
// das als Standard (einstellungen/zeit.txt) und kann es auf seiner Einstellungs-Seite selbst überstimmen.

import { appIstEn, lang } from './uebersetzen.js';

/** true, wenn das Handy 12 h (AM/PM) zeigt */
export const HANDY_12H = (() => {
  try { return !!new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12; } catch { return false; }
})();

/** true, wenn das Handy auf US-Einheiten steht (Region USA, Liberia, Myanmar): °F, Zoll */
export const HANDY_US = (() => {
  try { const r = new Intl.Locale(new Intl.DateTimeFormat().resolvedOptions().locale).maximize().region; return ['US', 'LR', 'MM'].includes(r); } catch { return false; }
})();

/** Uhrzeit für die App-Anzeige im Format des Handys, in der wirksamen Sprache beschriftet */
export function uhrzeit(d, mitSekunden = false) {
  return new Date(d).toLocaleTimeString(lang(), { hour: HANDY_12H ? 'numeric' : '2-digit', minute: '2-digit', ...(mitSekunden ? { second: '2-digit' } : {}), hour12: HANDY_12H });
}

/** Datei für den Sticky: „format 12|24“, „einheiten us|metrisch“, „sprache de|en“ (Standard; am Sticky überstimmbar) */
export const zeitDatei = () => new TextEncoder().encode(`format ${HANDY_12H ? 12 : 24}\neinheiten ${HANDY_US ? 'us' : 'metrisch'}\nsprache ${appIstEn() ? 'en' : 'de'}\n`);

// ---- Datum auf Home ohne Handy (SPEC, 21.11.2026, FW 0.45.0) ---------------------------------------------------------
// Der Sticky setzt das Datum selbst aus vorgerenderten Streifen (home/datum.bin), so wie die Uhr aus dem Ziffernblatt.
// Fenster: vom Ersten des laufenden Monats bis Ende des übernächsten (mindestens 59 Tage voraus). So ändert sich die
// Datei nur am Monatswechsel und beim Sprachwechsel, nicht täglich.
const p2 = (n) => String(n).padStart(2, '0');
/** JJJJMMTT in Ortszeit */
export const tagZahl = (d) => { const t = new Date(d); return `${t.getFullYear()}${p2(t.getMonth() + 1)}${p2(t.getDate())}`; };

/** Tage des Fensters als Date (12 Uhr mittags, damit die Sommerzeit nichts verschiebt) */
export function datumFenster(heute = new Date()) {
  const j = heute.getFullYear(), m = heute.getMonth();
  const tage = [];
  for (let d = new Date(j, m, 1, 12); d < new Date(j, m + 3, 1); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)) tage.push(d);
  return tage;
}

/** Kopf von datum.bin (16 Byte): „DAT1“, Jahr u16, Monat, Tag des ersten Streifens, Anzahl u16, Byte je Streifen u16, 4 frei */
export function datumKopf(erster, anzahl, groesse) {
  const k = new Uint8Array(16);
  k.set([0x44, 0x41, 0x54, 0x31]);
  const v = new DataView(k.buffer);
  v.setUint16(4, erster.getFullYear(), true);
  k[6] = erster.getMonth() + 1;
  k[7] = erster.getDate();
  v.setUint16(8, anzahl, true);
  v.setUint16(10, groesse, true);
  return k;
}

/** home/wetter.txt: Tag der Vorhersage auf der Home-Karte („tag JJJJMMTT“, ohne Wetter „tag 0“); ist er vorbei, blendet der Sticky die Wetterzeile aus */
export const wetterDatei = (wetter) => new TextEncoder().encode(`tag ${wetter?.zeit ? tagZahl(wetter.zeit) : 0}\n`);
