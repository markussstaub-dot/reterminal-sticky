import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Clipboard } from '@capacitor/clipboard';
import { Spracherkennung, MODELLE, WOERTER_STANDARD, pcmBase64 } from './sprache.js';
import { registerPlugin } from '@capacitor/core';
// Vordergrund-Dienst (Android), damit die App bei verbundenem Sticky nicht eingefroren wird
import { Hintergrund } from './hintergrund.js';
const p2 = (n, l = 2) => String(n).padStart(l, '0');
/** Ortszeit mit Millisekunden für Dateinamen: 2026-11-11-22-27-50-123 */
const dateiZeit = (t) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}-${p2(d.getMilliseconds(), 3)}`; };
/** GPS nur, wenn das Ereignis frisch ist; was mehr als 60 s zu spät ankommt, bekommt keinen (falschen) Ort */
const VERSPAETET_MS = 60000;
const woerter = () => $('woerter').value.trim();
/** Lernendes Wörterbuch (SPEC „lokales Modell flott machen“): Paare aus „Mehr → Wörterbuch“ */
const woerterbuch = () => paareLesen(document.getElementById('woerterbuch')?.value ?? WOERTERBUCH_STANDARD);
/** Erkennung mit Wächter: kurze/leise Aufnahmen und nachgeplapperte Wortliste werden „(unklar)“, der Ton bleibt */
const pttAblage = () => { try { return localStorage.getItem('sticky.pttAblage') === '1'; } catch { return false; } };

async function erkenne(pcm) {
  const p = sprachPruefung(pcm);
  if (!p.ok) return { text: '(unklar)', unklar: p.grund, ms: 0, ladeMs: 0, modell: $('modell').value, pruefung: p };
  const r = await Spracherkennung.erkennen({ pcm: pcmBase64(angehoben(pcm)), modell: $('modell').value, threads: 6, hinweis: woerter() });
  if (r.text && nurWortliste(r.text, woerter())) return { ...r, text: '(unklar)', unklar: 'nur Wörter der Liste', pruefung: p };
  const text = korrigiere(r.text, woerterbuch());
  return { ...r, text, ...(text !== r.text ? { roh: r.text } : {}), pruefung: p };
}
import { zeichneFahrt, trefferKnopf, rueckmeldung, layoutText, STANDARD_KNOEPFE } from './fahrtseite.js';
import { zeichneHome, zeichneZiffern, statusGlyphen, setzeEinheitUs, KARTE } from './homeseite.js';
import { holeWetter, letztesWetter } from './wetter.js';
import { BESTELL_STANDARD, zeichneZettel } from './bestellung.js';
import { zettelListe, zettelUmzug } from './zettel.js';
import { uhrzeit, zeitDatei, HANDY_US } from './zeit.js';
import { T, fuerSticky, sprachWahl, sprachWahlSetzen, stickyEnSetzen, appIstEn, lang } from './uebersetzen.js';
let letzteEinheitUs = null;
setzeEinheitUs(HANDY_US);   // bis der Sticky seine Einheit meldet
import { alphabetDatei, glyphenBlatt, schriftHintergrund, schriftHilfe } from './strichschrift.js';
import { KARTEN_STANDARD, zeichneKarte } from './karten.js';
import { Aufnahme, wav, wavKopf, sprachPruefung, nurWortliste, angehoben, dekodiereDatei, stuecke, mitMerkern } from './audio.js';
import * as notizen from './notizen.js';
import { SORTEN, naechsteSorte } from './sorte.js';
import { HILFE } from './hilfe.js';
import { HANDGRIFFE_STANDARD } from './handgriffe.js';
import { AppSeite } from './appseite.js';
import { WIDGETS, EINGABEN, menueWidget } from './widgets.js';
import { LAGE_STANDARD, LAGE_NAMEN, vomDisplay } from './lage.js';
import { WOERTERBUCH_STANDARD, paareLesen, paareText, korrigiere, lernen, einpflegen } from './woerterbuch.js';
import * as bb from './bordbuch.js';
import { tabsEinrichten } from './tabs.js';
import { spiegelEinrichten } from './spiegel.js';
import { BREITE, HOEHE, rgbaZu1bpp, crc32, rueckDatei } from './protokoll.js';
import { BleVerbindung, SimVerbindung } from './verbindung.js';
import { Zwilling } from './zwilling.js';
import { MELDE_STANDARD, meldeRegeln, meldePakete, meldungErlaubt, meldungDazu, meldungWeg, orteLesen, ortFinden, ortZeile, fahrtSchritt, homeZeilen } from './kontext.js';
import { FRAGE_DAUER_MS } from './rueckfrage.js';
import { schluessel, schluesselFuer, mitGeraet, karteFuer, kurz, geraete, aktivesGeraet, aktivSetzen, geraetAendern, geraetVergessen, PROFILE, profilName } from './geraete.js';

const $ = (id) => document.getElementById(id);
// Feste Texte in index.html: Deutsch steht im HTML, Englisch in data-en (Text), data-en-placeholder, data-en-title
if (appIstEn()) {
  document.documentElement.lang = 'en';
  for (const el of document.querySelectorAll('[data-en]')) el.textContent = el.dataset.en;
  for (const el of document.querySelectorAll('[data-en-placeholder]')) el.placeholder = el.dataset.enPlaceholder;
  for (const el of document.querySelectorAll('[data-en-title]')) el.title = el.dataset.enTitle;
}
const nativ = Capacitor.isNativePlatform();
const zwilling = new Zwilling();
let verbindung = null;

const leinwand = $('bild');
const g = leinwand.getContext('2d', { willReadFrequently: true });
const ueber = $('ueber').getContext('2d');

$('version').textContent = `Version ${__APP_VERSION__}`;
if (!nativ) {
  $('simWahl').hidden = false;
  $('sim').checked = true;
}

// ---- Zeichnen --------------------------------------------------------------------
let werkzeug = 'stift';
function leeren() {
  g.fillStyle = '#fff';
  g.fillRect(0, 0, BREITE, HOEHE);
  pruefeAbgleich();
}
function muster() {
  leeren();
  g.fillStyle = '#000';
  g.fillRect(0, 0, BREITE, 70);
  g.fillStyle = '#fff';
  g.font = 'bold 40px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(T('Hallo vom Fold', 'Hello from the Fold'), 24, 37);
  const jetzt = new Date();
  g.textAlign = 'right';
  g.font = '28px system-ui, sans-serif';
  g.fillText(uhrzeit(jetzt), BREITE - 24, 37);
  g.textAlign = 'left';
  g.fillStyle = '#000';
  g.font = '30px system-ui, sans-serif';
  g.fillText(jetzt.toLocaleDateString(lang(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 24, 120);
  g.font = '24px system-ui, sans-serif';
  g.fillText(T('Twin-Durchstich: Bild per BLE, Taste zurück.', 'Twin test: image via BLE, key press back.'), 24, 170);
  g.fillText(T('Drück ▲, ▼ oder tipp aufs Display.', 'Press ▲, ▼ or tap the display.'), 24, 210);
  // Raster unten zum Prüfen von Schärfe und Spiegelung
  for (let i = 0; i < 16; i++) {
    const x = 24 + i * 47;
    g.fillRect(x, 300, 1 + (i % 4) * 2, 140);
  }
  g.font = 'bold 22px system-ui, sans-serif';
  g.fillText('L', 6, HOEHE - 12);
  g.textAlign = 'right';
  g.fillText('R', BREITE - 6, HOEHE - 12);
  g.textAlign = 'left';
  pruefeAbgleich();
}
function textSetzen(t) {
  if (!t.trim()) return;
  leeren();
  g.fillStyle = '#000';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let groesse = 160;
  do { g.font = `bold ${groesse}px system-ui, sans-serif`; groesse -= 4; } while (g.measureText(t).width > BREITE - 60 && groesse > 20);
  g.fillText(t, BREITE / 2, HOEHE / 2);
  g.textAlign = 'left';
  pruefeAbgleich();
}

function punkt(e) {
  const r = leinwand.getBoundingClientRect();
  return [(e.clientX - r.left) * BREITE / r.width, (e.clientY - r.top) * HOEHE / r.height];
}
let zuletzt = null;
leinwand.addEventListener('pointerdown', (e) => {
  leinwand.setPointerCapture(e.pointerId);
  zuletzt = punkt(e);
  strich(zuletzt, zuletzt);
});
leinwand.addEventListener('pointermove', (e) => {
  if (!zuletzt) return;
  const p = punkt(e);
  strich(zuletzt, p);
  zuletzt = p;
});
const ende = () => { if (zuletzt) { zuletzt = null; pruefeAbgleich(); } };
leinwand.addEventListener('pointerup', ende);
leinwand.addEventListener('pointercancel', ende);
function strich(a, b) {
  g.strokeStyle = werkzeug === 'stift' ? '#000' : '#fff';
  g.lineWidth = werkzeug === 'stift' ? 6 : 36;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(...a);
  g.lineTo(...b);
  g.stroke();
}

document.querySelectorAll('[data-werkzeug]').forEach((b) => b.addEventListener('click', () => {
  werkzeug = b.dataset.werkzeug;
  document.querySelectorAll('[data-werkzeug]').forEach((x) => x.classList.toggle('an', x === b));
}));
$('leeren').onclick = leeren;
$('muster').onclick = muster;
$('textSetzen').onclick = () => textSetzen($('text').value);
$('text').addEventListener('keydown', (e) => { if (e.key === 'Enter') textSetzen($('text').value); });

const bildBytes = () => rgbaZu1bpp(g.getImageData(0, 0, BREITE, HOEHE).data);

// Zwilling-Abgleich: zeigt der Sticky genau das, was hier zu sehen ist?
function pruefeAbgleich() {
  const gleich = zwilling.gesendetCrc != null && crc32(bildBytes()) === zwilling.gesendetCrc;
  const p = $('abgleich');
  p.textContent = gleich ? T('gleich wie auf dem Sticky', 'same as on the Sticky') : (zwilling.geraet.seite === 'karte' ? T('Sticky zeigt Visitenkarte', 'Sticky shows business card') : T('Entwurf, nicht gesendet', 'Draft, not sent'));
  p.classList.toggle('gleich', gleich);
}

// ---- Ereignisse --------------------------------------------------------------------
const TASTEN = { up: '▲', down: '▼', ki: T('KI', 'AI') };
/** Gründe, die als Daten (deutsch) in der Notiz stehen, für die Anzeige */
const GRUND_EN = { 'zu kurz': 'too short', 'zu leise': 'too quiet', 'keine klare Sprache': 'no clear speech', 'nur Wörter der Liste': 'only words from the list', 'von Hand': 'by hand' };
const grundText = (g) => T(g, GRUND_EN[g] ?? g);
/** „(unklar)“ steht als Text in der Notiz (Daten), angezeigt wird es übersetzt */
const notizText = (t) => (t === '(unklar)' ? T(t, '(unclear)') : t);
function eintrag(text, fehler = false) {
  const li = document.createElement('li');
  li.className = fehler ? 'neu fehler' : 'neu';
  const zeit = document.createElement('time');
  zeit.textContent = uhrzeit(new Date(), true);
  li.append(zeit, text);
  $('ereignisse').prepend(li);
  while ($('ereignisse').children.length > 60) $('ereignisse').lastChild.remove();
}

let markeTimer = null;
function touchMarke(x, y) {
  ueber.clearRect(0, 0, BREITE, HOEHE);
  ueber.strokeStyle = '#e0b34a';
  ueber.fillStyle = 'rgba(224,179,74,.35)';
  ueber.lineWidth = 4;
  ueber.beginPath();
  ueber.arc(x, y, 26, 0, Math.PI * 2);
  ueber.fill();
  ueber.stroke();
  clearTimeout(markeTimer);
  markeTimer = setTimeout(() => ueber.clearRect(0, 0, BREITE, HOEHE), 1500);
}

// ---- Aufnahmen ----------------------------------------------------------------------
async function speichern(name, bytes) {
  if (!nativ) return null;
  // App-eigener Speicher: keine Berechtigung nötig, bleibt bis zur Deinstallation
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await Filesystem.writeFile({ path: `aufnahmen/${name}`, data: btoa(bin), directory: Directory.Data, recursive: true });
  return `aufnahmen/${name}`;
}

async function zeigeAufnahme(a) {
  const name = `sticky-${dateiZeit(a.start)}.wav`;   // Aufnahmezeit, ms-genau (vorher sekundengenau in UTC → überschrieben)
  const url = URL.createObjectURL(new Blob([a.wav], { type: 'audio/wav' }));
  const li = document.createElement('li');
  const kopf = document.createElement('div');
  kopf.textContent = `${(a.dauerMs / 1000).toFixed(1)} s · ${uhrzeit(new Date(), true)}`;
  const player = document.createElement('audio');
  player.controls = true;
  player.src = url;
  const werte = document.createElement('div');
  werte.className = 'werte';
  const verlust = a.fehlend + (a.geraet.verworfen || 0);
  const quote = a.pakete + verlust ? (100 * verlust / (a.pakete + verlust)).toFixed(1) : '0';
  werte.textContent = T(`${a.kbitS} kbit/s · ${a.pakete} Pakete · Verlust ${verlust} (${quote} %) · Spitze ${a.spitze}`, `${a.kbitS} kbit/s · ${a.pakete} packets · lost ${verlust} (${quote} %) · peak ${a.spitze}`);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.textContent = T('WAV laden', 'Download WAV');
  link.style.color = 'var(--akzent)';
  // Spracherkennung (Stufe 1: Handy, offline)
  const text = document.createElement('div');
  text.className = 'text warte';
  text.textContent = T('erkenne …', 'recognising …');
  const zeile = document.createElement('div');
  zeile.className = 'zeile';
  const kopieren = document.createElement('button');
  kopieren.textContent = T('Kopieren', 'Copy');
  kopieren.disabled = true;
  zeile.append(kopieren);
  li.append(kopf, text, zeile, player, werte);
  if (!nativ) zeile.append(link);
  const modell = $('modell').value;
  const tErk = performance.now();
  erkenne(a.pcm).then((r) => {
    const gesamt = Math.round(performance.now() - a.tLos);
    text.className = 'text';
    text.textContent = notizText(r.text) || T('(nichts erkannt)', '(nothing recognised)');
    kopieren.disabled = !r.text || !!r.unklar;
    kopieren.onclick = async () => {
      try { await Clipboard.write({ string: r.text }); kopieren.textContent = T('Kopiert ✓', 'Copied ✓'); } catch (e) { eintrag(T(`Kopieren fehlgeschlagen: ${e.message}`, `Copy failed: ${e.message}`), true); }
    };
    const zusatz = r.unklar ? T(` · nicht erkannt: ${r.unklar} (${r.pruefung?.dauerMs} ms, Spitze ${r.pruefung?.spitzeDb} dBFS, Grund ${r.pruefung?.grundDb} dBFS)`, ` · not recognised: ${grundText(r.unklar)} (${r.pruefung?.dauerMs} ms, peak ${r.pruefung?.spitzeDb} dBFS, floor ${r.pruefung?.grundDb} dBFS)`)
      : T(` · Text nach ${gesamt} ms (Erkennung ${r.ms} ms${r.ladeMs ? `, Laden ${r.ladeMs} ms` : ''}${r.zweiterLauf ? ', 2. Lauf wegen Wiederholung' : ''}, ${r.modell.replace('ggml-', '').replace('.bin', '')})`,
        ` · text after ${gesamt} ms (recognition ${r.ms} ms${r.ladeMs ? `, loading ${r.ladeMs} ms` : ''}${r.zweiterLauf ? ', 2nd run due to repetition' : ''}, ${r.modell.replace('ggml-', '').replace('.bin', '')})`);
    werte.textContent += zusatz;
    console.info('[sticky] sprache', JSON.stringify({ dauer: a.dauerMs, gesamt, erkennung: r.ms, laden: r.ladeMs, modell: r.modell, zweiter: r.zweiterLauf, text: r.text, umweg: Math.round(tErk - a.tLos) }));
    const spaet = Date.now() - a.start - a.dauerMs > VERSPAETET_MS;
    // Push-to-Talk (SPEC „Push-to-Talk“, Weg 1): frischer, sicher erkannter Text gleich in die Zwischenablage
    if (pttAblage() && r.text && !r.unklar && !spaet) {
      Clipboard.write({ string: r.text }).then(() => { kopieren.textContent = T('Kopiert ✓', 'Copied ✓'); eintrag(T('Diktat in der Zwischenablage', 'Dictation copied to clipboard')); }).catch((e) => eintrag(T(`Zwischenablage: ${e.message}`, `Clipboard: ${e.message}`), true));
    }
    neueNotiz({ t: a.start, art: 'diktat', text: r.text || '', ...(a.wer ? { geraet: a.wer } : {}), ...((a.sitzung ? a.sitzung.z : zwilling).geraet.fahrt ? { faehrt: true } : {}), ...(r.roh ? { roh: r.roh } : {}), ...(r.unklar ? { unklar: r.unklar } : {}), audio: nativ ? `aufnahmen/${name}` : name, dauerMs: a.dauerMs, ...(spaet ? { offline: true } : {}) },
      spaet ? null : a.ort, 'Diktat', a.sitzung);
  }).catch((e) => {
    text.className = 'text';
    text.textContent = T(`Erkennung fehlgeschlagen: ${e.message}`, `Recognition failed: ${e.message}`);
  });
  $('aufnahmen').prepend(li);
  // Latenz: Taste losgelassen → Wiedergabe startet
  player.addEventListener('playing', () => {
    const ms = Math.round(performance.now() - a.tLos);
    werte.textContent += T(` · Loslassen→Abspielen ${ms} ms`, ` · release→playback ${ms} ms`);
    console.info('[sticky] audio', JSON.stringify({ dauer: a.dauerMs, kbitS: a.kbitS, pakete: a.pakete, verlust, latenz: ms, spitze: a.spitze }));
  }, { once: true });
  player.play().catch(() => werte.textContent += T(' · (zum Abspielen ▶ tippen)', ' · (tap ▶ to play)'));
  try {
    const pfad = await speichern(name, a.wav);
    if (pfad) eintrag(T(`Aufnahme gespeichert: ${pfad}`, `Recording saved: ${pfad}`));
  } catch (e) { eintrag(T(`Speichern fehlgeschlagen: ${e.message}`, `Saving failed: ${e.message}`), true); }
}

// Der Sticky schlummert im Akkubetrieb nach 1 min ohne Bedienung (Firmware 0.8.0, ab 0.31.7 1 statt 2 min, schlaf.h) und meldet das vorher
let stickySchlaeft = false;
zwilling.beobachte((art, d) => {
  if (art === 'zustand') stickySchlaeft = false;
  if (art === 'aufnahmeLaeuft') { $('aufnahmeStatus').hidden = false; ortBeiAufnahme = notizen.standort(); }
  if (art === 'aufnahme') { $('aufnahmeStatus').hidden = true; d.ort = ortBeiAufnahme; zeigeAufnahme(d); }
  if (art === 'recorderLaeuft') eintrag(T(`Recorder läuft am Sticky (${d.datei})`, `Recorder running on the Sticky (${d.datei})`));
  if (art === 'recorder') recorderFertig(d).catch((e) => eintrag(T(`Recorder: ${e.message}`, `Recorder: ${e.message}`), true));
  if (art === 'zustand' && d.us != null && fwAb('0.31.0')) {   // Einheiten am Sticky geändert: Home neu zeichnen (°C/°F)
    const us = !!d.us;
    if (us !== letzteEinheitUs) { const vorher = letzteEinheitUs; letzteEinheitUs = us; setzeEinheitUs(us); if (vorher != null && zwilling.verbunden) abgleich().catch((e) => eintrag(e.message, true)); }
  }
  if (art === 'zustand' && d.en != null && stickyEnSetzen(d.en) && zwilling.verbunden) {   // Sprache am Sticky geändert (FW 0.32.0): Seiten neu
    eintrag(T('Sticky-Sprache geändert – Seiten werden neu gezeichnet', 'Sticky language changed – redrawing pages'));
    alleSeitenNeu().catch((e) => eintrag(e.message, true));
  }
  if (art === 'zustand') { zeigeZustand(d); if (d.modus) spiegelSetze({ modus: d.modus, w: d.w ?? '', lh: d.lh ?? (d.modus === 'home' || d.modus === 'notiz' ? 1 : 0), bb: d.bb ?? 0, zettel: d.zettel ?? 0, bat: d.bat, usb: !!d.usb, verbunden: true }); if (!spiegel.hatFoto()) fotoAnstossen(); }
  else if (art === 'log') { if (!(stickySchlaeft && /^(Verbinde mit|Connecting to)/.test(d))) eintrag(d); }   // schlummert: Versuche nicht mitschreiben
  else if (art === 'getrennt') {
    if (stickySchlaeft) eintrag(T('Sticky schlummert (spart Akku) – Taste weckt ihn, sonst meldet er sich zur vollen Stunde', 'Sticky is napping (saves battery) – a key wakes it, otherwise it checks in on the hour'));
    else eintrag(autoVerbinden ? T('Verbindung weg – versuche alle 15 s neu', 'Connection lost – retrying every 15 s') : T('Verbindung getrennt', 'Disconnected'), true);
    console.info('[sticky] getrennt');
    spiegelSetze({ verbunden: false, aufnahme: false });
    zeigeVerbindung();
    if (autoVerbinden && !wiederTimer) wiederTimer = setTimeout(wiederverbinden, 3000);
  }
  else if (art === 'ereignis') {
    if (d.t === 'key' && d.a === 'down') eintrag(T(`Taste ${TASTEN[d.k] || d.k} gedrückt`, `Key ${TASTEN[d.k] || d.k} pressed`));
    if (d.t === 'key' && d.a === 'up') fotoAnstossen();
    else if (d.t === 'touch' && d.a === 'down' && stickyModus === 'app') { appSeite.tipp(d.x, d.y).catch((e) => eintrag(T(`Spiel: ${e.message}`, `Game: ${e.message}`), true)); }
    else if (d.t === 'touch' && d.a === 'down') { eintrag(T(`Touch bei ${d.x}, ${d.y}`, `Touch at ${d.x}, ${d.y}`)); touchMarke(d.x, d.y); fahrtTouch(d.x, d.y, d.ms); }
    else if (d.t === 'pong') eintrag('Pong');
    else if (d.t === 'rec' && ['abspielen', 'pause', 'springe'].includes(d.a)) recorderFernbedienung(d).catch((e) => eintrag(T(`Anhören: ${e.message}`, `Playback: ${e.message}`), true));
    else if (d.t === 'suchen') handyKlingeln();
    else if (d.t === 'suche') eintrag(d.a === 'gefunden' ? T('Sticky gefunden', 'Sticky found') : T('Sticky piept', 'Sticky is beeping'));
    else if (d.t === 'schlaf') stickySchlaeft = true;
    else if (d.t === 'modus') { spiegelSetze({ modus: d.m, w: d.w ?? '', lh: d.lh ?? 0, ...(d.zettel != null ? { zettel: d.zettel } : {}), verbunden: true }); stickyModus = d.m; imBordbuch = d.m === 'bordbuch'; if (d.m !== 'app' && appSeite.frage) { appSeite.frage = null; eintrag(T('Rückfrage: nicht jetzt', 'Question: not now')); } fotoAnstossen(); eintrag(T('Modus: ', 'Mode: ') + ({ home: 'Home', notiz: T('Notiz', 'Note'), bordbuch: T('Bordbuch', 'Logbook'), kritzel: T('Kritzel', 'Doodle'), schrift: T('Schrift', 'Handwriting'), app: T('Spiel', 'Game'), widget: 'Widget', bestell: `${T('Zettel', 'List')} ${(d.zettel ?? 0) + 1}` }[d.m] ?? d.m)); if (d.m === 'app') { if (d.hoch != null) appSeite.hoch = !!d.hoch; } duellPruefen(); if (d.m === 'app' && !imDuell()) appSeite.zeigen().catch((e) => eintrag(T(`Spiel: ${e.message}`, `Game: ${e.message}`), true)); }
    else if (d.t === 'seite') { $('bbStatus').textContent = T(`Sticky zeigt Bordbuch-Seite ${d.n + 1} von ${d.von}`, `Sticky shows logbook page ${d.n + 1} of ${d.von}`); spiegelSetze({ bb: d.n }); }
    else if (d.t === 'audio' && (d.a === 'start' || d.a === 'stop')) spiegelSetze({ aufnahme: d.a === 'start' });
    else if (d.t === 'bordbuch') eintrag(T(`Bordbuch auf dem Sticky: ${d.seiten} Seiten, ${d.belegtKB} KB`, `Logbook on the Sticky: ${d.seiten} pages, ${d.belegtKB} KB`));
    else if (d.t === 'audio' && d.a === 'fehler') { eintrag(T(`Aufnahme nicht möglich: ${d.err}`, `Recording not possible: ${d.err}`), true); $('aufnahmeStatus').hidden = true; }
  }
});

function zeigeZustand(z) {
  const teile = [];
  if (z.bat >= 0) teile.push(`${T('Akku', 'Battery')} ${z.bat} %${z.chg ? ' ⚡' : ''}`);
  if (z.mtu) teile.push(`MTU ${z.mtu}`);
  if (z.phy) teile.push(z.phy === 2 ? '2M' : '1M');
  if (z.itvl) teile.push(`${(z.itvl * 1.25).toFixed(1)} ms`);
  if (z.fw) teile.push(`FW ${z.fw}`);
  if (z.temp > -99) teile.push(`${T(z.temp.toFixed(1).replace('.', ','), z.temp.toFixed(1))} °C, ${Math.round(z.rf)} %${z.temp - z.taupunkt < 2 ? T(' · beschlägt', ' · fogging up') : ''}`);
  if (z.fahrt) teile.push(T('fährt', 'driving'));
  $('geraet').textContent = teile.join(' · ');
  pruefeAbgleich();
}

function zeigeVerbindung() {
  geraeteZeigen();
  const an = zwilling.verbunden;
  $('status').textContent = an ? verbindung.name : T('getrennt', 'disconnected');
  $('status').className = `pille ${an ? 'ein' : 'aus'}`;
  $('verbinden').textContent = an ? T('Trennen', 'Disconnect') : wiederTimer ? T('Wiederverbinden stoppen', 'Stop reconnecting') : T('Verbinden', 'Connect');
  $('verbinden').classList.toggle('haupt', !an);
  $('senden').disabled = !an;
  $('fahrtZeigen').disabled = !an;
  $('homeZeigen').disabled = !an;
  $('stickySuchen').disabled = !an;
  $('bestellZeigen').disabled = !an;
  for (const id of ['bbAufspielen', 'bbZeigen']) $(id).disabled = !an;
  if (an) $('bbAufspielen').disabled = !pdf && !$('spickzettel').value.trim();
  $('karte').disabled = !an;
  $('simTasten').hidden = !(an && verbindung instanceof SimVerbindung);
  if (!an) $('geraet').textContent = '';
}

// ---- Bedienung ----------------------------------------------------------------------
// Wiederverbinden: Reißt die Verbindung ab (Funkloch, Fold zu weit weg), versucht die App es alle 15 s erneut,
// bis der Nutzer selbst „Trennen“ tippt. Der Vordergrund-Dienst hält sie dabei am Leben.
let autoVerbinden = false;
let wiederTimer = 0;
/** Bluetooth-Adresse des gemerkten Sticky für den nativen Wecker (StickyDienst) */
function stickyAdresse() {
  return geraete().map((x) => x.id).join(',') || null;   // Stufe 2: Wecker für alle bekannten Stickys
}

// Wecker: Der Dienst merkt per autoConnect, dass der Sticky wieder funkt, und weckt die App (12.11.2026: im Doze
// standen die Zeitgeber 15 min still, die ganze Rückfahrt lief offline)
Promise.resolve().then(() => Hintergrund.addListener('sticky', (e) => {
  if (!e.da || !autoVerbinden) return;
  const s = e.adresse && sitzungen.get(e.adresse);
  if (s) { if (!s.z.verbunden) { clearTimeout(s.timer); hgVerbinden(s); } return; }   // ein Hintergrund-Sticky
  if (zwilling.verbunden) return;
  console.info('[sticky] Wecker: Sticky funkt wieder');
  clearTimeout(wiederTimer);
  wiederverbinden();
})).catch(() => {});   // im Browser gibt es den Dienst nicht

let verbindeGerade = false;
// 13.11.2026: Nach mehrfachem Flashen hing ein Verbindungsversuch (kein BLE-Aufruf mehr ab 12:24); verbindeGerade blieb
// stehen, jeder weitere Versuch brach sofort ab, bis die App neu startete. Darum Frist für den ganzen Versuch und ein Wächter.
const VERBINDEN_FRIST_MS = 25000;
let letzterVersuch = 0;
function mitFrist(p, ms, was) {
  let zeit;
  return Promise.race([p, new Promise((_, nein) => { zeit = setTimeout(() => nein(new Error(T(`${was}: keine Antwort nach ${ms / 1000} s`, `${was}: no answer after ${ms / 1000} s`))), ms); })])
    .finally(() => clearTimeout(zeit));
}

async function wiederverbinden() {
  wiederTimer = 0;
  if (!autoVerbinden || zwilling.verbunden || verbindeGerade || !(verbindung instanceof BleVerbindung)) return;
  verbindeGerade = true;
  letzterVersuch = Date.now();
  try {
    await mitFrist(verbindung.verbinden({ nurGemerkt: true }), VERBINDEN_FRIST_MS, T('Verbinden', 'Connect')).catch(async (e) => {
      await verbindung.abbrechen?.().catch(() => {});   // halbe Verbindung lösen, sonst blockiert sie den nächsten Versuch
      throw e;
    });
    eintrag(T(`Wieder verbunden mit ${verbindung.name}`, `Reconnected to ${verbindung.name}`));
    console.info('[sticky] wieder verbunden');
    zeigeVerbindung();
    abgleich().catch((e) => eintrag(T(`Abgleich: ${e.message}`, `Sync: ${e.message}`), true));
  } catch {
    clearTimeout(wiederTimer);
    wiederTimer = setTimeout(wiederverbinden, 5000);   // 12.11.2026: 15 s Pause ließ einen per Taste geweckten Sticky bis ~20 s warten
  } finally {
    verbindeGerade = false;
  }
}

/** Hintergrund-Sitzungen (Multiclient Stufe 2, unten): MAC → { g, z, v, timer, zuletzt, modus, ort, laeuft } */
const sitzungen = new Map();
// ---- Stickys (Multiclient Stufe 1, 14.11.2026): Liste, Profil, Wechseln ---------------------------------------
// Wechseln lädt die App neu: alle Felder, Bilder und der Abgleich kommen dann sauber aus Profil und Gerät des neuen Sticky.
async function wechselnZu(id, grund) {
  autoVerbinden = false;
  clearTimeout(wiederTimer);
  wiederTimer = 0;
  if (zwilling.verbunden) await verbindung.trennen().catch(() => {});
  await hintergrundStoppen();
  await Hintergrund.stop().catch(() => {});
  if (id) aktivSetzen(id);
  try { sessionStorage.setItem('sticky.grund', grund); } catch { /* egal */ }
  location.reload();
}
function geraeteZeigen() {
  const ul = $('geraeteListe');
  ul.textContent = '';
  const liste = geraete(), aktiv = aktivesGeraet();
  if (!liste.length) { ul.innerHTML = T('<li class="klein">Noch kein Sticky – auf dem Sticky-Tab „Verbinden“ tippen.</li>', '<li class="klein">No Sticky yet – tap “Connect” on the Sticky tab.</li>'); return; }
  for (const g of liste) {
    const istAktiv = g.id === aktiv?.id;
    const li = document.createElement('li');
    li.classList.toggle('aktiv', istAktiv);
    const name = Object.assign(document.createElement('input'), { value: g.name, title: 'Name' });
    name.onchange = async () => {
      const altKurz = kurz(g);
      geraetAendern(g.id, { name: name.value.trim() || g.name });
      const neuKurz = kurz(geraete().find((x) => x.id === g.id));
      // Logs weiterer Stickys liegen im Unterordner mit Kurznamen: beim Umbenennen mit umziehen
      if (nativ && neuKurz !== altKurz) for (const o of [LOG_ORDNER, 'messreihen']) {
        await Filesystem.rename({ from: `${o}/${altKurz}`, to: `${o}/${neuKurz}`, directory: Directory.Data, toDirectory: Directory.Data }).catch(() => {});
      }
      geraeteZeigen();
    };
    const profil = document.createElement('select');
    profil.title = T('Profil', 'Profile');
    profil.innerHTML = Object.keys(PROFILE).map((k) => `<option value="${k}">${profilName(k)}</option>`).join('');
    profil.value = g.profil;
    profil.onchange = () => {
      geraetAendern(g.id, { profil: profil.value });
      if (istAktiv) wechselnZu(null, T(`Profil „${profilName(profil.value)}“ für ${g.name}`, `Profile “${profilName(profil.value)}” for ${g.name}`));
    };
    const link = Object.assign(document.createElement('input'), { value: g.link ?? '', placeholder: T('Link für den QR-Code auf Home (leer = keiner)', 'Link for the QR code on Home (empty = none)'), title: T('QR-Code auf Home', 'QR code on Home') });
    link.onchange = () => {
      geraetAendern(g.id, { link: link.value.trim() || undefined });
      if (istAktiv && zwilling.verbunden) abgleich().catch((e) => eintrag(e.message, true));
      else { const s = sitzungen.get(g.id); if (s?.z.verbunden) hintergrundAbgleich(s).catch(() => {}); }
    };
    const mac = Object.assign(document.createElement('span'), { className: 'klein', textContent: g.id });
    const hg = sitzungen.get(g.id);
    if (hg) mac.textContent += hg.z.verbunden ? `${T(' · im Hintergrund verbunden', ' · connected in background')}${hg.z.geraet.bat != null ? ` · ${T('Akku', 'Battery')} ${hg.z.geraet.bat} %` : ''}`
      : hg.zuletzt ? ` · ${T('zuletzt', 'last')} ${uhrzeit(new Date(hg.zuletzt))}` : T(' · wartet auf den Sticky', ' · waiting for the Sticky');
    else if (istAktiv && zwilling.verbunden && zwilling.geraet.bat != null) mac.textContent += ` · ${T('Akku', 'Battery')} ${zwilling.geraet.bat} %`;
    const knopf = Object.assign(document.createElement('button'), { textContent: istAktiv ? (zwilling.verbunden ? T('● verbunden', '● connected') : T('● aktiv', '● active')) : T('Wechseln', 'Switch') });
    knopf.disabled = istAktiv;
    knopf.onclick = () => wechselnZu(g.id, T(`Gewechselt zu ${g.name}`, `Switched to ${g.name}`));
    const weg = Object.assign(document.createElement('button'), { textContent: T('Vergessen', 'Forget') });
    weg.onclick = async () => {
      if (!confirm(T(`${g.name} vergessen? Sein Abgleich-Stand in der App wird gelöscht; das Profil bleibt.`, `Forget ${g.name}? Its sync state in the app is deleted; the profile stays.`))) return;
      // Vor der Weitergabe: auch auf dem Sticky alles Persönliche löschen (Karte /soll und /ist, interner Speicher)
      const z = istAktiv ? zwilling : sitzungen.get(g.id)?.z;
      const kannLeeren = z?.verbunden && baue(istAktiv ? null : sitzungen.get(g.id), () => fwAb('0.31.6'));
      if (kannLeeren && confirm(T(`Auch ${g.name} selbst leeren? Notizen, Zettel, Bordbuch, Visitenkarte und alles auf der Karte werden dort gelöscht – zum Weitergeben. Danach startet er neu und ist leer.`,
        `Also wipe ${g.name} itself? Notes, lists, logbook, business card and everything on the card are deleted there – for passing it on. It then restarts empty.`))) {
        try {
          const r = await z.leeren();
          eintrag(T(`${g.name} geleert (${r.dateien} Dateien auf der Karte${r.ok ? ', interner Speicher formatiert' : ', interner Speicher NICHT formatiert'})`,
            `${g.name} wiped (${r.dateien} files on the card${r.ok ? ', internal storage formatted' : ', internal storage NOT formatted'})`), !r.ok);
        } catch (e) { eintrag(T(`${g.name} leeren: ${e.message}`, `Wipe ${g.name}: ${e.message}`), true); return; }
      } else if (!kannLeeren) eintrag(T(`${g.name}: zum Leeren muss er verbunden sein (Firmware ab 0.31.6) – sonst bleibt seine Karte, wie sie ist`, `${g.name}: to wipe it, it must be connected (firmware 0.31.6 or later) – otherwise its card stays as it is`));
      const s = sitzungen.get(g.id);
      if (s) { s.weg = true; clearTimeout(s.timer); await s.v.trennen().catch(() => {}); sitzungen.delete(g.id); }
      geraetVergessen(g.id);
      if (istAktiv) wechselnZu(null, T(`${g.name} vergessen`, `${g.name} forgotten`)); else geraeteZeigen();
    };
    li.append(name, profil, link, mac, knopf, weg);
    ul.append(li);
  }
}
$('geraetNeu').onclick = async () => {
  const knopf = $('geraetNeu');
  knopf.disabled = true;
  knopf.textContent = T('Suche neuen Sticky …', 'Looking for a new Sticky …');
  try {
    autoVerbinden = false;
    clearTimeout(wiederTimer);
    if (zwilling.verbunden) await verbindung.trennen().catch(() => {});
    verbindung = new BleVerbindung();
    zwilling.anbinden(verbindung);
    await verbindung.verbinden({ neu: true });   // bekannte Stickys werden übersprungen; der neue wird aktiv
    await verbindung.trennen().catch(() => {});
    await wechselnZu(null, T(`${verbindung.name} hinzugefügt (Profil „EDC“, in der Liste änderbar)`, `${verbindung.name} added (profile “EDC”, can be changed in the list)`));
  } catch (e) {
    eintrag(T(`Sticky hinzufügen: ${e.message || e}`, `Add Sticky: ${e.message || e}`), true);
    knopf.disabled = false;
    knopf.textContent = T('Sticky hinzufügen', 'Add Sticky');
  }
};
geraeteZeigen();
try { const grund = sessionStorage.getItem('sticky.grund'); if (grund) { sessionStorage.removeItem('sticky.grund'); setTimeout(() => eintrag(grund), 0); } } catch { /* egal */ }

$('verbinden').onclick = async () => {
  const knopf = $('verbinden');
  if (zwilling.verbunden || wiederTimer) {
    autoVerbinden = false;
    clearTimeout(wiederTimer);
    wiederTimer = 0;
    Hintergrund.stop().catch(() => {});
    if (zwilling.verbunden) await verbindung.trennen();
    await hintergrundStoppen();
    zeigeVerbindung();
    return;
  }
  knopf.disabled = true;
  knopf.textContent = T('Suche …', 'Searching …');
  try {
    verbindung = !nativ && $('sim').checked ? new SimVerbindung() : new BleVerbindung();
    zwilling.anbinden(verbindung);
    await verbindung.verbinden();
    eintrag(T(`Verbunden mit ${verbindung.name} (MTU ${verbindung.mtu})`, `Connected to ${verbindung.name} (MTU ${verbindung.mtu})`));
    autoVerbinden = true;
    Hintergrund.start({ text: T('Notizen und Diktate kommen an', 'Notes and dictations arrive'), adresse: stickyAdresse() }).catch((e) => eintrag(T(`Hintergrund-Dienst: ${e.message}`, `Background service: ${e.message}`), true));
    abgleich().catch((e) => eintrag(T(`Abgleich: ${e.message}`, `Sync: ${e.message}`), true));
    hintergrundStarten();
  } catch (e) {
    eintrag(T(`Verbinden fehlgeschlagen: ${e.message || e}`, `Connecting failed: ${e.message || e}`), true);
  } finally {
    knopf.disabled = false;
    zeigeVerbindung();
  }
};

$('senden').onclick = async () => {
  const knopf = $('senden');
  knopf.disabled = true;
  knopf.textContent = T('Sende …', 'Sending …');
  const balken = $('balken').firstElementChild;
  try {
    const m = await zwilling.sendeBild(bildBytes(), {
      schnell: $('schnell').checked,
      fortschritt: (f) => { balken.style.width = `${Math.round(f * 100)}%`; },
    });
    const text = T(`Bild angekommen: Funk ${m.funk} ms (Anlauf ${m.anlauf} ms${m.warSchnell ? '' : ', nicht schnell'}), Anzeige ${m.anzeige} ms, gesamt ${m.gesamt} ms`,
      `Image arrived: radio ${m.funk} ms (start-up ${m.anlauf} ms${m.warSchnell ? '' : ', not fast'}), display ${m.anzeige} ms, total ${m.gesamt} ms`)
      + ` · ${m.rahmen}×${m.nutzlast} B, MTU ${m.mtu}, ${m.phy === 2 ? '2M' : '1M'}, DLE ${m.dle ?? '?'}`;
    eintrag(text);
    $('messung').textContent = T(`Letztes Bild: ${m.funk} ms Funk, ${m.gesamt} ms gesamt`, `Last image: ${m.funk} ms radio, ${m.gesamt} ms total`);
    console.info('[sticky] messung', JSON.stringify(m));
  } catch (e) {
    eintrag(e.message || String(e), true);
  } finally {
    knopf.textContent = T('Senden', 'Send');
    knopf.disabled = !zwilling.verbunden;
    setTimeout(() => { balken.style.width = '0'; }, 800);
    pruefeAbgleich();
  }
};

$('karte').onclick = async () => {
  try { await zwilling.zeigeKarte(); eintrag(T('Visitenkarte angefordert', 'Business card requested')); } catch (e) { eintrag(e.message, true); }
};

document.querySelectorAll('[data-taste]').forEach((b) => {
  b.addEventListener('pointerdown', () => verbindung?.tasteRunter?.(b.dataset.taste));
  b.addEventListener('pointerup', () => verbindung?.tasteHoch?.(b.dataset.taste));
});
// Im Simulator: Tippen mit gedrückter Alt-Taste aufs Bild = Touch am Sticky
leinwand.addEventListener('click', (e) => {
  if (e.altKey && verbindung instanceof SimVerbindung) verbindung.touch(...punkt(e).map(Math.round));
});

// Modellwahl (gemerkt), beim Start vorladen, damit die erste Erkennung nicht aufs Laden wartet
for (const m of MODELLE) $('modell').append(new Option(m.name, m.datei));
try { $('modell').value = localStorage.getItem('sticky.modell') || MODELLE[0].datei; } catch { /* egal */ }
const vorladen = () => Spracherkennung.vorladen({ modell: $('modell').value })
  .then((r) => r?.ladeMs && eintrag(T(`Sprachmodell geladen (${r.ladeMs} ms)`, `Speech model loaded (${r.ladeMs} ms)`)))
  .catch((e) => eintrag(T(`Sprachmodell fehlt: ${e.message}`, `Speech model missing: ${e.message}`), true));
$('modell').onchange = () => { try { localStorage.setItem('sticky.modell', $('modell').value); } catch { /* egal */ } vorladen(); };
vorladen();

// ---- Fahrt: Testnotizen (SPEC „MVP 1“) -----------------------------------------------
let ortBeiAufnahme = null;
let stickyModus = null;
// App-Seite im Karussell (FW ≥ 0.17.0): die App zeichnet den Rechner, der Sticky meldet die Tipper
// Burgduell auf zwei Stickys (14.11.2026): zeigen beide die Spielseite, spielt West am aktiven, Ost am Hintergrund-Sticky;
// beide App-Seiten teilen denselben Spielstand, jedes Bild geht dann an beide.
const appBild = (z, bytes, bereich) => z.sendeBild(bytes, bereich ? { bereich } : { schnell: false });
const duellSitzung = () => { for (const s of sitzungen.values()) if (s.z.verbunden && s.modus === 'app') return s; return null; };
const imDuell = () => !!appSeite.zustand[0]?.zweiSticky && appSeite.aktiv === 0;
const appSeite = new AppSeite(async (bytes, bereich) => {
  const ziele = stickyModus === 'app' && zwilling.verbunden ? [zwilling] : [];
  const s = imDuell() ? duellSitzung() : null;
  if (s) ziele.push(s.z);
  await Promise.all(ziele.map((z) => appBild(z, bytes, bereich)));
});
const appSeiteHg = new AppSeite(async (bytes, bereich) => {
  const s = appSeiteHg.sitzung, ziele = s?.z.verbunden ? [s.z] : [];
  if (imDuell() && stickyModus === 'app' && zwilling.verbunden) ziele.push(zwilling);
  await Promise.all(ziele.map((z) => appBild(z, bytes, bereich)));
});
appSeiteHg.zustand = appSeite.zustand;   // derselbe Spielstand
appSeiteHg.spieler = 1;
/** Duell an, sobald beide Stickys die Spielseite zeigen; aus, sobald einer sie verlässt */
function duellPruefen() {
  const spiel = appSeite.zustand[0], s = duellSitzung();
  const an = !!s && stickyModus === 'app' && zwilling.verbunden;
  if (an && !spiel.zweiSticky) {
    appSeite.aktiv = 0; appSeiteHg.aktiv = 0;
    appSeiteHg.hoch = appSeite.hoch; appSeiteHg.sitzung = s;
    spiel.duell([kurz(aktivesGeraet()), kurz(s.g)]);
    eintrag(T(`Burgduell: ${kurz(aktivesGeraet())} gegen ${kurz(s.g)}`, `Castle duel: ${kurz(aktivesGeraet())} vs ${kurz(s.g)}`));
    appSeite.zeigen().catch((e) => eintrag(T(`Burgduell: ${e.message}`, `Castle duel: ${e.message}`), true));
  } else if (!an && spiel.zweiSticky) {
    spiel.solo();
    if (stickyModus === 'app') appSeite.zeigen().catch(() => {});
  }
}
let fahrtCrc = null;
const knoepfe = () => {
  const roh = bauZ ? (localStorage.getItem(schluessel('knoepfe')) ?? '') : $('knoepfe').value;
  const l = roh.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 5);
  return l.length ? l : STANDARD_KNOEPFE;
};
try { $('knoepfe').value = localStorage.getItem(schluessel('knoepfe')) || STANDARD_KNOEPFE.join(', '); } catch { $('knoepfe').value = STANDARD_KNOEPFE.join(', '); }
$('knoepfe').onchange = () => {
  try { localStorage.setItem(schluessel('knoepfe'), knoepfe().join(', ')); } catch { /* egal */ }
  if (zwilling.verbunden) abgleich().catch((e) => eintrag(e.message, true));
};

// Notizen per Touch nur, wenn der Sticky die Notiz-Seite zeigt (Modus meldet die Firmware)
const fahrtAktiv = () => stickyModus === 'notiz';

async function zeigeFahrtSeite() {
  zeichneFahrt(g, knoepfe());
  const bytes = bildBytes();
  fahrtCrc = crc32(bytes);
  pruefeAbgleich();
  const m = await zwilling.sendeBild(bytes, { schnell: false });
  eintrag(T(`Fahrt-Seite gezeigt (${m.gesamt} ms)`, `Trip page shown (${m.gesamt} ms)`));
  pruefeAbgleich();
}
$('fahrtZeigen').onclick = () => zwilling.modusSetzen(2).catch((e) => eintrag(e.message, true));
$('homeZeigen').onclick = () => zwilling.modusSetzen(0).catch((e) => eintrag(e.message, true));
// Gegenseitig suchen (FW ≥ 0.25.0): Knopf lässt den Sticky piepen; KI 3× am Sticky lässt das Handy klingeln
$('stickySuchen').onclick = () => {
  if (!fwAb('0.25.0')) { eintrag(T('Sticky suchen braucht Firmware 0.25.0', 'Find Sticky needs firmware 0.25.0'), true); return; }
  zwilling.suchen(30).then(() => eintrag(T('Sticky piept – Taste am Sticky drücken, wenn gefunden', 'Sticky is beeping – press a key on the Sticky once found'))).catch((e) => eintrag(e.message, true));
};
function handyKlingeln() {
  eintrag(T('Sticky sucht das Handy', 'Sticky is looking for the phone'));
  $('handyRuhe').hidden = false;
  Hintergrund.klingeln({ sekunden: 20 }).catch((e) => eintrag(e.message, true));
  setTimeout(() => { $('handyRuhe').hidden = true; }, 20000);
}
$('handyRuhe').onclick = () => { Hintergrund.ruhe().catch(() => {}); $('handyRuhe').hidden = true; };
$('bestellZeigen').onclick = () => zwilling.modusSetzen(3).catch((e) => eintrag(e.message, true));
// Zettel (13.11.2026): ein Feld für Bestellzettel und QR-Karten; einmaliger Umzug aus den alten zwei Feldern
function zettelLaden() {
  try {
    const neu = localStorage.getItem(schluessel('zettel'));
    if (neu != null) return neu;
    const umgezogen = zettelUmzug(localStorage.getItem(schluessel('bestellung')) || BESTELL_STANDARD, localStorage.getItem(schluessel('karten')), KARTEN_STANDARD);
    localStorage.setItem(schluessel('zettel'), umgezogen);   // alte Schlüssel bleiben als Sicherung liegen
    return umgezogen;
  } catch { return BESTELL_STANDARD; }
}
$('zettelText').value = zettelLaden();
$('zettelText').onchange = () => {
  try { localStorage.setItem(schluessel('zettel'), $('zettelText').value); } catch { /* egal */ }
  const bloecke = ($('zettelText').value.match(/^## /gm) ?? []).length;
  if (bloecke > 6) eintrag(T(`Zettel: ${bloecke} eingetragen, der Sticky zeigt nur die ersten 6`, `Lists: ${bloecke} entered, the Sticky only shows the first 6`), true);
  if (zwilling.verbunden) abgleich().catch((e) => eintrag(e.message, true));   // geänderte Zettel gleich aufspielen
};
$('zettelStandard').onclick = () => { $('zettelText').value = BESTELL_STANDARD; $('zettelText').onchange(); };
/** Alle Zettel in der Reihenfolge am Sticky (höchstens 6): mit QR eine Karte, sonst ein Bestellzettel */
function alleZettel() {
  const l = zettelListe(bauZ ? zettelLaden() : $('zettelText').value);
  return l.map((x, i) => ({ zeichne: (g) => (x.qr ? zeichneKarte(g, x, i + 1, l.length) : zeichneZettel(g, x, i + 1, l.length)) }));
}

async function fahrtTouch(x, y, ms) {
  if (!fahrtAktiv()) return;
  const i = trefferKnopf(x, y, knoepfe());
  if (i < 0) return;
  const k = knoepfe()[i];
  const t = ms > 1.7e12 ? ms : Date.now();
  const spaet = Date.now() - t > VERSPAETET_MS;
  await neueNotiz({ t, art: 'knopf', knopf: k, ...(spaet ? { offline: true } : {}) }, spaet ? null : notizen.standort(), k);
}

/** Notiz speichern, in der Liste zeigen und am Sticky kurz bestätigen */
async function neueNotiz(teile, ortPromise, kurz, s = null) {
  const ort = await (ortPromise ?? null);
  let n;
  try { n = await notizen.notiere(teile, ort); } catch (e) { eintrag(T(`Notiz nicht gespeichert: ${e.message}`, `Note not saved: ${e.message}`), true); return; }
  zeigeNotiz(n, true);
  const modus = s ? s.modus : stickyModus;   // Hintergrund-Sticky: Bestätigung an IHN, nicht an den aktiven
  if (modus === 'notiz' || modus === 'home') {   // Rückmeldefeld gibt es auf beiden Seiten
    const zeit = uhrzeit(n.t);
    const r = rueckmeldung(`✓ ${kurz} ${zeit}`);
    if (!s) spiegel.meldung(`✓ ${kurz} ${zeit}`);
    (s?.z ?? zwilling).sendeBild(r.bytes, { bereich: r.bereich }).catch((e) => eintrag(T(`Rückmeldung: ${e.message}`, `Confirmation: ${e.message}`), true));
  }
}

function zeigeNotiz(n, neu = false) {
  const li = document.createElement('li');
  li.className = `${n.art}${neu ? ' neu' : ''}`;
  const kopf = document.createElement('div');
  kopf.className = 'kopf';
  const ort = n.lat != null ? `${n.lat.toFixed(5)}, ${n.lon.toFixed(5)} (±${n.gen} m)` : n.offline ? T('ohne Handy aufgenommen', 'recorded without phone') : T('ohne GPS', 'no GPS');
  kopf.textContent = `${uhrzeit(n.t, true)} · ${ort}`;
  // Sorte als Schild; Antippen schaltet weiter (von Hand gilt dann)
  const schild = document.createElement('span');
  schild.className = `sorte ${n.sorte ?? 'eingang'}`;
  const schildText = () => { schild.textContent = SORTEN[n.sorte ?? 'eingang'].name; schild.title = `${SORTEN[n.sorte ?? 'eingang'].ziel}${n.sorteGrund ? ` · ${grundText(n.sorteGrund)}` : ''}`; };
  schildText();
  schild.onclick = async (e) => {
    e.stopPropagation();
    const neu = naechsteSorte(n.sorte ?? 'eingang');
    try { await notizen.setzen(n.t, (x) => { x.sorte = neu; x.sorteGrund = 'von Hand'; }); } catch (err) { eintrag(T(`Sorte nicht gespeichert: ${err.message}`, `Category not saved: ${err.message}`), true); return; }
    n.sorte = neu; n.sorteGrund = 'von Hand';
    schildText();
  };
  kopf.append(' ', schild);
  const was = document.createElement('div');
  was.className = 'was';
  was.textContent = n.art === 'diktat' || n.art === 'recorder' ? `${n.art === 'recorder' ? `⏺ ${Math.round((n.dauerMs ?? 0) / 60000)} min · ` : '🎙 '}${notizText(n.text) || T('(nichts erkannt)', '(nothing recognised)')}` : n.art === 'kritzel' ? T('✎ Kritzel', '✎ Doodle') : n.art === 'schrift' ? `✍ ${n.text}` : n.knopf;
  if (n.art === 'kritzel' && n.bild) {
    const img = document.createElement('img');
    img.className = 'kritzel';
    img.alt = T('Kritzel vom Sticky', 'Doodle from the Sticky');
    const name = n.bild.split('/').pop();
    (nativ ? Filesystem.readFile({ path: n.bild, directory: Directory.Data }).then((r) => r.data) : Promise.resolve(kritzelSim[name]))
      .then((b64) => { if (b64) img.src = `data:image/png;base64,${b64}`; }).catch(() => {});
    was.append(img);
  }
  if (n.art === 'diktat' && n.text) {
    // Korrigieren direkt in der Liste (13.11.2026: der Android-Dialog von window.prompt verschwand und speicherte leer)
    was.title = T('Antippen zum Korrigieren', 'Tap to correct');
    was.onclick = () => {
      if (li.querySelector('textarea')) return;
      const feld = Object.assign(document.createElement('textarea'), { value: n.text, rows: 3 });
      feld.style.width = '100%';
      const ok = Object.assign(document.createElement('button'), { textContent: T('Speichern', 'Save'), className: 'haupt' });
      const weg = Object.assign(document.createElement('button'), { textContent: T('Abbrechen', 'Cancel') });
      const leiste = document.createElement('div');
      leiste.className = 'leiste';
      leiste.append(ok, weg);
      was.hidden = true;
      li.append(feld, leiste);
      feld.focus();
      const schliessen = () => { feld.remove(); leiste.remove(); was.hidden = false; };
      weg.onclick = schliessen;
      ok.onclick = async () => {
        const neu = feld.value.replace(/\s*\n\s*/g, ' ').trim();   // Enter im Feld ist kein Absatz
        if (!neu || neu === n.text) { schliessen(); return; }   // leer zählt als Abbrechen
        const gelernt = lernen(n.text, neu, woerter().split(','));
        try { await notizen.aendern(n.t, neu); } catch (e) { eintrag(T(`Ändern fehlgeschlagen: ${e.message}`, `Change failed: ${e.message}`), true); return; }
        n.text = neu;
        was.textContent = `🎙 ${n.text}`;
        schliessen();
        if (gelernt.length) {
          $('woerterbuch').value = paareText(einpflegen(woerterbuch(), gelernt));
          $('woerterbuch').onchange();
          eintrag(`${T('Gelernt', 'Learned')}: ${gelernt.map((p) => `${p.falsch} → ${p.richtig}`).join(', ')}`);
        }
      };
    };
  }
  li.append(kopf, was);
  $('notizen').prepend(li);
}

// ---- Ohne Handy: Abgleich und Puffer abholen ------------------------------------------------
/** Nach dem Verbinden: Uhr stellen, Fahrt-Layout + Rückmeldungen für den Offline-Betrieb aufspielen, Puffer abholen */
let vordergrundGleichtAb = false;   // der Hintergrund lässt dem aktiven Sticky den Vortritt (Funk teilen)
async function abgleich() {
  vordergrundGleichtAb = true;
  try { await fuerSticky(abgleichKern); } finally { vordergrundGleichtAb = false; }
}
/** Sprache am Sticky (oder in der App) gewechselt: alles neu zeichnen und abgleichen; läuft schon einer, danach noch einmal */
let seitenNeuNochmal = false;
async function alleSeitenNeu() {
  if (vordergrundGleichtAb) { seitenNeuNochmal = true; return; }
  do {
    seitenNeuNochmal = false;
    await abgleich();
    if (stickyModus === 'app') await fuerSticky(() => appSeite.zeigen());
  } while (seitenNeuNochmal);
}
async function abgleichKern() {
  if (!zwilling.geraet.fw || zwilling.geraet.fw === 'sim' || zwilling.geraet.fahrtv == null) return;   // braucht Firmware 0.5
  await zwilling.zeitSetzen();
  const text = layoutText(knoepfe());
  const version = crc32(new TextEncoder().encode(text)).toString(16).padStart(8, '0');
  // Home-Karte, Notiz-Seite und Ziffernblatt (einmalig, wenn sich etwas geändert hat)
  // Wetter für die Home-Karte (bei Fehler bleibt die letzte Vorhersage)
  const ort = await notizen.standort();
  const wetter = (await holeWetter(ort)) ?? letztesWetter();
  zeichneHome(g, karteFuer(aktivesGeraet(), KARTE), null, wetter, homeHinweise());
  const home = bildBytes();
  zeichneFahrt(g, knoepfe());
  const notiz = bildBytes();
  zeichneZiffern(g);
  const ziffern = bildBytes();
  // Bestellzettel und Karten in einer Reihe (▼ auf Home): erst die Zettel, dann die Karten
  const zettelBilder = alleZettel().map((z) => { z.zeichne(g); return bildBytes(); });
  const alle = [home, notiz, ziffern, ...zettelBilder];
  const homeV = crc32(new Uint8Array(alle.flatMap((b) => [...b]))).toString(16).padStart(8, '0') + ';' + zettelBilder.length;
  if (zwilling.geraet.homev !== homeV && fwAb('0.11.0')) {
    // Datei-Abgleich: nur geänderte Bilder (Bestandsliste auf der Karte), version.txt zuletzt löst das Neuladen aus
    const st = statusGlyphen();
    const dateien = alle.map((b, i) => ({ n: `${i}.bin`, daten: b }))
      .concat([{ n: 'status-quer.bin', daten: st.quer }, { n: 'status-hoch.bin', daten: st.hoch }, { n: 'version.txt', daten: new TextEncoder().encode(homeV) }]);
    const n = await zwilling.sollAbgleich('home', dateien);
    eintrag(T(`Home: ${n} Dateien aufgespielt`, `Home: ${n} files uploaded`));
  } else if (zwilling.geraet.homev !== homeV) {
    // Nur geänderte Bilder senden (das Wetter ändert meist nur die Karte); unbekannt → alle
    let alt = null;
    try { alt = JSON.parse(localStorage.getItem(schluessel('homecrcs')) || 'null'); } catch { /* egal */ }
    const crcs = alle.map((b) => crc32(b));
    const vollstaendig = !alt || alt.version !== zwilling.geraet.homev || alt.crcs.length !== crcs.length;
    for (let i = 0; i < alle.length; i++) if (vollstaendig || alt.crcs[i] !== crcs[i]) await zwilling.sendeBild(alle[i], { home: i });
    await zwilling.homeVersion(homeV);
    try { localStorage.setItem(schluessel('homecrcs'), JSON.stringify({ version: homeV, crcs })); } catch { /* egal */ }
    eintrag(T(`Home-Karte, Notiz-Seite, Uhr und ${zettelBilder.length} Zettel/Karten aufgespielt`, `Home card, note page, clock and ${zettelBilder.length} lists/cards uploaded`));
  }
  zeichneHome(g, karteFuer(aktivesGeraet(), KARTE), uhrzeit(new Date()), wetter, homeHinweise());
  pruefeAbgleich();
  if (zwilling.geraet.modus) stickyModus = zwilling.geraet.modus;
  // Sprache der Rückmeldungen merken: fahrtv hängt nur am Layout, ein Sprachwechsel soll sie trotzdem neu zeichnen
  const notizSpr = T('de', 'en'), sprAnders = (() => { try { return (localStorage.getItem(schluessel('notizEn')) ?? 'de') !== notizSpr; } catch { return false; } })();
  const sprMerken = () => { try { localStorage.setItem(schluessel('notizEn'), notizSpr); } catch { /* egal */ } };
  if ((zwilling.geraet.fahrtv !== version || sprAnders) && fwAb('0.11.0')) {
    const k = knoepfe();
    const texte = [0, 1, 2, 3, 4].map((i) => (k[i] ? `✓ ${k[i]}` : null)).concat([T('✓ Diktat gespeichert', '✓ Dictation saved'), T('● Aufnahme', '● Recording')]);
    const dateien = texte.map((t, i) => (t ? { n: `r${String(i).padStart(2, '0')}.bin`, daten: (({ bytes, bereich }) => rueckDatei(bytes, bereich))(rueckmeldung(t)) } : null)).filter(Boolean);
    dateien.push({ n: 'layout.txt', daten: new TextEncoder().encode(text) });
    await zwilling.sollAbgleich('notiz', dateien);
    sprMerken();
    eintrag(T('Sticky kann jetzt auch ohne Handy Notizen sammeln', 'Sticky can now collect notes without the phone'));
  } else if (zwilling.geraet.fahrtv !== version || sprAnders) {
    await zwilling.fahrtLayout(text);
    const k = knoepfe();
    const texte = [0, 1, 2, 3, 4].map((i) => (k[i] ? `✓ ${k[i]}` : null)).concat([T('✓ Diktat gespeichert', '✓ Dictation saved'), T('● Aufnahme', '● Recording')]);
    for (let i = 0; i < texte.length; i++) {
      if (!texte[i]) continue;
      const r = rueckmeldung(texte[i]);
      await zwilling.sendeBild(r.bytes, { bereich: r.bereich, rueck: i });
    }
    sprMerken();
    eintrag(T('Sticky kann jetzt auch ohne Handy Notizen sammeln', 'Sticky can now collect notes without the phone'));
  }
  await pufferAbholen();
  if (fwAb('0.13.0')) await karussellAufspielen().catch((e) => eintrag(T(`Karussell: ${e.message}`, `Carousel: ${e.message}`), true));
  if (fwAb('0.15.0')) await hilfeAufspielen().catch((e) => eintrag(T(`Hilfe: ${e.message}`, `Help: ${e.message}`), true));
  if (fwAb('0.27.0')) {   // Strichschrift: Alphabet, Glyphen und Hintergrund (Vorlagen in strichschrift.js)
    const n = await zwilling.sollAbgleich('schrift', [{ n: 'zeichen.bin', daten: glyphenBlatt() }, { n: 'bild.bin', daten: schriftHintergrund() },
      { n: 'alphabet.txt', daten: alphabetDatei() }]).catch((e) => { eintrag(T(`Schrift: ${e.message}`, `Handwriting: ${e.message}`), true); return 0; });
    if (n) eintrag(T('Strichschrift aufgespielt', 'Stroke alphabet uploaded'));
  }
  if (fwAb('0.18.0')) {   // Widget-Maschine: nur Geändertes geht rüber (Bestandsliste je Widget)
    appSeite.hoch = hochkant('app');
    for (const [name, bauen] of Object.entries(widgetBauer())) {   // in ihrer Lage; Menü-Kacheln = Karussell
      const n = await zwilling.sollAbgleich(`widgets/${name}`, bauen()).catch((e) => { eintrag(`Widget ${name}: ${e.message}`, true); return 0; });
      if (n) eintrag(T(`Widget „${name}“ aufgespielt`, `Widget “${name}” uploaded`));
    }
    if (fwAb('0.21.0')) await einstellungenAufspielen().catch((e) => eintrag(T(`Lage: ${e.message}`, `Orientation: ${e.message}`), true));
  }
  if (fwAb('0.10.0')) await fahrtenschreiberAbholen().catch((e) => eintrag(T(`Fahrtenschreiber: ${e.message}`, `Trip recorder: ${e.message}`), true));
}

// ---- Karussell (SPEC „Bedienung und Oberfläche“): Reihe, durch die ▲/▼ am Sticky blättern -------------------------
const KARUSSELL_STANDARD_DE = 'Home, Timer, Wecker, Weltzeit, Waage, Lineal, Notiz, Recorder, Kritzel, Schrift, Rechner, Umrechner, Bordbuch, Zettel, Spiel, Einstellungen';
const KARUSSELL_STANDARD_EN = 'Home, Timer, Alarm, World clock, Spirit level, Ruler, Note, Recorder, Doodle, Handwriting, Calculator, Converter, Logbook, List, Game, Settings';
/** Standard der App-Sprache (beide Fassungen lösen über KARUSSELL_WOERTER gleich auf) */
const karussellStandard = () => (appIstEn() ? KARUSSELL_STANDARD_EN : KARUSSELL_STANDARD_DE);
const KARUSSELL_WOERTER = { home: 'home', notiz: 'notiz', bordbuch: 'bordbuch', zettel: 'zettel', bestellzettel: 'zettel', kritzel: 'kritzel', kritzelblock: 'kritzel', schrift: 'schrift', strichschrift: 'schrift', app: 'app', spiel: 'app', burgduell: 'app', rechner: 'app', umrechner: 'app', timer: 'widget timer', waage: 'widget waage', wasserwaage: 'widget waage', lineal: 'widget lineal', wecker: 'widget wecker', weltzeit: 'widget weltzeit', einstellungen: 'widget einstellungen', recorder: 'widget recorder',
  // englische Eingaben (Anzeige Englisch), intern dieselben deutschen Wörter
  alarm: 'widget wecker', 'world clock': 'widget weltzeit', worldclock: 'widget weltzeit', level: 'widget waage', ruler: 'widget lineal', note: 'notiz', notes: 'notiz', scribble: 'kritzel', doodle: 'kritzel', 'spirit level': 'widget waage', handwriting: 'schrift',
  calculator: 'app', converter: 'app', logbook: 'bordbuch', list: 'zettel', lists: 'zettel', game: 'app', settings: 'widget einstellungen' };
/** englische Wörter, die ab FW 0.28.0 zu eigenen Widgets werden (wie rechner/umrechner) */
const KARUSSELL_LOKAL = { rechner: 'rechner', umrechner: 'umrechner', calculator: 'rechner', converter: 'umrechner' };
function karussellText() {
  // Rechner/Umrechner rechnen ab FW 0.28.0 im Sticky (Widgets); vorher über die App-Seite
  const lokal = fwAb('0.28.0'), wort = (w) => (lokal && KARUSSELL_LOKAL[w] ? `widget ${KARUSSELL_LOKAL[w]}` : KARUSSELL_WOERTER[w]);
  const roh = (localStorage.getItem(schluessel('karussell')) || karussellStandard()).split(/[,;\n]/).map((w) => wort(w.trim().toLowerCase())).filter(Boolean)
    .filter((e) => e !== 'widget recorder' || fwAb('0.34.0'));   // Recorder erst ab FW 0.34.0
  return [...new Set(roh)].join('\n') + '\n';
}
/** Tastenhilfe je Modus (▲+▼ am Sticky): auf eigener Leinwand rendern, damit die Vorschau bleibt, wie sie ist */
function hilfeDateien() {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(BREITE, HOEHE) : Object.assign(document.createElement('canvas'), { width: BREITE, height: HOEHE });
  const h = c.getContext('2d', { willReadFrequently: true });
  return Object.entries(HILFE).map(([modus, seite]) => {
    bb.zeichneTextseite(h, seite, T('▲+▼ = Hilfe', '▲+▼ = Help'));
    return { n: `${modus}.bin`, daten: rgbaZu1bpp(h.getImageData(0, 0, BREITE, HOEHE).data) };
  }).concat(fwAb('0.27.0') ? [{ n: 'schrift.bin', daten: schriftHilfe() }] : []);   // Alphabet als Spickzettel
}
async function hilfeAufspielen(s = null) {
  const dateien = baue(s, hilfeDateien);
  const n = await (s?.z ?? zwilling).sollAbgleich('hilfe', dateien);
  if (n) eintrag(`${s ? `${s.g.name}: ` : ''}${T(`Tastenhilfe aufgespielt (${n} Seiten)`, `Key help uploaded (${n} pages)`)}`);
}

/**
 * /soll/einstellungen immer vollständig abgleichen: sollAbgleich räumt auf, was nicht in der Liste steht
 * (13.11.2026: lage.txt allein hat karussell.txt gelöscht, das Menü sprang dann ins falsche Ziel)
 */
function einstellungenAufspielen(s = null) {
  const enc = new TextEncoder();
  return (s?.z ?? zwilling).sollAbgleich('einstellungen', baue(s, () => [
    { n: 'karussell.txt', daten: enc.encode(karussellText()) },
    ...(fwAb('0.21.0') ? [{ n: 'lage.txt', daten: enc.encode(lageText()) }] : []),
    ...(fwAb('0.30.0') ? [{ n: 'zeit.txt', daten: zeitDatei() }] : []),   // 12/24 h wie das Handy
  ]));
}

async function karussellAufspielen() {
  const n = await einstellungenAufspielen();
  if (n) eintrag(`${T('Karussell', 'Carousel')}: ${karussellText().trim().split('\n').join(' → ')}`);
  // Menü-Kacheln folgen dem Karussell (FW ≥ 0.19.0) und dem anderen Firmware-Platz (Kachel „Sticky Lab“, FW ≥ 0.33.0)
  if ((n | platzGeaendert()) && fwAb('0.19.0')) for (const [name, bauen] of Object.entries(widgetBauer())) if (name.startsWith('menue')) await zwilling.sollAbgleich(`widgets/${name}`, bauen());
}
// ---- Lage der Seiten (SPEC „Hoch/Quer in zwei Stufen“, Stufe 1, FW ≥ 0.21.0) -------------------------------------
function lagen() {
  try {
    const eigen = JSON.parse(localStorage.getItem(schluessel('lagen')) || '{}');
    // Rechner/Umrechner sind ab FW 0.28.0 eigene Widgets: sie übernehmen die bisherige Lage der App-Seite
    if (eigen.app && !eigen.rechner) { eigen.rechner = eigen.app; eigen.umrechner = eigen.app; }
    return { ...LAGE_STANDARD, ...eigen };
  } catch { return { ...LAGE_STANDARD }; }
}
const hochkant = (seite) => fwAb('0.21.0') && lagen()[seite] === 'hoch';
const dreh180 = () => { try { return localStorage.getItem(schluessel('dreh180')) === '1'; } catch { return false; } };
// „dreh 180“ (FW ≥ 0.23.0): der Sticky dreht alles an der Ausgabe, die App zeichnet wie immer
const lageText = () => Object.entries(lagen()).map(([s, l]) => `${s} ${l}`).join('\n') + '\n' + (fwAb('0.23.0') ? `dreh ${dreh180() ? 180 : 0}\n` : '');
/** Widgets in ihrer Lage bauen; das Menü folgt dem Karussell */
const auto = (seite) => fwAb('0.22.0') && lagen()[seite] === 'auto';
/** bei „auto“ (Stufe 2, FW ≥ 0.22.0) beide Lagen: <name> quer, <name>-h hochkant; der Sticky nimmt laut Lagesensor */
/** alle Widgets als Funktion der Lage; das Menü folgt dem Karussell (auch für den Spiegel) */
/** Firmware im anderen Platz (Zustand „anders“, FW ≥ 0.33.0): „firmware“ = Sticky Lab; EDC selbst oder leer = keine Kachel */
function platzGeaendert() {   // je Gerät gemerkt; true, wenn sich „anders“ seit dem letzten Menü geändert hat
  const jetzt = zwilling.geraet.anders ?? '';
  try { if (localStorage.getItem(schluessel('platz')) === jetzt) return false; localStorage.setItem(schluessel('platz'), jetzt); } catch { /* egal */ }
  return true;
}
const platzKachel = () => { const a = (bauZ ?? zwilling).geraet.anders; return !a || a === 'firmware-ble' ? null : a === 'firmware' ? 'Sticky Lab' : a; };
const widgetFunktionen = () => {
  const w = { ...WIDGETS, menue: (h) => menueWidget(karussellText().trim().split('\n'), h, platzKachel()) };
  if (!fwAb('0.34.0')) delete w.recorder;   // ältere Firmware kennt „typ recorder“ nicht
  if (!fwAb('0.35.0')) for (const n of Object.keys(EINGABEN)) delete w[n];   // Ja/Nein, Ziffern erst ab FW 0.35.0
  return w;
};
const widgetBauer = () => {
  const alle = widgetFunktionen();
  const b = {};
  for (const [n, f] of Object.entries(alle)) {
    b[n] = () => f(hochkant(n));
    if (auto(n)) b[`${n}-h`] = () => f(true);
  }
  return b;
};
/** erst die Bilder (in neuer Lage), dann lage.txt: deren Änderung lässt den Sticky neu zeichnen */
async function lageAufspielen() {
  appSeite.hoch = hochkant('app');
  if (!zwilling.verbunden || !fwAb('0.21.0')) return;
  for (const [name, bauen] of Object.entries(widgetBauer())) await zwilling.sollAbgleich(`widgets/${name}`, bauen());
  const n = await einstellungenAufspielen();
  if (n) eintrag(`${T('Lage', 'Orientation')}: ${Object.entries(lagen()).map(([s, l]) => `${LAGE_NAMEN[s]} ${{ hoch: T('hochkant', 'portrait'), quer: T('quer', 'landscape'), auto: T('automatisch', 'automatic') }[l]}`).join(', ')}`);
  if (stickyModus === 'app') await appSeite.zeigen();
}
for (const [seite, name] of Object.entries(LAGE_NAMEN)) {
  const zeile = document.createElement('label');
  zeile.className = 'lage';
  const wahl = document.createElement('select');
  wahl.innerHTML = T('<option value="hoch">hochkant</option><option value="quer">quer</option><option value="auto">automatisch (Sensor)</option>',
    '<option value="hoch">portrait</option><option value="quer">landscape</option><option value="auto">automatic (sensor)</option>');
  wahl.value = lagen()[seite];
  wahl.onchange = () => {
    const l = lagen();
    l[seite] = wahl.value;
    try { localStorage.setItem(schluessel('lagen'), JSON.stringify(l)); } catch { /* egal */ }
    lageAufspielen().catch((e) => eintrag(T(`Lage: ${e.message}`, `Orientation: ${e.message}`), true));
  };
  zeile.append(`${name} `, wahl);
  $('lagen').append(zeile);
}

// Lineal kalibrieren: die 80-mm-Marke mit einem echten Lineal nachmessen und eintragen
try { $('lineal80').value = localStorage.getItem(schluessel('lineal80')) || '80'; } catch { $('lineal80').value = '80'; }
$('lineal80').onchange = () => {
  const v = parseFloat(String($('lineal80').value).replace(',', '.'));
  if (!(v > 60 && v < 100)) { eintrag(T('Lineal: bitte einen Wert um 80 mm eintragen', 'Ruler: please enter a value around 80 mm'), true); return; }
  try { localStorage.setItem(schluessel('lineal80'), String(v)); } catch { /* egal */ }
  if (zwilling.verbunden && fwAb('0.18.0')) zwilling.sollAbgleich('widgets/lineal', WIDGETS.lineal()).then((n) => n && eintrag(T(`Lineal neu kalibriert (80 mm = ${v} mm)`, `Ruler recalibrated (80 mm = ${v} mm)`))).catch((e) => eintrag(e.message, true));
};

// ---- Sprache (SPEC „Zweisprachig Deutsch/Englisch“): Wahl der App, zugleich Standard für den Sticky ---------------
$('sprachWahl').value = sprachWahl();
$('sprachWahl').onchange = async () => {
  sprachWahlSetzen($('sprachWahl').value);
  // erst den Standard an den Sticky (zeit.txt „sprache“), dann neu laden: die ganze Oberfläche in der neuen Sprache
  if (zwilling.verbunden && fwAb('0.32.0')) await einstellungenAufspielen().catch(() => {});
  location.reload();
};
$('dreh180').checked = dreh180();
$('dreh180').onchange = () => {
  try { localStorage.setItem(schluessel('dreh180'), $('dreh180').checked ? '1' : '0'); } catch { /* egal */ }
  if (zwilling.verbunden && fwAb('0.21.0')) einstellungenAufspielen().then((n) => n && eintrag($('dreh180').checked ? T('Sticky auf dem Kopf', 'Sticky upside down') : T('Sticky normal', 'Sticky upright'))).catch((e) => eintrag(T(`Lage: ${e.message}`, `Orientation: ${e.message}`), true));
};

$('pttAblage').checked = pttAblage();
$('pttAblage').onchange = () => { try { localStorage.setItem('sticky.pttAblage', $('pttAblage').checked ? '1' : '0'); } catch { /* egal */ } };

$('karussell').value = localStorage.getItem(schluessel('karussell')) || karussellStandard();
$('karussell').onchange = () => {
  localStorage.setItem(schluessel('karussell'), $('karussell').value);
  if (zwilling.verbunden && fwAb('0.13.0')) karussellAufspielen().catch((e) => eintrag(T(`Karussell: ${e.message}`, `Carousel: ${e.message}`), true));
};

// ---- Fahrtenschreiber (SPEC „Zwilling 2.0“): /ist/log/JJJJ-MM-TT.txt auf der Karte des Sticky ----------------------
// Die App holt nur den neuen Teil (Stand je Datei in localStorage) und hängt ihn an ihre Kopie an
// (Data/fahrtenschreiber/…). Vergangene Tage löscht sie danach auf dem Sticky, den heutigen lässt sie dort weiterwachsen.
/** Firmware mindestens v? ("sim" kann alles) */
// ---- Spiegel per Bildschirmfoto (FW ≥ 0.31.3) -------------------------------------------------------------------
// Nur solange der Sticky-Tab sichtbar ist: nach Seitenwechsel oder Taste ein Foto; auf Kritzel, Strichschrift und Widgets
// alle 3 s nach, höchstens 30 s nach der letzten Bedienung (danach darf der Sticky wieder schlummern).
let fotoLaeuft = false, fotoBis = 0, fotoTimer = 0;
const stickyTabOffen = () => document.visibilityState === 'visible' && document.querySelector('.tab[data-tab="sticky"]')?.hidden === false;
function fotoAnstossen(verzoegerung = 1200) {
  if (!zwilling.verbunden || !fwAb('0.31.3') || zwilling.geraet.fw === 'sim') return;
  fotoBis = Date.now() + 30000;
  clearTimeout(fotoTimer);
  fotoTimer = setTimeout(fotoRunde, verzoegerung);
}
async function fotoRunde() {
  clearTimeout(fotoTimer);
  if (!zwilling.verbunden || !stickyTabOffen() || fotoLaeuft) return;
  fotoLaeuft = true;
  try { spiegel.foto(await zwilling.bildschirm()); } catch { spiegel.fotoFehlt(); }   // dann zeichnet der Spiegel selbst
  fotoLaeuft = false;
  if (Date.now() < fotoBis && ['kritzel', 'schrift', 'widget'].includes(spiegel.zustand().modus)) fotoTimer = setTimeout(fotoRunde, 3000);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fotoAnstossen(300); });
document.querySelector('#tabs [data-ziel="sticky"]')?.addEventListener('click', () => fotoAnstossen(300));
// Bau-Kontext (Multiclient Stufe 2): Seiten für einen Hintergrund-Sticky entstehen aus seinem Profil und seiner Firmware
let bauZ = null;
/** fn synchron für Sitzung s bauen (Profil, Firmware-Stand); ohne s für den aktiven Sticky */
function baue(s, fn) {
  if (!s) return fuerSticky(fn);
  const alt = bauZ;
  bauZ = s.z;
  try { return fuerSticky(() => mitGeraet(s.g, fn), s.z?.geraet?.en); } finally { bauZ = alt; }
}
const fwAb = (v) => { const f = (bauZ ?? zwilling).geraet.fw; if (f === 'sim') return true; const a = String(f ?? '0').split('.').map(Number), b = v.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; return true; };
const LOG_ORDNER = 'fahrtenschreiber';
/** Firmware-Stand eines bestimmten Sticky (Sitzung s) bzw. des aktiven */
const fwAbZ = (s, v) => baue(s, () => fwAb(v));
const logStand = () => { try { return JSON.parse(localStorage.getItem(schluessel('logStand')) ?? '{}'); } catch { return {}; } };
const heuteName = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.txt`; };
const logSim = {};   // im Browser statt Filesystem

