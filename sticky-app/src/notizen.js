// Testnotizen für Bubble-Log-Testfahrten (SPEC „MVP 1“). Eine Zeile JSON je Notiz, Format wie das Bubble-Log-
// Entwickler-Log ({ t, typ, … }), eine Datei pro Tag im App-Speicher. Zusammengeführt wird später über die Zeit.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Geolocation } from '@capacitor/geolocation';
import { Hintergrund as HintergrundOrt } from './hintergrund.js';
import { Share } from '@capacitor/share';
import { sortiere } from './sorte.js';

const NATIV = Capacitor.isNativePlatform();
const ORDNER = 'notizen';
const p2 = (n) => String(n).padStart(2, '0');
export const tagesName = (d = new Date()) => `sticky-notizen-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.jsonl`;

let web = []; // Browser: nur im Speicher

/** Standort für den Stempel; null, wenn keiner zu haben ist (nicht blockieren, höchstens 4 s). */
export async function standort() {
  try {
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 4000, maximumAge: 15000 });
    return { lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), gen: Math.round(p.coords.accuracy), tempo: p.coords.speed ?? null };
  } catch {
    // Rückfall: letzter Ort, den der StickyDienst passiv mitbekommen hat (läuft Bubble Log, kommt jede Sekunde einer)
    try {
      const o = await HintergrundOrt.letzterOrt();
      if (o?.lat != null && o.alterMs < 120000) return { lat: +o.lat.toFixed(6), lon: +o.lon.toFixed(6), gen: o.gen, tempo: o.tempo ?? null, ortAlterS: Math.round(o.alterMs / 1000) };
    } catch { /* kein Dienst (Browser) */ }
    return null;
  }
}

/** Neue Notiz: { art: 'knopf'|'diktat', knopf?, text?, audio? } → gespeicherte Zeile */
export async function notiere(teile, ort = null) {
  // Sorte (SPEC „Sprachnotizen 2.0“): Knöpfe sind Fahrt-Notizen, Diktate sortiert sorte.js; Stichwort fällt aus dem Text
  if (!teile.sorte) {
    if (teile.art === 'diktat' && teile.text && !teile.unklar) {
      const s = sortiere(teile.text, { tempo: ort?.tempo, dauerMs: teile.dauerMs, faehrt: teile.faehrt });
      teile = { ...teile, text: s.text, sorte: s.sorte, sorteGrund: s.grund, ...(s.text !== teile.text && teile.roh == null ? { roh: teile.text } : {}) };
    } else teile = { ...teile, sorte: teile.art === 'knopf' ? 'fahrt' : 'eingang' };
  }
  const zeile = { t: Date.now(), typ: 'notiz', quelle: 'sticky', ...teile, ...(ort ?? {}) };
  const json = JSON.stringify(zeile);
  if (NATIV) {
    await Filesystem.appendFile({ path: `${ORDNER}/${tagesName()}`, data: json + '\n', directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
  } else {
    web.push(json);
  }
  return zeile;
}

/** Text einer Notiz von heute ändern (Zeit t ist der Schlüssel); die erste erkannte Fassung bleibt als „roh“ erhalten */
export async function aendern(t, text) {
  if (!String(text ?? '').trim()) throw new Error('leerer Text');
  return setzen(t, (n) => { if (n.roh == null) n.roh = n.text; n.text = text; n.korrigiert = true; });
}

/** Felder einer Notiz von heute ändern; aendere(n) bekommt das Objekt zum Bearbeiten */
export async function setzen(t, aendere) {
  let erledigt = false;   // nur den ersten Treffer (gleiche Millisekunde ist selten, aber möglich)
  const neu = (z) => { const n = JSON.parse(z); if (erledigt || n.t !== t) return z; erledigt = true; aendere(n); return JSON.stringify(n); };
  if (!NATIV) { web = web.map(neu); return; }
  const pfad = `${ORDNER}/${tagesName()}`;
  const alt = (await Filesystem.readFile({ path: pfad, directory: Directory.Data, encoding: Encoding.UTF8 })).data;
  const zeilen = alt.split('\n').filter(Boolean).map((z) => { try { return neu(z); } catch { return z; } });
  await Filesystem.writeFile({ path: pfad, data: zeilen.join('\n') + '\n', directory: Directory.Data, encoding: Encoding.UTF8 });
}

/** Notizen von heute (neueste zuerst) */
export async function heute() {
  let text = '';
  if (NATIV) {
    try { text = (await Filesystem.readFile({ path: `${ORDNER}/${tagesName()}`, directory: Directory.Data, encoding: Encoding.UTF8 })).data; } catch { /* noch keine */ }
  } else {
    text = web.join('\n');
  }
  return text.split('\n').filter(Boolean).map((z) => { try { return JSON.parse(z); } catch { return null; } }).filter(Boolean).reverse();
}

/** Tagesdatei teilen (wie die Bubble-Log-Logs). Ergebnis: 'geteilt' | 'leer' | 'heruntergeladen' | 'abgebrochen' */
export async function teilen() {
  const name = tagesName();
  if (!NATIV) {
    if (!web.length) return 'leer';
    const url = URL.createObjectURL(new Blob([web.join('\n') + '\n'], { type: 'application/x-ndjson' }));
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    return 'heruntergeladen';
  }
  try {
    const { uri } = await Filesystem.getUri({ path: `${ORDNER}/${name}`, directory: Directory.Data });
    await Filesystem.stat({ path: `${ORDNER}/${name}`, directory: Directory.Data });
    await Share.share({ title: name, files: [uri] });
    return 'geteilt';
  } catch (e) {
    if (/cancel|abgebrochen/i.test(e.message)) return 'abgebrochen';
    if (/exist|not found/i.test(e.message)) return 'leer';
    throw e;
  }
}
