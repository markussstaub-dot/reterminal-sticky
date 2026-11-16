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
let stickyEn = (() => {       // zuletzt gemeldet (über App-Neustarts gemerkt, s. stickyEnSetzen); null = unbekannt (dann App-Sprache)
  try { const g = localStorage.getItem('sticky.spracheGemeldet'); return g === 'en' ? true : g === 'de' ? false : null; } catch { return null; }
})();
let stickyTiefe = 0;          // > 0: gerade wird für den Sticky gezeichnet
let stickyFest = null;        // für ein bestimmtes Gerät (zweiter Sticky gleichzeitig): dessen Sprache

/** App-Sprache Englisch? */
export const appIstEn = () => appEn;
/** Sprache des Sticky (gemeldet, sonst die der App) */
export const stickyIstEn = () => stickyEn ?? appEn;
/** vom Zustand des Sticky („en“); liefert true, wenn sie sich gegenüber einer früheren Meldung geändert hat */
// Zuletzt gemeldete Sticky-Sprache bleibt über App-Neustarts gemerkt: sonst ging eine Umstellung am Sticky verloren,
// die passierte, während die App zu war oder er nicht verbunden war (erste Meldung = „unbekannt → en“, kein Neuzeichnen;
// Markus 16.11.2026: „EN in den Einstellungen am Sticky, tut sich nix“).
const GEMELDET = 'sticky.spracheGemeldet';
export function stickyEnSetzen(v) {
  const neu = v == null ? null : !!v;
  let vorher = stickyEn;
  if (vorher == null) { try { const g = localStorage.getItem(GEMELDET); vorher = g === 'en' ? true : g === 'de' ? false : null; } catch { /* egal */ } }
  stickyEn = neu;
  if (neu != null) { try { localStorage.setItem(GEMELDET, neu ? 'en' : 'de'); } catch { /* egal */ } }
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