async function logAnhaengen(name, text, ordner = LOG_ORDNER, geraet = aktivesGeraet()) {
  if (!nativ) { if (ordner === LOG_ORDNER) logSim[name] = (logSim[name] ?? '') + text; return; }
  // Multiclient: der erste Sticky (A) schreibt wie bisher, weitere in einen Unterordner mit ihrem Kurznamen
  const erster = geraete()[0];
  const pfad = geraet && erster && geraet.id !== erster.id ? `${ordner}/${kurz(geraet)}/${name}` : `${ordner}/${name}`;
  await Filesystem.appendFile({ path: pfad, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
}
async function logLesen(name) {
  if (!nativ) return logSim[name] ?? '';
  try { return (await Filesystem.readFile({ path: `${LOG_ORDNER}/${name}`, directory: Directory.Data, encoding: Encoding.UTF8 })).data; } catch { return ''; }
}
async function logTage() {
  if (!nativ) return Object.keys(logSim).sort().reverse();
  try { return (await Filesystem.readdir({ path: LOG_ORDNER, directory: Directory.Data })).files.map((f) => f.name).sort().reverse(); } catch { return []; }
}

/** Tagesdateien aus /ist/<quelle> holen (nur den neuen Teil), an die Kopie in Data/<ziel> anhängen,
 *  vergangene Tage auf dem Sticky quittieren. → Anzahl neuer Zeilen */
async function istAbholen(quelle, ziel, s = null) {
  const z = s?.z ?? zwilling, geraet = s?.g ?? aktivesGeraet(), standName = schluesselFuer(geraet, 'logStand');
  const liste = (await z.liste(`/ist/${quelle}`)).filter((d) => !d.ordner && /\.(txt|csv)$/.test(d.n));
  let stand = {};
  try { stand = JSON.parse(localStorage.getItem(standName) ?? '{}'); } catch { /* neu */ }
  const kennung = (n) => (quelle === 'log' ? n : `${quelle}/${n}`);
  let zeilen = 0;
  for (const d of liste) {
    const ab = Math.min(stand[kennung(d.n)] ?? 0, d.b);
    if (d.b > ab) {
      const neu = new TextDecoder().decode(await z.holen(`/ist/${quelle}/${d.n}`, d.b, ab));
      await logAnhaengen(d.n, neu, ziel, geraet);
      zeilen += neu.split('\n').filter(Boolean).length;
      stand[kennung(d.n)] = d.b;
      localStorage.setItem(standName, JSON.stringify(stand));
    }
    // vergangene Tage (und die Zeilen ohne Uhrzeit) sind abgeschlossen: auf dem Sticky quittieren
    if (!d.n.includes(heuteName().replace('.txt', '')) && await z.loeschen(`/ist/${quelle}/${d.n}`)) {
      delete stand[kennung(d.n)];
      localStorage.setItem(standName, JSON.stringify(stand));
    }
  }
  return zeilen;
}

/** 1 bpp (800 × 480, Bit 1 = schwarz) → PNG als base64 */
function kritzelPng(bits, hoch = false) {
  const c = typeof OffscreenCanvas !== 'undefined' ? null : Object.assign(document.createElement('canvas'), { width: BREITE, height: HOEHE });
  const k = c ?? document.createElement('canvas');
  k.width = BREITE; k.height = HOEHE;
  const h = k.getContext('2d');
  const bild = h.createImageData(BREITE, HOEHE);
  for (let i = 0; i < BREITE * HOEHE; i++) {
    const v = bits[i >> 3] & (0x80 >> (i & 7)) ? 0 : 255;
    bild.data[i * 4] = bild.data[i * 4 + 1] = bild.data[i * 4 + 2] = v;
    bild.data[i * 4 + 3] = 255;
  }
  h.putImageData(bild, 0, 0);
  if (hoch) {   // hochkant gemalt (Datei „…-h.bin“, FW ≥ 0.21.0): aufrecht drehen
    const a = document.createElement('canvas');
    a.width = 480; a.height = 800;
    a.getContext('2d').drawImage(vomDisplay(k), 0, 0);
    return a.toDataURL('image/png').split(',')[1];
  }
  return k.toDataURL('image/png').split(',')[1];
}
const kritzelSim = {};   // im Browser statt Filesystem

/** Kritzelblock (FW ≥ 0.16.0): Blätter aus /ist/kritzel holen, als PNG ablegen, als Notiz eintragen, quittieren */
async function kritzelAbholen(s = null) {
  const z = s?.z ?? zwilling, wer = s ? { geraet: kurz(s.g) } : {};
  const liste = (await z.liste('/ist/kritzel')).filter((d) => !d.ordner && d.n.endsWith('.bin'));
  for (const d of liste) {
    const bits = await z.holen(`/ist/kritzel/${d.n}`, d.b);
    const png = kritzelPng(bits, d.n.endsWith('-h.bin'));
    const name = d.n.replace('-h.bin', '.bin').replace('.bin', '.png');
    if (nativ) await Filesystem.writeFile({ path: `kritzel/${name}`, data: png, directory: Directory.Data, recursive: true });
    else kritzelSim[name] = png;
    const m = d.n.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})/);
    const t = m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : Date.now();
    zeigeNotiz(await notizen.notiere({ t, art: 'kritzel', bild: `kritzel/${name}`, ...wer }), true);
    await z.loeschen(`/ist/kritzel/${d.n}`);
  }
  if (liste.length) eintrag(T(`${liste.length} Kritzel vom Sticky abgeholt`, `${liste.length} ${liste.length === 1 ? 'doodle' : 'doodles'} fetched from the Sticky`));
}

