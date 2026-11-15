// Zweisprachig Deutsch/Englisch (SPEC „Zweisprachig Deutsch/Englisch“, Markus 15.11.2026). Muster wie im Sticky Lab:
// T('deutsch', 'english'). Übersetzt wird nur die Anzeige; Logs für Entwickler, Dateinamen, Protokoll-Schlüssel, CSV
// und die Karussell-Wörter bleiben deutsch.
//
// Zwei Sprachen können verschieden sein:
//  - App-Sprache: Umschalter in der App (automatisch = Sprache des Handys: Deutsch bei de-*, sonst Englisch)
//  - Sticky-Sprache: was der Sticky im Zustand meldet („en“, FW ≥ 0.32.0; er kann die App überstimmen). Ohne Meldung
//    gilt die App-Sprache, die als Standard in einstellungen/zeit.txt („sprache de|en“) an den Sticky geht.
// Alles, was für den Sticky gezeichnet wird, läuft in fuerSticky(): solange gilt dessen Sprache.

const SCHLUESSEL = 'sticky.sprache';                  // 'auto' | 'de' | 'en'

/** true, wenn das Handy nicht auf Deutsch steht */
export const HANDY_EN = (() => {
  try { return !String(navigator.language || 'de').toLowerCase().startsWith('de'); } catch { return false; }
})();

/** Wahl in der App: 'auto' | 'de' | 'en' */
export function sprachWahl() {
  try { const w = localStorage.getItem(SCHLUESSEL); return w === 'de' || w === 'en' ? w : 'auto'; } catch { return 'auto'; }
}
export function sprachWahlSetzen(w) {
  try { if (w === 'de' || w === 'en') localStorage.setItem(SCHLUESSEL, w); else localStorage.removeItem(SCHLUESSEL); } catch { /* egal */ }
  appEn = berechne();
}
const berechne = () => { const w = sprachWahl(); return w === 'auto' ? HANDY_EN : w === 'en'; };

let appEn = berechne();
let stickyEn = null;          // zuletzt gemeldet; null = unbekannt (dann App-Sprache)
let stickyTiefe = 0;          // > 0: gerade wird für den Sticky gezeichnet
let stickyFest = null;        // für ein bestimmtes Gerät (zweiter Sticky gleichzeitig): dessen Sprache

/** App-Sprache Englisch? */
export const appIstEn = () => appEn;
/** Sprache des Sticky (gemeldet, sonst die der App) */
export const stickyIstEn = () => stickyEn ?? appEn;
/** vom Zustand des Sticky („en“); liefert true, wenn sie sich gegenüber einer früheren Meldung geändert hat */
export function stickyEnSetzen(v) {
  const neu = v == null ? null : !!v, vorher = stickyEn;
  stickyEn = neu;
  return vorher != null && neu != null && vorher !== neu;
}
/** gerade wirksam: im Sticky-Kontext dessen Sprache, sonst die der App */
export const istEn = () => (stickyTiefe > 0 ? (stickyFest ?? stickyIstEn()) : appEn);

/** T('deutsch', 'english') */
export const T = (de, en) => (istEn() ? en : de);
/** Sprachkürzel für Intl (Datum, Zahlen) */
export const lang = () => (istEn() ? 'en-GB' : 'de-DE');

/**
 * fn in der Sprache des Sticky ausführen (synchron oder async; bei einem Promise gilt es bis zu dessen Ende).
 * en: Sprache eines bestimmten Geräts (dessen Zustand „en“), sonst die des verbundenen Sticky
 */
export function fuerSticky(fn, en = null) {
  const altFest = stickyFest;
  if (en != null) stickyFest = !!en;
  stickyTiefe++;
  const ende = () => { stickyTiefe--; stickyFest = altFest; };
  let r;
  try { r = fn(); } catch (e) { ende(); throw e; }
  if (r && typeof r.then === 'function') return r.finally(ende);
  ende();
  return r;
}

/** Zahl als Text für die Anzeige: Deutsch mit Komma, Englisch mit Punkt (aus einem deutsch formatierten Text) */
export const zahlText = (s) => (istEn() ? String(s).replace(/,/g, '.').replace('Fehler', 'Error') : String(s));