/** Strichschrift (FW ≥ 0.27.0): Texte aus /ist/schrift holen, als Notiz eintragen, quittieren */
async function schriftAbholen(s = null) {
  const z = s?.z ?? zwilling, wer = s ? { geraet: kurz(s.g) } : {};
  const liste = (await z.liste('/ist/schrift')).filter((d) => !d.ordner && d.n.endsWith('.txt'));
  for (const d of liste) {
    const text = new TextDecoder().decode(await z.holen(`/ist/schrift/${d.n}`, d.b)).trim();
    const m = d.n.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})/);
    const t = m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : Date.now();
    if (text) zeigeNotiz(await notizen.notiere({ t, art: 'schrift', text, ...wer }), true);
    await z.loeschen(`/ist/schrift/${d.n}`);
  }
  if (liste.length) eintrag(T(`${liste.length} geschriebene ${liste.length === 1 ? 'Notiz' : 'Notizen'} vom Sticky abgeholt`, `${liste.length} handwritten ${liste.length === 1 ? 'note' : 'notes'} fetched from the Sticky`));
}

async function fahrtenschreiberAbholen(s = null) {
  const zeilen = await istAbholen('log', LOG_ORDNER, s);
  if (zeilen) eintrag(`${s ? `${s.g.name}: ` : ''}${T(`Fahrtenschreiber: ${zeilen} neue ${zeilen === 1 ? 'Zeile' : 'Zeilen'}`, `Trip recorder: ${zeilen} new ${zeilen === 1 ? 'line' : 'lines'}`)}`);
  if (!s) await zeigeFahrtenschreiber();
  if (fwAbZ(s, '0.16.0')) await kritzelAbholen(s).catch((e) => eintrag(T(`Kritzel: ${e.message}`, `Doodle: ${e.message}`), true));
  if (fwAbZ(s, '0.27.0')) await schriftAbholen(s).catch((e) => eintrag(T(`Schrift: ${e.message}`, `Handwriting: ${e.message}`), true));
  if (fwAbZ(s, '0.12.0')) {
    const mess = await istAbholen('mess', 'messreihen', s);
    if (mess) eintrag(`${s ? `${s.g.name}: ` : ''}${T(`Messreihen: ${mess} neue Werte`, `Measurements: ${mess} new values`)}`);
  }
}

async function zeigeFahrtenschreiber(tag = $('logTag').value) {
  const tage = await logTage();
  const wahl = $('logTag');
  const vorher = tag || tage[0];
  wahl.replaceChildren(...tage.map((t) => new Option(t.replace('.txt', ''), t)));
  if (vorher && tage.includes(vorher)) wahl.value = vorher;
  const text = wahl.value ? await logLesen(wahl.value) : '';
  $('logText').textContent = text ? text.replace(/\r/g, '').split('\n').reverse().join('\n').trim() : T('noch nichts abgeholt', 'nothing fetched yet');
}
$('logTag').onchange = () => zeigeFahrtenschreiber();
$('logHolen').onclick = () => fahrtenschreiberAbholen().catch((e) => eintrag(T(`Fahrtenschreiber: ${e.message}`, `Trip recorder: ${e.message}`), true));
zeigeFahrtenschreiber();

// Ab FW 0.11.0 liegt der Puffer unter /ist/puffer und geht über den allgemeinen Datei-Abgleich
const puffer = {
  liste: (s) => { const z = s?.z ?? zwilling; return fwAbZ(s, '0.11.0') ? z.liste('/ist/puffer') : z.pufferListe(); },
  holen: (n, b, s) => { const z = s?.z ?? zwilling; return fwAbZ(s, '0.11.0') ? z.holen(`/ist/puffer/${n}`, b) : z.pufferHolen(n, b); },
  loeschen: (n, s) => { const z = s?.z ?? zwilling; return fwAbZ(s, '0.11.0') ? z.loeschen(`/ist/puffer/${n}`) : z.pufferLoeschen(n); },
};

// ---- Recorder (SPEC „Recorder für Längeres“, FW ≥ 0.34.0) ---------------------------------------------------------
/** Startzeit aus dem Dateinamen rJJMMTT-hhmmss.adp (Ortszeit des Sticky) */
function recorderZeit(name) {
  const m = name.match(/^r(\d\d)(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)/);
  return m && +m[1] ? new Date(2000 + +m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
}

/** WAV in Teilen schreiben (eine Stunde sind ~115 MB – am Stück wäre die base64-Zeichenkette zu groß) */
async function speichernWav(name, pcm) {
  if (!nativ) return null;
  const pfad = `aufnahmen/${name}`;
  const b64 = (bytes) => { let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
  await Filesystem.writeFile({ path: pfad, data: b64(wavKopf(pcm.length)), directory: Directory.Data, recursive: true });
  const TEIL = 1 << 19;   // 512 Ki Samples = 1 MB
  for (let a = 0; a < pcm.length; a += TEIL) {
    const t = pcm.subarray(a, a + TEIL);
    await Filesystem.appendFile({ path: pfad, data: b64(new Uint8Array(t.buffer, t.byteOffset, t.byteLength)), directory: Directory.Data });
  }
  return pfad;
}

/** Abtippen in Stücken (whisper hört 30-s-Fenster), Merker in den Text, Notiz anlegen, dann die Datei am Sticky löschen (✓) */
async function recorderVerarbeiten({ pcm, start, datei, merker = [], offline = false }, s = null) {
  const wer = s ? { geraet: kurz(s.g) } : {}, vor = s ? `${s.g.name}: ` : '';
  const dauerMs = Math.round(pcm.length / 16);
  const teile = stuecke(pcm);
  eintrag(vor + T(`Recorder ${datei}: ${Math.round(dauerMs / 60000)} min, tippe ab (${teile.length} Stücke) …`, `Recorder ${datei}: ${Math.round(dauerMs / 60000)} min, transcribing (${teile.length} parts) …`));
  const pfad = await speichernWav(`sticky-${dateiZeit(start)}-recorder.wav`, pcm);
  const texte = [];
  for (const [von, bis] of teile) {
    let text = '';
    try { const r = await erkenne(pcm.subarray(von, bis)); text = r.unklar ? '' : r.text || ''; } catch (e) { console.info('[sticky] recorder stück', e.message); }
    texte.push({ von, bis, text });
  }
  const text = mitMerkern(texte, merker);
  const n = await notizen.notiere({ t: start, art: 'recorder', text, audio: pfad ?? datei, datei, dauerMs, merker, ...(offline ? { offline: true } : {}), ...wer });
  zeigeNotiz(n, true);
  await puffer.loeschen(datei, s).catch(() => {});   // hat Text: die Karte darf sie freigeben, am Sticky steht dann ✓
  eintrag(vor + T(`Recorder ${datei}: abgetippt (${text.length} Zeichen, ${merker.length} Merker)`, `Recorder ${datei}: transcribed (${text.length} characters, ${merker.length} marks)`));
}

/** Live-Aufnahme fertig (zwilling.js): vollständig → gleich abtippen; sonst die Datei abholen */
async function recorderFertig(d) {
  if (d.vollstaendig) await recorderVerarbeiten({ pcm: d.pcm, start: d.start, datei: d.datei, merker: d.merker ?? [] });
  else eintrag(T(`Recorder ${d.datei}: live unvollständig – hole die Datei vom Sticky`, `Recorder ${d.datei}: live stream incomplete – fetching the file`));
  await pufferAbholen();   // räumt die Notiz-Zeile ab bzw. stößt das Abholen an
}

/** Abholen in Stücken à 256 KB (~30 s Ton): jedes Stück eine eigene Anfrage, dazwischen kommt der übrige Abgleich dran */
let recorderSchlange = Promise.resolve();
const recorderInArbeit = new Set();
function recorderEinreihen(job, s) {
  if (recorderInArbeit.has(job.name)) return;
  recorderInArbeit.add(job.name);
  const vor = s ? `${s.g.name}: ` : '';
  recorderSchlange = recorderSchlange.then(async () => {
    const z = s?.z ?? zwilling, STUECK = 256 * 1024, daten = new Uint8Array(job.groesse), t0 = performance.now();
    const min = Math.round(job.groesse / 8167 / 60);
    eintrag(vor + T(`Hole Recorder-Aufnahme ${job.name} (~${min} min Ton, dauert etwa so lange) …`, `Fetching recording ${job.name} (~${min} min of audio, takes about as long) …`));
    for (let ab = 0; ab < job.groesse; ab += STUECK) {
      if (!z.verbunden) throw new Error(T('Verbindung weg, nächstes Mal weiter', 'connection lost, will retry next time'));
      daten.set(await z.holen(`/ist/puffer/${job.name}`, Math.min(job.groesse, ab + STUECK), ab), ab);
    }
    console.info('[sticky] recorder abgeholt', job.name, job.groesse, Math.round(performance.now() - t0));
    await recorderVerarbeiten({ pcm: dekodiereDatei(daten), start: job.start, datei: job.name, merker: job.merker, offline: true }, s);
  }).catch((e) => eintrag(`${vor}Recorder ${job.name}: ${e.message}`, true)).finally(() => recorderInArbeit.delete(job.name));
}

/** Fernbedienung (Vorschlag Markus): Tipp auf eine Zeile am Sticky → hier abspielen, noch einmal = Pause, ▲/▼ = Merker */
const recSpieler = typeof Audio !== 'undefined' ? new Audio() : null;
let recSpielt = null;
async function recorderFernbedienung(d) {
  if (!recSpieler) return;
  if (d.a === 'springe') {
    if (!recSpielt) return;
    const jetzt = recSpieler.currentTime * 1000, m = [...(recSpielt.merker ?? [])].sort((a, b) => a - b);
    const ziel = d.r < 0 ? [...m].reverse().find((x) => x < jetzt - 2000) ?? 0 : m.find((x) => x > jetzt + 500);
    if (ziel != null) recSpieler.currentTime = ziel / 1000;
    return;
  }
  if (d.a === 'pause' && recSpielt?.datei === d.datei) { if (recSpieler.paused) await recSpieler.play(); else recSpieler.pause(); return; }
  const n = (await notizen.heute()).find((x) => x.datei === d.datei);
  if (!n?.audio || !nativ) { eintrag(T(`${d.datei} ist noch nicht beim Handy`, `${d.datei} is not on the phone yet`)); return; }
  const { uri } = await Filesystem.getUri({ path: n.audio, directory: Directory.Data });
  recSpieler.src = Capacitor.convertFileSrc(uri);
  recSpielt = n;
  await recSpieler.play();
  eintrag(T(`Spiele ${d.datei} (${(n.merker ?? []).length} Merker, ▲/▼ springt)`, `Playing ${d.datei} (${(n.merker ?? []).length} marks, ▲/▼ jumps)`));
}

async function pufferAbholen(s = null) {
  const wer = s ? { geraet: kurz(s.g) } : {}, vor = s ? `${s.g.name}: ` : '';
  const liste = (await puffer.liste(s)).filter((d) => !d.ordner);
  if (!liste.length) return;
  eintrag(vor + T(`Hole Notizen vom Sticky (${liste.length} Dateien) …`, `Fetching notes from the Sticky (${liste.length} files) …`));
  const groesse = Object.fromEntries(liste.map((d) => [d.n, d.b]));
  const roh = groesse['notizen.jsonl'] ? new TextDecoder().decode(await puffer.holen('notizen.jsonl', groesse['notizen.jsonl'], s)) : '';
  const zeilen = roh.split('\n').map((z) => { try { return JSON.parse(z); } catch { return null; } }).filter(Boolean);
  // Aufnahmen ohne Notiz-Zeile (z. B. nach einem abgebrochenen Abholen) trotzdem mitnehmen; r*.adp sind Recorder-Aufnahmen
  for (const d of liste) {
    if (d.n.endsWith('.adp') && !zeilen.some((z) => z.audio === d.n)) zeilen.push(/^r\d{6}-/.test(d.n) ? { t: recorderZeit(d.n), art: 'recorder', audio: d.n, merker: [] } : { t: 0, art: 'diktat', audio: d.n });
  }
  let anzahl = 0;
  for (const z of zeilen) {
    const t = z.t > 1.7e12 ? z.t : Date.now();   // 0 = Sticky kannte die Uhrzeit nicht
    let n;
    if (z.art === 'recorder') {
      // Datei schon weg: live angekommen und abgetippt. Schon als Notiz da (Abbruch nach dem Abtippen): nur noch löschen
      if (groesse[z.audio] == null) continue;
      if ((await notizen.heute()).some((x) => x.datei === z.audio)) { await puffer.loeschen(z.audio, s); continue; }
      // lange Übertragung (~so lange wie die Aufnahme): nicht hier warten, sonst steht der ganze Abgleich still
      recorderEinreihen({ name: z.audio, groesse: groesse[z.audio], start: t, merker: z.merker ?? [] }, s);
      continue;
    }
    if (z.art === 'diktat' && z.audio) {
      let text = '', pfad = null, dauerMs = z.dauerMs;
      try {
        if (groesse[z.audio] == null) throw new Error(T('Audiodatei fehlt auf dem Sticky', 'Audio file missing on the Sticky'));
        const t0 = performance.now();
        const daten = await puffer.holen(z.audio, groesse[z.audio], s);
        console.info('[sticky] abgeholt', z.audio, daten.length, Math.round(performance.now() - t0));
        const a = new Aufnahme();
        for (let o = 0; o + 245 <= daten.length; o += 245) a.paket(daten.subarray(o, o + 245));
        const e = a.ergebnis();
        dauerMs = e.dauerMs;
        pfad = await speichern(`sticky-${dateiZeit(t)}-offline.wav`, wav(e.pcm));
        text = (await erkenne(e.pcm)).text || '';
        await puffer.loeschen(z.audio, s);
      } catch (e) { eintrag(`${T('Diktat', 'Dictation')} ${z.audio}: ${e.message}`, true); }
      n = await notizen.notiere({ t, art: 'diktat', text, audio: pfad ?? z.audio, dauerMs, offline: true, ...wer });
    } else {
      n = await notizen.notiere({ t, art: 'knopf', knopf: z.knopf, offline: true, ...wer });
    }
    zeigeNotiz(n, true);
    anzahl++;
  }
  if (groesse['notizen.jsonl']) await puffer.loeschen('notizen.jsonl', s);
  eintrag(vor + T(`${anzahl} Notizen vom Sticky abgeholt`, `${anzahl} ${anzahl === 1 ? 'note' : 'notes'} fetched from the Sticky`));
}

$('notizenTeilen').onclick = async () => {
  try {
    const r = await notizen.teilen();
    if (r === 'leer') eintrag(T('Heute noch keine Notizen', 'No notes today yet'));
  } catch (e) { eintrag(T(`Teilen fehlgeschlagen: ${e.message}`, `Sharing failed: ${e.message}`), true); }
};
notizen.heute().then((l) => l.reverse().forEach((n) => zeigeNotiz(n)));

// ---- Bordbuch (SPEC „MVP 2“) --------------------------------------------------------
let imBordbuch = false;
let pdf = null;
try { $('spickzettel').value = localStorage.getItem(schluessel('spickzettel')) || bb.SPICKZETTEL_STANDARD; } catch { $('spickzettel').value = bb.SPICKZETTEL_STANDARD; }
$('spickzettel').onchange = () => { try { localStorage.setItem(schluessel('spickzettel'), $('spickzettel').value); } catch { /* egal */ } };
$('spickStandard').onclick = () => { $('spickzettel').value = bb.SPICKZETTEL_STANDARD; $('spickzettel').onchange(); };
try { $('handgriffe').value = localStorage.getItem(schluessel('handgriffe')) ?? HANDGRIFFE_STANDARD; } catch { $('handgriffe').value = HANDGRIFFE_STANDARD; }
$('handgriffe').onchange = () => { try { localStorage.setItem(schluessel('handgriffe'), $('handgriffe').value); } catch { /* egal */ } };
$('handgriffeStandard').onclick = () => { $('handgriffe').value = HANDGRIFFE_STANDARD; $('handgriffe').onchange(); };
/** Spickzettel und Handgriffe zusammen, in dieser Reihenfolge (Bordbuch und Vorschau nutzen dieselbe Liste) */
const spickSeiten = () => [...bb.spickzettelSeiten($('spickzettel').value), ...bb.spickzettelSeiten($('handgriffe').value)];

async function ladePdf(bytes, name) {
  pdf = await bb.oeffnePdf(bytes);
  $('pdfName').textContent = `${name} · ${pdf.numPages} ${T('Seiten', 'pages')}`;
  zeigeVerbindung();
}
$('pdfDatei').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const bytes = new Uint8Array(await f.arrayBuffer());
  await ladePdf(bytes, f.name);
  // Für den nächsten Start merken (App-Speicher, nicht im Repo)
  if (nativ) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    Filesystem.writeFile({ path: 'bordbuch/handbuch.pdf', data: btoa(bin), directory: Directory.Data, recursive: true }).catch(() => {});
  }
};
// Gemerktes Handbuch laden (bzw. per adb nach files/bordbuch/handbuch.pdf gelegt)
if (nativ) {
  Filesystem.readFile({ path: 'bordbuch/handbuch.pdf', directory: Directory.Data })
    .then((d) => ladePdf(Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0)), 'handbuch.pdf'))
    .catch(() => {});
}

/** Alle Bildschirme erzeugen: [Inhalt, Spickzettel…, Handbuch-Ausschnitte…] → { seiten: Uint8Array[], index } */
async function bordbuchBauen(status) {
  const spick = spickSeiten();
  const hb = [];        // { bytes, pdfSeite }
  const ersteVon = {};  // PDF-Seite → Bildschirm-Index (relativ)
  if (pdf) {
    for (let p = 1; p <= pdf.numPages; p++) {
      status(T(`Handbuch rendern: Seite ${p} von ${pdf.numPages}`, `Rendering manual: page ${p} of ${pdf.numPages}`));
      const teile = await bb.pdfAusschnitte(pdf, p);
      teile.forEach((t, i) => {
        ersteVon[p] ??= hb.length;
        hb.push({ bytes: bb.dithern(bb.marke(t.daten, `${T('S.', 'p.')} ${p} · ${i + 1}/${teile.length}`).data), pdfSeite: p, teil: i, von: teile.length });
      });
    }
  }
  const nSpick = spick.length;
  const start = 1 + nSpick;   // erster Handbuch-Bildschirm
  const gesamt = start + hb.length;
  const kap = pdf ? (await bb.kapitel(pdf)).filter((k) => ersteVon[k.seite] != null).slice(0, 14) : [];
  const links = spick.map((s, i) => ({ titel: s.titel, seite: 1 + i }));
  const rechts = kap.map((k) => ({ titel: k.titel, seite: start + ersteVon[k.seite], anzeige: k.seite }));
  const seiten = [];
  const felder = bb.zeichneInhalt(g, links, rechts);
  seiten.push(bildBytes());
  spick.forEach((s, i) => { bb.zeichneTextseite(g, s, `${T('Spickzettel', 'Cheat sheet')} ${i + 1}/${nSpick} · ${2 + i}/${gesamt}`); seiten.push(bildBytes()); });
  for (const h of hb) seiten.push(h.bytes);
  const index = [`seiten=${seiten.length}`, 'toc=0', ...felder.map((f) => `e ${f.x0} ${f.y0} ${f.x1} ${f.y1} ${f.seite}`)].join('\n') + '\n';
  // Plan für die Vorschau merken: welche Seite ist was (die Bilder rendert der Spiegel bei Bedarf neu)
  const plan = { links, rechts, felder, seiten: [{ a: 'inhalt' }, ...spick.map((_, i) => ({ a: 'spick', i, n: nSpick, von: gesamt })), ...hb.map((h) => ({ a: 'pdf', p: h.pdfSeite, t: h.teil, n: h.von }))] };
  try { localStorage.setItem(schluessel('bbplan'), JSON.stringify(plan)); } catch { /* egal */ }
  bb.zeichneInhalt(g, links, rechts);   // Vorschau zeigt am Ende das Inhaltsverzeichnis
  pruefeAbgleich();
  return { seiten, index };
}

$('bbAufspielen').onclick = async () => {
  const knopf = $('bbAufspielen');
  knopf.disabled = true;
  const status = (t) => { $('bbStatus').textContent = t; };
  const t0 = performance.now();
  try {
    const { seiten, index } = await fuerSticky(() => bordbuchBauen(status));   // Rahmentexte in der Sprache des Sticky
    if (seiten.length > 255) throw new Error(T(`Zu viele Seiten (${seiten.length}, höchstens 255)`, `Too many pages (${seiten.length}, at most 255)`));
    if (fwAb('0.11.0')) {
      // Auf die Karte: nur geänderte Seiten, der Index zuletzt (er lässt den Sticky neu einlesen)
      const dateien = seiten.map((b, i) => ({ n: `${String(i).padStart(2, '0')}.bin`, daten: b }));
      dateien.push({ n: 'index.txt', daten: new TextEncoder().encode(index) });
      const n = await zwilling.sollAbgleich('bordbuch', dateien, (i, von, name) => status(T(`Aufspielen: ${name} (${i} von ${von} geänderten) …`, `Uploading: ${name} (${i} of ${von} changed) …`)));
      eintrag(T(`Bordbuch: ${n} von ${dateien.length} Dateien neu`, `Logbook: ${n} of ${dateien.length} files new`));
    } else {
      for (let i = 0; i < seiten.length; i++) {
        status(T(`Aufspielen: Seite ${i + 1} von ${seiten.length} …`, `Uploading: page ${i + 1} of ${seiten.length} …`));
        await zwilling.sendeBild(seiten[i], { speichern: i });
      }
      await zwilling.bordbuchIndex(index);
    }
    const s = Math.round((performance.now() - t0) / 1000);
    status(T(`Bordbuch aufgespielt: ${seiten.length} Seiten in ${s} s`, `Logbook uploaded: ${seiten.length} pages in ${s} s`));
    eintrag(T(`Bordbuch aufgespielt (${seiten.length} Seiten, ${s} s)`, `Logbook uploaded (${seiten.length} pages, ${s} s)`));
    console.info('[sticky] bordbuch', JSON.stringify({ seiten: seiten.length, sekunden: s }));
  } catch (e) {
    status(T(`Fehler: ${e.message}`, `Error: ${e.message}`));
    eintrag(T(`Bordbuch: ${e.message}`, `Logbook: ${e.message}`), true);
  } finally {
    knopf.disabled = !zwilling.verbunden;
  }
};
$('bbZeigen').onclick = () => zwilling.modusSetzen(1).catch((e) => eintrag(e.message, true));
window.__sticky = { ladePdf, zwilling, spiegelSetze: (t) => spiegelSetze(t), pufferAbholen, fahrtenschreiberAbholen, erkenne, sprachPruefung, zeigeNotiz, notizen };   // zum Prüfen per WebView-Fernsteuerung (adb)

try { $('woerter').value = localStorage.getItem(schluessel('woerter')) ?? WOERTER_STANDARD; } catch { $('woerter').value = WOERTER_STANDARD; }
$('woerter').onchange = () => { try { localStorage.setItem(schluessel('woerter'), $('woerter').value); } catch { /* egal */ } };
try { $('woerterbuch').value = localStorage.getItem(schluessel('woerterbuch')) ?? WOERTERBUCH_STANDARD; } catch { $('woerterbuch').value = WOERTERBUCH_STANDARD; }
$('woerterbuch').onchange = () => { try { localStorage.setItem(schluessel('woerterbuch'), $('woerterbuch').value); } catch { /* egal */ } };

// ---- Spiegel: Vorschau folgt dem Sticky, Tipps und ▲▼ steuern ihn ----------------------
const bbCache = new Map();
async function bordbuchSeite(n) {
  let plan = null;
  try { plan = JSON.parse(localStorage.getItem(schluessel('bbplan')) || 'null'); } catch { /* egal */ }
  const e = plan?.seiten?.[n];
  if (!e) return null;
  if (bbCache.has(n)) return bbCache.get(n);
  const c = document.createElement('canvas');
  c.width = BREITE; c.height = HOEHE;
  const h = c.getContext('2d', { willReadFrequently: true });
  let bild = null;
  if (e.a === 'inhalt') { fuerSticky(() => bb.zeichneInhalt(h, plan.links, plan.rechts)); bild = h.getImageData(0, 0, BREITE, HOEHE); }
  else if (e.a === 'spick') {
    const s = spickSeiten()[e.i];
    if (s) { fuerSticky(() => bb.zeichneTextseite(h, s, `${T('Spickzettel', 'Cheat sheet')} ${e.i + 1}/${e.n} · ${n + 1}/${e.von}`)); bild = h.getImageData(0, 0, BREITE, HOEHE); }
  } else if (e.a === 'pdf' && pdf) {
    const teile = await bb.pdfAusschnitte(pdf, e.p);
    if (teile[e.t]) bild = fuerSticky(() => bb.marke(teile[e.t].daten, `${T('S.', 'p.')} ${e.p} · ${e.t + 1}/${teile.length}`));
  }
  if (bild) { bbCache.set(n, bild); if (bbCache.size > 12) bbCache.delete(bbCache.keys().next().value); }
  return bild;
}
const spiegel = spiegelEinrichten({
  canvas: $('spiegel'),
  hinweisEl: $('spiegelHinweis'),
  quelle: {
    knoepfe,
    wetter: letztesWetter,
    zettelText: () => $('zettelText').value,
    alleZettel,
    bordbuchSeite,
    karte: () => karteFuer(aktivesGeraet(), KARTE),
    widgetBild: (name, hoch) => {
      const f = widgetFunktionen()[name];
      return f ? f(hoch).find((d) => d.n === 'bild.bin')?.daten : null;
    },
    schriftBild: () => schriftHintergrund(),
    inhaltsFelder: () => { try { return JSON.parse(localStorage.getItem(schluessel('bbplan')) || 'null')?.felder ?? []; } catch { return []; } },
  },
  befehl: (m, seite) => { if (zwilling.verbunden) zwilling.modusSetzen(m, seite).catch((e) => eintrag(e.message, true)); },
  notizTipp: (x, y) => fahrtTouch(x, y),
});
/** Spiegel-Zustand setzen und merken (nach dem App-Start zeigt die Vorschau den letzten Stand) */
function spiegelSetze(teile) {
  spiegel.setze(teile);
  try { const { modus, w, lh, bb: s, zettel } = spiegel.zustand(); localStorage.setItem(schluessel('spiegel'), JSON.stringify({ modus, w, lh, bb: s, zettel })); } catch { /* egal */ }
}
try { const alt = JSON.parse(localStorage.getItem(schluessel('spiegel')) || 'null'); if (alt) spiegel.setze({ ...alt, verbunden: false }); else spiegel.setze({}); } catch { spiegel.setze({}); }
$('fernAuf').onclick = () => spiegel.taste('up');
$('fernAb').onclick = () => spiegel.taste('down');

// Fahrt erkennen und den Sticky wach halten (12.11.2026: im Auto schlummerte er zwischen zwei Diktaten ein, das
// nächste landete offline und die App blieb stumm). Solange verbunden: jede Minute Standort; fährt das Fold (GPS-
// Tempo oder Strecke > 2 m/s), bis 10 min danach jede Minute „wach“ an den Sticky.
let fahrtBis = 0, letzterOrt = null;
function abstandM(a, b) {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}
setInterval(async () => {
  if (!zwilling.verbunden) return;
  const o = await notizen.standort();
  if (o) {
    let v = o.tempo;
    if (v == null && letzterOrt) {
      const d = abstandM(letzterOrt, o), s = (Date.now() - letzterOrt.zeit) / 1000;
      if (s > 0 && d > o.gen + letzterOrt.gen) v = d / s;
    }
    letzterOrt = { ...o, zeit: Date.now() };
    kontextSchritt(o, o.gen < 100 ? v : null);
    if (v != null && v > 2 && o.gen < 100) {
      if (Date.now() >= fahrtBis) eintrag(T('Fahrt erkannt – Sticky bleibt wach', 'Driving detected – Sticky stays awake'));
      fahrtBis = Date.now() + 10 * 60 * 1000;
    }
  }
  if (Date.now() < fahrtBis && zwilling.verbunden) zwilling.wach().catch(() => {});
}, 60 * 1000);

// Wächter: nicht verbunden, automatisch erwünscht, aber seit über einer Minute kein Versuch → neu anstoßen
setInterval(() => {
  if (!autoVerbinden || zwilling.verbunden || !(verbindung instanceof BleVerbindung)) return;
  if (verbindeGerade && Date.now() - letzterVersuch > 2 * VERBINDEN_FRIST_MS) verbindeGerade = false;   // hängt trotz Frist
  if (!verbindeGerade && !wiederTimer && Date.now() - letzterVersuch > 60000) wiederverbinden();
}, 30 * 1000);

// Wetter stündlich nachziehen, solange verbunden (Abgleich schickt nur die geänderte Karte)
setInterval(() => { if (zwilling.verbunden) abgleich().catch(() => {}); }, 60 * 60 * 1000);
// Neuer Tag → Home-Karte mit neuem Datum gleich aufspielen (bei Dauerverbindung sonst bis zu einer Stunde zu spät)
let heute = new Date().toDateString();
setInterval(() => {
  if (new Date().toDateString() === heute) return;
  heute = new Date().toDateString();
  if (zwilling.verbunden) abgleich().catch(() => {});
}, 60 * 1000);

// ---- Hintergrund-Sitzungen (Multiclient Stufe 2, 14.11.2026) ------------------------------------------------------
// Jeder weitere bekannte Sticky läuft schlank mit: eigene Verbindung, eigener Zwilling. Er liefert Notizen, Diktate,
// Kritzel, Fahrtenschreiber und Messreihen ab und bekommt Home (mit Wetter), Zettel, Notiz-Seite, Karussell, Widgets,
// Hilfe und Schrift nach SEINEM Profil. Vorschau, Fernbedienung und Bordbuch bleiben beim aktiven Sticky.
const hgLeinwand = (() => {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(BREITE, HOEHE) : Object.assign(document.createElement('canvas'), { width: BREITE, height: HOEHE });
  return c.getContext('2d', { willReadFrequently: true });
})();
const hgBytes = () => rgbaZu1bpp(hgLeinwand.getImageData(0, 0, BREITE, HOEHE).data);

function hintergrundStarten() {
  if (!nativ) return;   // im Browser gibt es nur eine Web-Bluetooth-Verbindung
  const aktiv = aktivesGeraet();
  for (const g of geraete()) {
    if (g.id === aktiv?.id || sitzungen.has(g.id)) continue;
    const v = new BleVerbindung();
    v.bescheiden = true;
    const z = new Zwilling();
    z.anbinden(v);
    const s = { g, z, v, timer: 0, zuletzt: 0, modus: null, ort: null, laeuft: false };
    z.beobachte((art, d) => hgEreignis(s, art, d));
    sitzungen.set(g.id, s);
    hgVerbinden(s);
  }
  geraeteZeigen();
}

async function hintergrundStoppen() {
  for (const s of sitzungen.values()) {
    clearTimeout(s.timer);
    s.weg = true;
    await s.v.trennen().catch(() => {});
  }
  sitzungen.clear();
}

function hgPlanen(s, ms) {
  clearTimeout(s.timer);
  if (!s.weg && autoVerbinden) s.timer = setTimeout(() => hgVerbinden(s), ms);
}

async function hgVerbinden(s) {
  if (s.weg || s.verbindet || s.z.verbunden || !autoVerbinden) return;
  s.verbindet = true;
  try {
    await mitFrist(s.v.verbinden({ geraet: s.g, nurGemerkt: true }), VERBINDEN_FRIST_MS, T('Verbinden', 'Connect')).catch(async (e) => {
      await s.v.abbrechen?.().catch(() => {});
      throw e;
    });
    s.zuletzt = Date.now();
    eintrag(T(`Im Hintergrund verbunden: ${s.g.name}`, `Connected in background: ${s.g.name}`));
    geraeteZeigen();
    hintergrundAbgleich(s).catch((e) => eintrag(`${s.g.name}: ${e.message}`, true));
  } catch {
    hgPlanen(s, 15000);   // der Wecker im Dienst meldet sich zusätzlich, sobald er wieder funkt
  } finally {
    s.verbindet = false;
  }
}

function hgEreignis(s, art, d) {
  if (art === 'zustand') { s.zuletzt = Date.now(); if (d.modus) s.modus = d.modus; geraeteZeigen(); }
  else if (art === 'aufnahmeLaeuft') s.ort = notizen.standort();
  else if (art === 'aufnahme') { d.ort = s.ort; d.wer = kurz(s.g); d.sitzung = s; zeigeAufnahme(d); }
  else if (art === 'getrennt') {
    s.zuletzt = Date.now();
    geraeteZeigen();
    if (!s.weg) hgPlanen(s, 3000);
  } else if (art === 'ereignis') {
    if (d.t === 'modus') {
      s.modus = d.m;
      if (d.m === 'app') { appSeiteHg.sitzung = s; appSeiteHg.hoch = appSeite.hoch; }
      duellPruefen();
      if (d.m === 'app' && !imDuell()) appSeiteHg.zeigen().catch((e) => eintrag(`${s.g.name}: ${e.message}`, true));
    }
    else if (d.t === 'suchen') handyKlingeln();
    else if (d.t === 'touch' && d.a === 'down' && s.modus === 'app') { appSeiteHg.sitzung = s; appSeiteHg.tipp(d.x, d.y).catch((e) => eintrag(`${s.g.name}: ${e.message}`, true)); }
    else if (d.t === 'touch' && d.a === 'down' && s.modus === 'notiz') hgNotizTipp(s, d).catch((e) => eintrag(`${s.g.name}: ${e.message}`, true));
  }
}

/** Tipp auf einen Knopf der Notiz-Seite des Hintergrund-Sticky (seine Knöpfe, sein Profil) */
async function hgNotizTipp(s, d) {
  const k = baue(s, () => { const l = knoepfe(); const i = trefferKnopf(d.x, d.y, l); return i < 0 ? null : l[i]; });
  if (!k) return;
  const t = d.ms > 1.7e12 ? d.ms : Date.now();
  const spaet = Date.now() - t > VERSPAETET_MS;
  await neueNotiz({ t, art: 'knopf', knopf: k, geraet: kurz(s.g), ...(spaet ? { offline: true } : {}) }, spaet ? null : notizen.standort(), k, s);
}

/** Abgleich für einen Hintergrund-Sticky: wie abgleich(), aber ohne Vorschau und nur über den Datei-Abgleich */
async function hintergrundAbgleich(s) {
  const z = s.z;
  if (s.laeuft || !z.verbunden) return;
  s.laeuft = true;   // gleich belegen: während des Wartens darf kein zweiter Lauf starten
  try { await hgAbgleichKern(s); } finally { s.laeuft = false; }
}
async function hgAbgleichKern(s) {
  const z = s.z;
  // direkt nach dem Verbinden kann der Zustand (Firmware-Stand) noch unterwegs sein: kurz warten statt „zu alt“ melden
  for (let i = 0; i < 20 && !z.geraet.fw && z.verbunden; i++) await new Promise((r) => setTimeout(r, 250));
  // Uhr sofort stellen (ein kleiner Rahmen), nicht erst nach dem Vordergrund-Abgleich: nach leerem Akku zeigt der
  // Sticky sonst bis zu einer Minute keine Zeit (Beobachtung 15.11.2026)
  if (z.geraet.fw) await z.zeitSetzen().catch(() => {});
  for (let i = 0; i < 120 && vordergrundGleichtAb && z.verbunden; i++) await new Promise((r) => setTimeout(r, 500));   // höchstens 60 s
  if (!z.geraet.fw) return;
  if (!fwAbZ(s, '0.31.0')) { eintrag(T(`${s.g.name}: Firmware ${z.geraet.fw ?? '?'} ist zu alt für den Hintergrund (ab 0.31)`, `${s.g.name}: firmware ${z.geraet.fw ?? '?'} is too old for background mode (needs 0.31)`), true); return; }
  {
    await z.zeitSetzen();
    const wetter = (await holeWetter(await notizen.standort())) ?? letztesWetter();
    // Seiten aus seinem Profil bauen (synchron, damit der Bau-Kontext nicht in den Vordergrund leckt)
    const teile = baue(s, () => {
      const h = hgLeinwand;
      zeichneHome(h, karteFuer(s.g, KARTE), null, wetter); const home = hgBytes();
      zeichneFahrt(h, knoepfe()); const notiz = hgBytes();
      zeichneZiffern(h); const ziffern = hgBytes();
      const zettel = alleZettel().map((x) => { x.zeichne(h); return hgBytes(); });
      const alle = [home, notiz, ziffern, ...zettel];
      const homeV = crc32(new Uint8Array(alle.flatMap((b) => [...b]))).toString(16).padStart(8, '0') + ';' + zettel.length;
      const st = statusGlyphen();
      const homeDateien = alle.map((b, i) => ({ n: `${i}.bin`, daten: b }))
        .concat([{ n: 'status-quer.bin', daten: st.quer }, { n: 'status-hoch.bin', daten: st.hoch }, { n: 'version.txt', daten: new TextEncoder().encode(homeV) }]);
      const k = knoepfe();
      const text = layoutText(k);
      const version = crc32(new TextEncoder().encode(text)).toString(16).padStart(8, '0');
      const texte = [0, 1, 2, 3, 4].map((i) => (k[i] ? `✓ ${k[i]}` : null)).concat([T('✓ Diktat gespeichert', '✓ Dictation saved'), T('● Aufnahme', '● Recording')]);
      const notizDateien = texte.map((t, i) => (t ? { n: `r${String(i).padStart(2, '0')}.bin`, daten: (({ bytes, bereich }) => rueckDatei(bytes, bereich))(rueckmeldung(t)) } : null))
        .filter(Boolean).concat([{ n: 'layout.txt', daten: new TextEncoder().encode(text) }]);
      const schrift = [{ n: 'zeichen.bin', daten: glyphenBlatt() }, { n: 'bild.bin', daten: schriftHintergrund() }, { n: 'alphabet.txt', daten: alphabetDatei() }];
      const widgets = Object.entries(widgetBauer()).map(([name, bauen]) => [name, bauen()]);
      return { homeV, homeDateien, version, notizDateien, schrift, widgets, spr: T('de', 'en') };
    });
    if (z.geraet.homev !== teile.homeV) { const n = await z.sollAbgleich('home', teile.homeDateien); if (n) eintrag(`${s.g.name}: Home (${n} ${T('Dateien', 'files')})`); }
    const sprSchl = schluesselFuer(s.g, 'notizEn'), sprAnders = (() => { try { return (localStorage.getItem(sprSchl) ?? 'de') !== teile.spr; } catch { return false; } })();
    if (z.geraet.fahrtv !== teile.version || sprAnders) { await z.sollAbgleich('notiz', teile.notizDateien); try { localStorage.setItem(sprSchl, teile.spr); } catch { /* egal */ } }
    await pufferAbholen(s);
    const nE = await einstellungenAufspielen(s).catch((e) => { eintrag(`${s.g.name}: ${T('Karussell', 'Carousel')}: ${e.message}`, true); return 0; });
    if (nE) eintrag(`${s.g.name}: ${T('Karussell und Lage aufgespielt', 'carousel and orientation uploaded')}`);
    await hilfeAufspielen(s).catch((e) => eintrag(`${s.g.name}: ${T('Hilfe', 'Help')}: ${e.message}`, true));
    const nS = await z.sollAbgleich('schrift', teile.schrift).catch((e) => { eintrag(`${s.g.name}: ${T('Schrift', 'Handwriting')}: ${e.message}`, true); return 0; });
    if (nS) eintrag(`${s.g.name}: ${T('Strichschrift aufgespielt', 'stroke alphabet uploaded')}`);
    for (const [name, dateien] of teile.widgets) {
      const n = await z.sollAbgleich(`widgets/${name}`, dateien).catch((e) => { eintrag(`${s.g.name}: Widget ${name}: ${e.message}`, true); return 0; });
      if (n) eintrag(`${s.g.name}: ${T(`Widget „${name}“ aufgespielt`, `widget “${name}” uploaded`)}`);
    }
    await fahrtenschreiberAbholen(s).catch((e) => eintrag(`${s.g.name}: ${T('Fahrtenschreiber', 'Trip recorder')}: ${e.message}`, true));
  }
}

// stündlich Wetter und Stand nachziehen, bei Fahrt wach halten (wie beim aktiven Sticky)
setInterval(() => { for (const s of sitzungen.values()) if (s.z.verbunden) hintergrundAbgleich(s).catch(() => {}); }, 60 * 60 * 1000);
setInterval(() => { if (Date.now() < fahrtBis) for (const s of sitzungen.values()) if (s.z.verbunden) s.z.wach().catch(() => {}); }, 60 * 1000);

// ---- Benachrichtigungen ans Sticky (Test 14.11.2026) ---------------------------------------------------------------
// Der Melder (Android, Positivliste) reicht Titel und Text weiter; am Sticky erscheinen sie kurz im Rückmeldefeld
// (Home und Notiz-Seite), beim aktiven wie bei Hintergrund-Stickys. Nichts wird gespeichert.
async function meldeStatusZeigen() {
  try { const { da } = await Hintergrund.meldeZugriff(); $('meldeStatus').textContent = da ? T('Zugriff: freigegeben ✓', 'Access: granted ✓') : T('Zugriff: noch nicht freigegeben', 'Access: not granted yet'); }
  catch { $('meldeStatus').textContent = T('Zugriff: nur in der App auf dem Handy', 'Access: only in the app on the phone'); }
}
$('meldeZugriff').onclick = () => Hintergrund.meldeZugriffOeffnen().catch((e) => eintrag(e.message, true));
$('meldeTest').onclick = () => Hintergrund.testMeldung({ titel: 'Sticky', text: `Test ${uhrzeit(new Date())}` }).catch((e) => eintrag(e.message, true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') meldeStatusZeigen(); });
meldeStatusZeigen();
// Dauerhaft (SPEC „Die drei naheliegenden“, A, abgenommen 15.11.2026): die letzten 3 erlaubten Meldungen stehen als
// „App · Titel“ auf der Home-Karte des aktiven Sticky, bis sie am Handy weggewischt sind (spätestens 12 h)
const meldeText = () => { try { return localStorage.getItem('sticky.meldeListe') ?? MELDE_STANDARD; } catch { return MELDE_STANDARD; } };
const meldeListeSchicken = () => Hintergrund.meldeListe({ pakete: meldePakete(meldeRegeln(meldeText())) }).catch(() => {});
$('meldeListe').value = meldeText();
$('meldeListe').onchange = () => { try { localStorage.setItem('sticky.meldeListe', $('meldeListe').value); } catch { /* egal */ } meldeListeSchicken(); };
meldeListeSchicken();
Promise.resolve().then(() => Hintergrund.addListener('benachrichtigung', (e) => {
  if (!meldungErlaubt(meldeRegeln(meldeText()), e.paket, e.titel)) return;   // „nur von“ prüft die App
  const zeile = [e.titel, e.text].filter(Boolean).join(': ').replace(/\s+/g, ' ').trim();
  const kurzText = zeile.length > 30 ? zeile.slice(0, 29) + '…' : zeile;
  eintrag(`${T('Meldung', 'Notification')}: ${zeile}`);
  meldeStatusZeigen();   // kommt eine an, ist der Zugriff offensichtlich frei
  const r = rueckmeldung(kurzText);
  if (zwilling.verbunden && (stickyModus === 'home' || stickyModus === 'notiz')) {
    spiegel.meldung(kurzText);
    zwilling.sendeBild(r.bytes, { bereich: r.bereich }).catch((x) => eintrag(`${T('Meldung', 'Notification')}: ${x.message}`, true));
  }
  for (const s of sitzungen.values()) {
    if (s.z.verbunden && (s.modus === 'home' || s.modus === 'notiz')) s.z.sendeBild(r.bytes, { bereich: r.bereich }).catch(() => {});
  }
  kontextSetzen('meldungen', meldungDazu(kontextLesen('meldungen', []), { key: e.key, paket: e.paket, app: e.app, titel: (e.titel || e.text || '').replace(/\s+/g, ' ').trim() }));
  homeAuffrischen();
})).catch(() => {});
Promise.resolve().then(() => Hintergrund.addListener('benachrichtigungWeg', (e) => {
  const alt = kontextLesen('meldungen', []), neu = meldungWeg(alt, e.key);
  if (neu.length === alt.length) return;
  kontextSetzen('meldungen', neu);
  eintrag(T('Meldung am Handy weggewischt – auch vom Sticky', 'Notification dismissed on the phone – removed from the Sticky too'));
  homeAuffrischen();
})).catch(() => {});

// ---- Kontext: Ort, Fahrt-Ende, Rückfragen (SPEC „Die drei naheliegenden“, B und C, abgenommen 15.11.2026) ---------------
// Ablage je Profil des aktiven Sticky; die Hinweise stehen nur auf SEINER Home-Karte (Hintergrund-Stickys nicht).
function kontextLesen(n, vorgabe) { try { return JSON.parse(localStorage.getItem(schluessel(n)) ?? 'null') ?? vorgabe; } catch { return vorgabe; } }
function kontextSetzen(n, v) { try { localStorage.setItem(schluessel(n), JSON.stringify(v)); } catch { /* egal */ } }
let aktuellerOrt = null, fahrtZustand = null;
function homeHinweise() {
  if (bauZ) return [];   // Bau für einen Hintergrund-Sticky oder die Grundausstattung: keine persönlichen Hinweise
  return homeZeilen({ ort: aktuellerOrt, parkplatz: kontextLesen('parkplatz', null), meldungen: kontextLesen('meldungen', []) }, { T, uhrzeit });
}
/** Home-Karte neu aufspielen (gesammelt: mehrere Meldungen kurz nacheinander = ein Abgleich) */
let homeTimer = null;
function homeAuffrischen() {
  clearTimeout(homeTimer);
  homeTimer = setTimeout(function nochmal() {
    if (!zwilling.verbunden) return;
    if (vordergrundGleichtAb) { homeTimer = setTimeout(nochmal, 5000); return; }
    abgleich().catch((e) => eintrag(`Home: ${e.message}`, true));
  }, 3000);
}
/** Rückfrage stellen, nur wenn der Sticky auf Home oder Notiz ruht; Antwort per Tipp, sonst nach 2 min verworfen */
function frageStellen(frage) {
  if (!zwilling.verbunden || !fwAb('0.17.0') || !(stickyModus === 'home' || stickyModus === 'notiz') || appSeite.frage || duellSitzung()) return false;
  const vorher = stickyModus === 'notiz' ? 2 : 0;
  const f = { ...frage, antwort: async (wert) => {
    clearTimeout(f.timer);
    eintrag(`${T('Rückfrage', 'Question')}: ${frage.text} → ${wert === true ? T('Ja', 'Yes') : wert === false ? T('Nein', 'No') : wert}`);
    await zwilling.modusSetzen(vorher).catch(() => {});
    await frage.beiAntwort?.(wert);
  } };
  f.timer = setTimeout(() => {
    if (appSeite.frage !== f) return;
    appSeite.frage = null;
    eintrag(T(`Rückfrage verfallen: ${frage.text}`, `Question expired: ${frage.text}`));
    if (stickyModus === 'app') zwilling.modusSetzen(vorher).catch(() => {});
  }, FRAGE_DAUER_MS);
  appSeite.frage = f;
  eintrag(`${T('Rückfrage', 'Question')}: ${frage.text}`);
  zwilling.modusSetzen(5).catch((e) => { appSeite.frage = null; eintrag(e.message, true); });   // das Bild kommt mit „modus app“
  return true;
}
function parkplatzFragen(ort) {
  frageStellen({ art: 'janein', text: T('Parkplatz merken?', 'Remember parking spot?'), beiAntwort: async (ja) => {
    if (!ja) return;
    const t = Date.now();
    kontextSetzen('parkplatz', { t, lat: ort?.lat ?? null, lon: ort?.lon ?? null });
    await neueNotiz({ t, art: 'knopf', knopf: T('Parkplatz', 'Parking') }, ort, T('Parkplatz', 'Parking'));
    homeAuffrischen();
  } });
}
/** Jede Minute aus der Fahrterkennung (nur verbunden): Fahrt-Anfang/-Ende und Ankunft an einem eigenen Ort */
function kontextSchritt(o, v) {
  const vorher = !!fahrtZustand?.faehrt;
  const { zustand, ende } = fahrtSchritt(fahrtZustand, v);
  fahrtZustand = zustand;
  if (!vorher && zustand.faehrt) {
    // Micro = „Fahrt erkannt“: aus der Ruhe auf die Notiz-Seite (Schnellknöpfe); alter Parkplatz ist damit erledigt
    if (stickyModus === 'home') zwilling.modusSetzen(2).catch(() => {});
    if (kontextLesen('parkplatz', null)) { kontextSetzen('parkplatz', null); homeAuffrischen(); }
  }
  if (ende) parkplatzFragen(o);
  if (zustand.faehrt) return;   // unterwegs keine Ortswechsel
  const orte = orteLesen(orteText());
  const neu = ortFinden(orte, o, aktuellerOrt);
  if (neu === aktuellerOrt) return;
  aktuellerOrt = neu;
  eintrag(neu ? T(`Ort: ${neu}`, `Place: ${neu}`) : T('Ort verlassen', 'Left the place'));
  const ziel = neu && orte.find((x) => x.name === neu)?.ziel;
  // nur aus Home und einmal je Ankunft; wer weiterblättert, bleibt, wo er ist
  if (ziel && ziel.modus !== 0 && stickyModus === 'home') zwilling.modusSetzen(ziel.modus, ziel.seite ?? null).catch(() => {});
  homeAuffrischen();
}
const orteText = () => (bauZ ? '' : $('orte').value);
try { $('orte').value = localStorage.getItem(schluessel('orte')) ?? ''; } catch { /* egal */ }
$('orte').onchange = () => { try { localStorage.setItem(schluessel('orte'), $('orte').value); } catch { /* egal */ } aktuellerOrt = null; };
$('ortMerken').onclick = async () => {
  const o = await notizen.standort();
  if (!o) { eintrag(T('Kein Standort – GPS an?', 'No location – GPS on?'), true); return; }
  const t = $('orte').value.trimEnd();
  $('orte').value = (t ? `${t}\n` : '') + ortZeile(T('Neuer Ort', 'New place'), o, 'Home');
  $('orte').onchange();
  eintrag(T(`Ort gemerkt (±${o.gen} m) – Namen und Ziel in der Liste anpassen`, `Place saved (±${o.gen} m) – adjust name and target in the list`));
};
$('frageTest').onclick = () => {
  if (!frageStellen({ art: 'janein', text: T('Parkplatz merken?', 'Remember parking spot?'), beiAntwort: (ja) => eintrag(`Test: ${ja}`) }))
    eintrag(T('Rückfrage geht nur, wenn der Sticky verbunden ist und Home oder Notiz zeigt', 'Questions only work while the Sticky is connected and shows Home or Note'), true);
};

// ---- Grundausstattung für die SD-Karte (14.11.2026) ---------------------------------------------------------------
// Wer die Firmware aus dem Playground flasht und keine App hat, packt dieses ZIP auf eine microSD (FAT32): Menü,
// Widgets, Hilfe, Strichschrift und Karussell. Gebaut aus einem LEEREN Profil – nur Standardinhalte, nichts
// Persönliches (kein Home mit Visitenkarte, keine Zettel, kein Bordbuch). stand.txt je Ordner wie beim Abgleich.
const GRUND_FW = '0.31.6';
function grundausstattung() {
  const s = { g: { id: '__grund', profil: '__grund', name: 'Grundausstattung' }, z: { geraet: { fw: GRUND_FW } } };
  // Karussell nur mit Seiten, die ohne App etwas zeigen (Notiz, Bordbuch und Zettel kommen erst mit der App)
  try { localStorage.setItem('sticky.p.__grund.karussell', 'Home, Timer, Wecker, Weltzeit, Waage, Lineal, Kritzel, Schrift, Rechner, Umrechner, Einstellungen'); } catch { /* egal */ }
  return baue(s, () => {
    const enc = new TextEncoder(), dateien = [];
    const ordner = (pfad, liste) => {
      for (const d of liste) dateien.push({ p: `soll/${pfad}/${d.n}`, daten: d.daten });
      const stand = liste.map((d) => `${d.n} ${crc32(d.daten).toString(16).padStart(8, '0')}`).join('\n') + '\n';
      dateien.push({ p: `soll/${pfad}/stand.txt`, daten: enc.encode(stand) });
    };
    ordner('einstellungen', [{ n: 'karussell.txt', daten: enc.encode(karussellText()) }, { n: 'lage.txt', daten: enc.encode(lageText()) }]);
    ordner('hilfe', hilfeDateien());
    ordner('schrift', [{ n: 'zeichen.bin', daten: glyphenBlatt() }, { n: 'bild.bin', daten: schriftHintergrund() }, { n: 'alphabet.txt', daten: alphabetDatei() }]);
    for (const [name, bauen] of Object.entries(widgetBauer())) ordner(`widgets/${name}`, bauen());
    dateien.push({ p: 'LIESMICH.txt', daten: enc.encode('EDC Sticky – Grundausstattung (Firmware ' + GRUND_FW + ')\n\n'
      + 'Den Ordner "soll" auf eine microSD-Karte (FAT32) kopieren, Karte in den Sticky, neu starten.\n'
      + 'Danach gibt es Menue (KI kurz auf Home), Timer, Wecker, Weltzeit, Wasserwaage, Lineal, Rechner,\n'
      + 'Umrechner, Strichschrift und Einstellungen - ohne Handy. Mit der App kommen Home, Zettel und Notizen dazu.\n\n'
      + 'Copy the "soll" folder to a FAT32 microSD card, insert it, restart the Sticky. You get the menu\n'
      + '(KI short on Home) and all widgets without a phone. The app adds Home, notes and cards.\n') });
    return dateien;
  });
}
/** ZIP ohne Kompression (Methode 0) – reicht, die Bilder sind ohnehin 1 bpp */
function zipBauen(dateien) {
  const enc = new TextEncoder(), teile = [], zentral = [];
  let ofs = 0;
  const u16 = (v) => [v & 255, (v >> 8) & 255], u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  for (const d of dateien) {
    const name = enc.encode(d.p), crc = crc32(d.daten) >>> 0, n = d.daten.length;
    const kopf = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x5821), ...u32(crc), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0), ...name]);
    zentral.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x5821), ...u32(crc), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(ofs), ...name]));
    teile.push(kopf, d.daten);
    ofs += kopf.length + n;
  }
  const zl = zentral.reduce((a, b) => a + b.length, 0);
  const ende = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(dateien.length), ...u16(dateien.length), ...u32(zl), ...u32(ofs), ...u16(0)]);
  return new Blob([...teile, ...zentral, ende], { type: 'application/zip' });
}
window.__sticky.grundausstattung = grundausstattung;
window.__sticky.sitzungen = sitzungen;
/** Burgduell Computer gegen Computer auf beiden Stickys (alle 3,5 s ein Schuss) */
window.__sticky.maschinenDuell = async () => {
  const spiel = appSeite.zustand[0], warte = (ms) => new Promise((r) => setTimeout(r, ms));
  // erst warten, bis kein Abgleich mehr funkt (sonst teilen sich Spiel und Abgleich den Funk und reißen ab)
  for (let i = 0; i < 120 && (vordergrundGleichtAb || [...sitzungen.values()].some((x) => x.laeuft)); i++) await warte(500);
  stickyModus = zwilling.geraet.modus ?? stickyModus;
  duellPruefen();
  spiel.maschinenDuell();
  eintrag(spiel.text);
  const zeigen = async () => {   // kurze Abrisse überstehen: auf die Verbindung warten, Fehler nicht durchreichen
    for (let i = 0; i < 60 && !(zwilling.verbunden && duellSitzung()); i++) await warte(1000);
    await appSeite.zeigen().catch((e) => eintrag(T(`Burgduell: ${e.message}`, `Castle duel: ${e.message}`), true));
  };
  await zeigen();
  while (!spiel.vorbei && spiel.cpuBeide) {
    await warte(3500);
    if (!spiel.cpuBeide) break;
    spiel.nachzug();
    await zeigen();
  }
  eintrag(`${T('Burgduell', 'Castle duel')}: ${spiel.text}`);
  return spiel.text;
};   // zum Prüfen per WebView-Fernsteuerung (adb)
window.__sticky.grundZip = () => zipBauen(grundausstattung());

tabsEinrichten();
muster();
zeigeVerbindung();

// Beim Start gleich den bekannten Sticky suchen (12.11.2026: nach Neustart der App blieb sie sonst getrennt, bis
// jemand „Verbinden“ tippte – mit dem Schlummermodus wichtig, damit der geweckte Sticky die App wiederfindet)
try {
  if (nativ && aktivesGeraet()) {
    verbindung = new BleVerbindung();
    zwilling.anbinden(verbindung);
    autoVerbinden = true;
    Hintergrund.start({ text: T('Notizen und Diktate kommen an', 'Notes and dictations arrive'), adresse: stickyAdresse() }).catch(() => {});
    wiederverbinden();
    hintergrundStarten();
  }
} catch { /* dann eben per Knopf */ }
