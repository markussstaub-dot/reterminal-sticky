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
let letzteEinheitUs = null;
setzeEinheitUs(HANDY_US);   // bis der Sticky seine Einheit meldet
import { alphabetDatei, glyphenBlatt, schriftHintergrund, schriftHilfe } from './strichschrift.js';
import { KARTEN_STANDARD, zeichneKarte } from './karten.js';
import { Aufnahme, wav, sprachPruefung, nurWortliste, angehoben } from './audio.js';
import * as notizen from './notizen.js';
import { SORTEN, naechsteSorte } from './sorte.js';
import { HILFE } from './hilfe.js';
import { HANDGRIFFE_STANDARD } from './handgriffe.js';
import { AppSeite } from './appseite.js';
import { WIDGETS, menueWidget } from './widgets.js';
import { LAGE_STANDARD, LAGE_NAMEN, vomDisplay } from './lage.js';
import { WOERTERBUCH_STANDARD, paareLesen, paareText, korrigiere, lernen, einpflegen } from './woerterbuch.js';
import * as bb from './bordbuch.js';
import { tabsEinrichten } from './tabs.js';
import { spiegelEinrichten } from './spiegel.js';
import { BREITE, HOEHE, rgbaZu1bpp, crc32, rueckDatei } from './protokoll.js';
import { BleVerbindung, SimVerbindung } from './verbindung.js';
import { Zwilling } from './zwilling.js';
import { schluessel, schluesselFuer, mitGeraet, karteFuer, kurz, geraete, aktivesGeraet, aktivSetzen, geraetAendern, geraetVergessen, PROFILE } from './geraete.js';

const $ = (id) => document.getElementById(id);
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
  g.fillText('Hallo vom Fold', 24, 37);
  const jetzt = new Date();
  g.textAlign = 'right';
  g.font = '28px system-ui, sans-serif';
  g.fillText(uhrzeit(jetzt), BREITE - 24, 37);
  g.textAlign = 'left';
  g.fillStyle = '#000';
  g.font = '30px system-ui, sans-serif';
  g.fillText(jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 24, 120);
  g.font = '24px system-ui, sans-serif';
  g.fillText('Twin-Durchstich: Bild per BLE, Taste zurück.', 24, 170);
  g.fillText('Drück ▲, ▼ oder tipp aufs Display.', 24, 210);
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
  p.textContent = gleich ? 'gleich wie auf dem Sticky' : (zwilling.geraet.seite === 'karte' ? 'Sticky zeigt Visitenkarte' : 'Entwurf, nicht gesendet');
  p.classList.toggle('gleich', gleich);
}

// ---- Ereignisse --------------------------------------------------------------------
const TASTEN = { up: '▲', down: '▼', ki: 'KI' };
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
  werte.textContent = `${a.kbitS} kbit/s · ${a.pakete} Pakete · Verlust ${verlust} (${quote} %) · Spitze ${a.spitze}`;
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.textContent = 'WAV laden';
  link.style.color = 'var(--akzent)';
  // Spracherkennung (Stufe 1: Handy, offline)
  const text = document.createElement('div');
  text.className = 'text warte';
  text.textContent = 'erkenne …';
  const zeile = document.createElement('div');
  zeile.className = 'zeile';
  const kopieren = document.createElement('button');
  kopieren.textContent = 'Kopieren';
  kopieren.disabled = true;
  zeile.append(kopieren);
  li.append(kopf, text, zeile, player, werte);
  if (!nativ) zeile.append(link);
  const modell = $('modell').value;
  const tErk = performance.now();
  erkenne(a.pcm).then((r) => {
    const gesamt = Math.round(performance.now() - a.tLos);
    text.className = 'text';
    text.textContent = r.text || '(nichts erkannt)';
    kopieren.disabled = !r.text || !!r.unklar;
    kopieren.onclick = async () => {
      try { await Clipboard.write({ string: r.text }); kopieren.textContent = 'Kopiert ✓'; } catch (e) { eintrag(`Kopieren fehlgeschlagen: ${e.message}`, true); }
    };
    const zusatz = r.unklar ? ` · nicht erkannt: ${r.unklar} (${r.pruefung?.dauerMs} ms, Spitze ${r.pruefung?.spitzeDb} dBFS, Grund ${r.pruefung?.grundDb} dBFS)` : ` · Text nach ${gesamt} ms (Erkennung ${r.ms} ms${r.ladeMs ? `, Laden ${r.ladeMs} ms` : ''}${r.zweiterLauf ? ', 2. Lauf wegen Wiederholung' : ''}, ${r.modell.replace('ggml-', '').replace('.bin', '')})`;
    werte.textContent += zusatz;
    console.info('[sticky] sprache', JSON.stringify({ dauer: a.dauerMs, gesamt, erkennung: r.ms, laden: r.ladeMs, modell: r.modell, zweiter: r.zweiterLauf, text: r.text, umweg: Math.round(tErk - a.tLos) }));
    const spaet = Date.now() - a.start - a.dauerMs > VERSPAETET_MS;
    // Push-to-Talk (SPEC „Push-to-Talk“, Weg 1): frischer, sicher erkannter Text gleich in die Zwischenablage
    if (pttAblage() && r.text && !r.unklar && !spaet) {
      Clipboard.write({ string: r.text }).then(() => { kopieren.textContent = 'Kopiert ✓'; eintrag('Diktat in der Zwischenablage'); }).catch((e) => eintrag(`Zwischenablage: ${e.message}`, true));
    }
    neueNotiz({ t: a.start, art: 'diktat', text: r.text || '', ...(a.wer ? { geraet: a.wer } : {}), ...((a.sitzung ? a.sitzung.z : zwilling).geraet.fahrt ? { faehrt: true } : {}), ...(r.roh ? { roh: r.roh } : {}), ...(r.unklar ? { unklar: r.unklar } : {}), audio: nativ ? `aufnahmen/${name}` : name, dauerMs: a.dauerMs, ...(spaet ? { offline: true } : {}) },
      spaet ? null : a.ort, 'Diktat', a.sitzung);
  }).catch((e) => {
    text.className = 'text';
    text.textContent = `Erkennung fehlgeschlagen: ${e.message}`;
  });
  $('aufnahmen').prepend(li);
  // Latenz: Taste losgelassen → Wiedergabe startet
  player.addEventListener('playing', () => {
    const ms = Math.round(performance.now() - a.tLos);
    werte.textContent += ` · Loslassen→Abspielen ${ms} ms`;
    console.info('[sticky] audio', JSON.stringify({ dauer: a.dauerMs, kbitS: a.kbitS, pakete: a.pakete, verlust, latenz: ms, spitze: a.spitze }));
  }, { once: true });
  player.play().catch(() => werte.textContent += ' · (zum Abspielen ▶ tippen)');
  try {
    const pfad = await speichern(name, a.wav);
    if (pfad) eintrag(`Aufnahme gespeichert: ${pfad}`);
  } catch (e) { eintrag(`Speichern fehlgeschlagen: ${e.message}`, true); }
}

// Der Sticky schlummert im Akkubetrieb nach 1 min ohne Bedienung (Firmware 0.8.0, ab 0.31.7 1 statt 2 min, schlaf.h) und meldet das vorher
let stickySchlaeft = false;
zwilling.beobachte((art, d) => {
  if (art === 'zustand') stickySchlaeft = false;
  if (art === 'aufnahmeLaeuft') { $('aufnahmeStatus').hidden = false; ortBeiAufnahme = notizen.standort(); }
  if (art === 'aufnahme') { $('aufnahmeStatus').hidden = true; d.ort = ortBeiAufnahme; zeigeAufnahme(d); }
  if (art === 'zustand' && d.us != null && fwAb('0.31.0')) {   // Einheiten am Sticky geändert: Home neu zeichnen (°C/°F)
    const us = !!d.us;
    if (us !== letzteEinheitUs) { const vorher = letzteEinheitUs; letzteEinheitUs = us; setzeEinheitUs(us); if (vorher != null && zwilling.verbunden) abgleich().catch((e) => eintrag(e.message, true)); }
  }
  if (art === 'zustand') { zeigeZustand(d); if (d.modus) spiegelSetze({ modus: d.modus, w: d.w ?? '', lh: d.lh ?? (d.modus === 'home' || d.modus === 'notiz' ? 1 : 0), bb: d.bb ?? 0, zettel: d.zettel ?? 0, bat: d.bat, usb: !!d.usb, verbunden: true }); if (!spiegel.hatFoto()) fotoAnstossen(); }
  else if (art === 'log') { if (!(stickySchlaeft && /^Verbinde mit/.test(d))) eintrag(d); }   // schlummert: Versuche nicht mitschreiben
  else if (art === 'getrennt') {
    if (stickySchlaeft) eintrag('Sticky schlummert (spart Akku) – Taste weckt ihn, sonst meldet er sich zur vollen Stunde');
    else eintrag(autoVerbinden ? 'Verbindung weg – versuche alle 15 s neu' : 'Verbindung getrennt', true);
    console.info('[sticky] getrennt');
    spiegelSetze({ verbunden: false, aufnahme: false });
    zeigeVerbindung();
    if (autoVerbinden && !wiederTimer) wiederTimer = setTimeout(wiederverbinden, 3000);
  }
  else if (art === 'ereignis') {
    if (d.t === 'key' && d.a === 'down') eintrag(`Taste ${TASTEN[d.k] || d.k} gedrückt`);
    if (d.t === 'key' && d.a === 'up') fotoAnstossen();
    else if (d.t === 'touch' && d.a === 'down' && stickyModus === 'app') { appSeite.tipp(d.x, d.y).catch((e) => eintrag(`App-Seite: ${e.message}`, true)); }
    else if (d.t === 'touch' && d.a === 'down') { eintrag(`Touch bei ${d.x}, ${d.y}`); touchMarke(d.x, d.y); fahrtTouch(d.x, d.y, d.ms); }
    else if (d.t === 'pong') eintrag('Pong');
    else if (d.t === 'suchen') handyKlingeln();
    else if (d.t === 'suche') eintrag(d.a === 'gefunden' ? 'Sticky gefunden' : 'Sticky piept');
    else if (d.t === 'schlaf') stickySchlaeft = true;
    else if (d.t === 'modus') { spiegelSetze({ modus: d.m, w: d.w ?? '', lh: d.lh ?? 0, ...(d.zettel != null ? { zettel: d.zettel } : {}), verbunden: true }); stickyModus = d.m; imBordbuch = d.m === 'bordbuch'; fotoAnstossen(); eintrag(`Modus: ${{ home: 'Home', notiz: 'Notiz', bordbuch: 'Bordbuch', kritzel: 'Kritzelblock', schrift: 'Strichschrift', app: 'App-Seite', widget: 'Widget', bestell: `Bestellzettel ${(d.zettel ?? 0) + 1}` }[d.m] ?? d.m}`); if (d.m === 'app') { if (d.hoch != null) appSeite.hoch = !!d.hoch; } duellPruefen(); if (d.m === 'app' && !imDuell()) appSeite.zeigen().catch((e) => eintrag(`App-Seite: ${e.message}`, true)); }
    else if (d.t === 'seite') { $('bbStatus').textContent = `Sticky zeigt Bordbuch-Seite ${d.n + 1} von ${d.von}`; spiegelSetze({ bb: d.n }); }
    else if (d.t === 'audio' && (d.a === 'start' || d.a === 'stop')) spiegelSetze({ aufnahme: d.a === 'start' });
    else if (d.t === 'bordbuch') eintrag(`Bordbuch auf dem Sticky: ${d.seiten} Seiten, ${d.belegtKB} KB`);
    else if (d.t === 'audio' && d.a === 'fehler') { eintrag(`Aufnahme nicht möglich: ${d.err}`, true); $('aufnahmeStatus').hidden = true; }
  }
});

function zeigeZustand(z) {
  const teile = [];
  if (z.bat >= 0) teile.push(`Akku ${z.bat} %${z.chg ? ' ⚡' : ''}`);
  if (z.mtu) teile.push(`MTU ${z.mtu}`);
  if (z.phy) teile.push(z.phy === 2 ? '2M' : '1M');
  if (z.itvl) teile.push(`${(z.itvl * 1.25).toFixed(1)} ms`);
  if (z.fw) teile.push(`FW ${z.fw}`);
  if (z.temp > -99) teile.push(`${z.temp.toFixed(1).replace('.', ',')} °C, ${Math.round(z.rf)} %${z.temp - z.taupunkt < 2 ? ' · beschlägt' : ''}`);
  if (z.fahrt) teile.push('fährt');
  $('geraet').textContent = teile.join(' · ');
  pruefeAbgleich();
}

function zeigeVerbindung() {
  geraeteZeigen();
  const an = zwilling.verbunden;
  $('status').textContent = an ? verbindung.name : 'getrennt';
  $('status').className = `pille ${an ? 'ein' : 'aus'}`;
  $('verbinden').textContent = an ? 'Trennen' : wiederTimer ? 'Wiederverbinden stoppen' : 'Verbinden';
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
  return Promise.race([p, new Promise((_, nein) => { zeit = setTimeout(() => nein(new Error(`${was}: keine Antwort nach ${ms / 1000} s`)), ms); })])
    .finally(() => clearTimeout(zeit));
}

async function wiederverbinden() {
  wiederTimer = 0;
  if (!autoVerbinden || zwilling.verbunden || verbindeGerade || !(verbindung instanceof BleVerbindung)) return;
  verbindeGerade = true;
  letzterVersuch = Date.now();
  try {
    await mitFrist(verbindung.verbinden({ nurGemerkt: true }), VERBINDEN_FRIST_MS, 'Verbinden').catch(async (e) => {
      await verbindung.abbrechen?.().catch(() => {});   // halbe Verbindung lösen, sonst blockiert sie den nächsten Versuch
      throw e;
    });
    eintrag(`Wieder verbunden mit ${verbindung.name}`);
    console.info('[sticky] wieder verbunden');
    zeigeVerbindung();
    abgleich().catch((e) => eintrag(`Abgleich: ${e.message}`, true));
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
  if (!liste.length) { ul.innerHTML = '<li class="klein">Noch kein Sticky – auf dem Sticky-Tab „Verbinden“ tippen.</li>'; return; }
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
    profil.title = 'Profil';
    profil.innerHTML = Object.entries(PROFILE).map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
    profil.value = g.profil;
    profil.onchange = () => {
      geraetAendern(g.id, { profil: profil.value });
      if (istAktiv) wechselnZu(null, `Profil „${PROFILE[profil.value]}“ für ${g.name}`);
    };
    const link = Object.assign(document.createElement('input'), { value: g.link ?? '', placeholder: 'Link für den QR-Code auf Home (leer = keiner)', title: 'QR-Code auf Home' });
    link.onchange = () => {
      geraetAendern(g.id, { link: link.value.trim() || undefined });
      if (istAktiv && zwilling.verbunden) abgleich().catch((e) => eintrag(e.message, true));
      else { const s = sitzungen.get(g.id); if (s?.z.verbunden) hintergrundAbgleich(s).catch(() => {}); }
    };
    const mac = Object.assign(document.createElement('span'), { className: 'klein', textContent: g.id });
    const hg = sitzungen.get(g.id);
    if (hg) mac.textContent += hg.z.verbunden ? ` · im Hintergrund verbunden${hg.z.geraet.bat != null ? ` · Akku ${hg.z.geraet.bat} %` : ''}`
      : hg.zuletzt ? ` · zuletzt ${uhrzeit(new Date(hg.zuletzt))}` : ' · wartet auf den Sticky';
    else if (istAktiv && zwilling.verbunden && zwilling.geraet.bat != null) mac.textContent += ` · Akku ${zwilling.geraet.bat} %`;
    const knopf = Object.assign(document.createElement('button'), { textContent: istAktiv ? (zwilling.verbunden ? '● verbunden' : '● aktiv') : 'Wechseln' });
    knopf.disabled = istAktiv;
    knopf.onclick = () => wechselnZu(g.id, `Gewechselt zu ${g.name}`);
    const weg = Object.assign(document.createElement('button'), { textContent: 'Vergessen' });
    weg.onclick = async () => {
      if (!confirm(`${g.name} vergessen? Sein Abgleich-Stand in der App wird gelöscht; das Profil bleibt.`)) return;
      // Vor der Weitergabe: auch auf dem Sticky alles Persönliche löschen (Karte /soll und /ist, interner Speicher)
      const z = istAktiv ? zwilling : sitzungen.get(g.id)?.z;
      const kannLeeren = z?.verbunden && baue(istAktiv ? null : sitzungen.get(g.id), () => fwAb('0.31.6'));
      if (kannLeeren && confirm(`Auch ${g.name} selbst leeren? Notizen, Zettel, Bordbuch, Visitenkarte und alles auf der Karte werden dort gelöscht – zum Weitergeben. Danach startet er neu und ist leer.`)) {
        try {
          const r = await z.leeren();
          eintrag(`${g.name} geleert (${r.dateien} Dateien auf der Karte${r.ok ? ', interner Speicher formatiert' : ', interner Speicher NICHT formatiert'})`, !r.ok);
        } catch (e) { eintrag(`${g.name} leeren: ${e.message}`, true); return; }
      } else if (!kannLeeren) eintrag(`${g.name}: zum Leeren muss er verbunden sein (Firmware ab 0.31.6) – sonst bleibt seine Karte, wie sie ist`);
      const s = sitzungen.get(g.id);
      if (s) { s.weg = true; clearTimeout(s.timer); await s.v.trennen().catch(() => {}); sitzungen.delete(g.id); }
      geraetVergessen(g.id);
      if (istAktiv) wechselnZu(null, `${g.name} vergessen`); else geraeteZeigen();
    };
    li.append(name, profil, link, mac, knopf, weg);
    ul.append(li);
  }
}
$('geraetNeu').onclick = async () => {
  const knopf = $('geraetNeu');
  knopf.disabled = true;
  knopf.textContent = 'Suche neuen Sticky …';
  try {
    autoVerbinden = false;
    clearTimeout(wiederTimer);
    if (zwilling.verbunden) await verbindung.trennen().catch(() => {});
    verbindung = new BleVerbindung();
    zwilling.anbinden(verbindung);
    await verbindung.verbinden({ neu: true });   // bekannte Stickys werden übersprungen; der neue wird aktiv
    await verbindung.trennen().catch(() => {});
    await wechselnZu(null, `${verbindung.name} hinzugefügt (Profil „EDC“, in der Liste änderbar)`);
  } catch (e) {
    eintrag(`Sticky hinzufügen: ${e.message || e}`, true);
    knopf.disabled = false;
    knopf.textContent = 'Sticky hinzufügen';
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
  knopf.textContent = 'Suche …';
  try {
    verbindung = !nativ && $('sim').checked ? new SimVerbindung() : new BleVerbindung();
    zwilling.anbinden(verbindung);
    await verbindung.verbinden();
    eintrag(`Verbunden mit ${verbindung.name} (MTU ${verbindung.mtu})`);
    autoVerbinden = true;
    Hintergrund.start({ text: 'Notizen und Diktate kommen an', adresse: stickyAdresse() }).catch((e) => eintrag(`Hintergrund-Dienst: ${e.message}`, true));
    abgleich().catch((e) => eintrag(`Abgleich: ${e.message}`, true));
    hintergrundStarten();
  } catch (e) {
    eintrag(`Verbinden fehlgeschlagen: ${e.message || e}`, true);
  } finally {
    knopf.disabled = false;
    zeigeVerbindung();
  }
};

$('senden').onclick = async () => {
  const knopf = $('senden');
  knopf.disabled = true;
  knopf.textContent = 'Sende …';
  const balken = $('balken').firstElementChild;
  try {
    const m = await zwilling.sendeBild(bildBytes(), {
      schnell: $('schnell').checked,
      fortschritt: (f) => { balken.style.width = `${Math.round(f * 100)}%`; },
    });
    const text = `Bild angekommen: Funk ${m.funk} ms (Anlauf ${m.anlauf} ms${m.warSchnell ? '' : ', nicht schnell'}), Anzeige ${m.anzeige} ms, gesamt ${m.gesamt} ms · ${m.rahmen}×${m.nutzlast} B, MTU ${m.mtu}, ${m.phy === 2 ? '2M' : '1M'}, DLE ${m.dle ?? '?'}`;
    eintrag(text);
    $('messung').textContent = `Letztes Bild: ${m.funk} ms Funk, ${m.gesamt} ms gesamt`;
    console.info('[sticky] messung', JSON.stringify(m));
  } catch (e) {
    eintrag(e.message || String(e), true);
  } finally {
    knopf.textContent = 'Senden';
    knopf.disabled = !zwilling.verbunden;
    setTimeout(() => { balken.style.width = '0'; }, 800);
    pruefeAbgleich();
  }
};

$('karte').onclick = async () => {
  try { await zwilling.zeigeKarte(); eintrag('Visitenkarte angefordert'); } catch (e) { eintrag(e.message, true); }
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
  .then((r) => r?.ladeMs && eintrag(`Sprachmodell geladen (${r.ladeMs} ms)`))
  .catch((e) => eintrag(`Sprachmodell fehlt: ${e.message}`, true));
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
    eintrag(`Burgduell: ${kurz(aktivesGeraet())} gegen ${kurz(s.g)}`);
    appSeite.zeigen().catch((e) => eintrag(`Burgduell: ${e.message}`, true));
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
  eintrag(`Fahrt-Seite gezeigt (${m.gesamt} ms)`);
  pruefeAbgleich();
}
$('fahrtZeigen').onclick = () => zwilling.modusSetzen(2).catch((e) => eintrag(e.message, true));
$('homeZeigen').onclick = () => zwilling.modusSetzen(0).catch((e) => eintrag(e.message, true));
// Gegenseitig suchen (FW ≥ 0.25.0): Knopf lässt den Sticky piepen; KI 3× am Sticky lässt das Handy klingeln
$('stickySuchen').onclick = () => {
  if (!fwAb('0.25.0')) { eintrag('Sticky suchen braucht Firmware 0.25.0', true); return; }
  zwilling.suchen(30).then(() => eintrag('Sticky piept – Taste am Sticky drücken, wenn gefunden')).catch((e) => eintrag(e.message, true));
};
function handyKlingeln() {
  eintrag('Sticky sucht das Handy');
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
  if (bloecke > 6) eintrag(`Zettel: ${bloecke} eingetragen, der Sticky zeigt nur die ersten 6`, true);
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
  try { n = await notizen.notiere(teile, ort); } catch (e) { eintrag(`Notiz nicht gespeichert: ${e.message}`, true); return; }
  zeigeNotiz(n, true);
  const modus = s ? s.modus : stickyModus;   // Hintergrund-Sticky: Bestätigung an IHN, nicht an den aktiven
  if (modus === 'notiz' || modus === 'home') {   // Rückmeldefeld gibt es auf beiden Seiten
    const zeit = uhrzeit(n.t);
    const r = rueckmeldung(`✓ ${kurz} ${zeit}`);
    if (!s) spiegel.meldung(`✓ ${kurz} ${zeit}`);
    (s?.z ?? zwilling).sendeBild(r.bytes, { bereich: r.bereich }).catch((e) => eintrag(`Rückmeldung: ${e.message}`, true));
  }
}

function zeigeNotiz(n, neu = false) {
  const li = document.createElement('li');
  li.className = `${n.art}${neu ? ' neu' : ''}`;
  const kopf = document.createElement('div');
  kopf.className = 'kopf';
  const ort = n.lat != null ? `${n.lat.toFixed(5)}, ${n.lon.toFixed(5)} (±${n.gen} m)` : n.offline ? 'ohne Handy aufgenommen' : 'ohne GPS';
  kopf.textContent = `${uhrzeit(n.t, true)} · ${ort}`;
  // Sorte als Schild; Antippen schaltet weiter (von Hand gilt dann)
  const schild = document.createElement('span');
  schild.className = `sorte ${n.sorte ?? 'eingang'}`;
  const schildText = () => { schild.textContent = SORTEN[n.sorte ?? 'eingang'].name; schild.title = `${SORTEN[n.sorte ?? 'eingang'].ziel}${n.sorteGrund ? ` · ${n.sorteGrund}` : ''}`; };
  schildText();
  schild.onclick = async (e) => {
    e.stopPropagation();
    const neu = naechsteSorte(n.sorte ?? 'eingang');
    try { await notizen.setzen(n.t, (x) => { x.sorte = neu; x.sorteGrund = 'von Hand'; }); } catch (err) { eintrag(`Sorte nicht gespeichert: ${err.message}`, true); return; }
    n.sorte = neu; n.sorteGrund = 'von Hand';
    schildText();
  };
  kopf.append(' ', schild);
  const was = document.createElement('div');
  was.className = 'was';
  was.textContent = n.art === 'diktat' ? `🎙 ${n.text || '(nichts erkannt)'}` : n.art === 'kritzel' ? '✎ Kritzel' : n.art === 'schrift' ? `✍ ${n.text}` : n.knopf;
  if (n.art === 'kritzel' && n.bild) {
    const img = document.createElement('img');
    img.className = 'kritzel';
    img.alt = 'Kritzel vom Sticky';
    const name = n.bild.split('/').pop();
    (nativ ? Filesystem.readFile({ path: n.bild, directory: Directory.Data }).then((r) => r.data) : Promise.resolve(kritzelSim[name]))
      .then((b64) => { if (b64) img.src = `data:image/png;base64,${b64}`; }).catch(() => {});
    was.append(img);
  }
  if (n.art === 'diktat' && n.text) {
    // Korrigieren direkt in der Liste (13.11.2026: der Android-Dialog von window.prompt verschwand und speicherte leer)
    was.title = 'Antippen zum Korrigieren';
    was.onclick = () => {
      if (li.querySelector('textarea')) return;
      const feld = Object.assign(document.createElement('textarea'), { value: n.text, rows: 3 });
      feld.style.width = '100%';
      const ok = Object.assign(document.createElement('button'), { textContent: 'Speichern', className: 'haupt' });
      const weg = Object.assign(document.createElement('button'), { textContent: 'Abbrechen' });
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
        try { await notizen.aendern(n.t, neu); } catch (e) { eintrag(`Ändern fehlgeschlagen: ${e.message}`, true); return; }
        n.text = neu;
        was.textContent = `🎙 ${n.text}`;
        schliessen();
        if (gelernt.length) {
          $('woerterbuch').value = paareText(einpflegen(woerterbuch(), gelernt));
          $('woerterbuch').onchange();
          eintrag(`Gelernt: ${gelernt.map((p) => `${p.falsch} → ${p.richtig}`).join(', ')}`);
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
  try { await abgleichKern(); } finally { vordergrundGleichtAb = false; }
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
  zeichneHome(g, karteFuer(aktivesGeraet(), KARTE), null, wetter);
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
    eintrag(`Home: ${n} Dateien aufgespielt`);
  } else if (zwilling.geraet.homev !== homeV) {
    // Nur geänderte Bilder senden (das Wetter ändert meist nur die Karte); unbekannt → alle
    let alt = null;
    try { alt = JSON.parse(localStorage.getItem(schluessel('homecrcs')) || 'null'); } catch { /* egal */ }
    const crcs = alle.map((b) => crc32(b));
    const vollstaendig = !alt || alt.version !== zwilling.geraet.homev || alt.crcs.length !== crcs.length;
    for (let i = 0; i < alle.length; i++) if (vollstaendig || alt.crcs[i] !== crcs[i]) await zwilling.sendeBild(alle[i], { home: i });
    await zwilling.homeVersion(homeV);
    try { localStorage.setItem(schluessel('homecrcs'), JSON.stringify({ version: homeV, crcs })); } catch { /* egal */ }
    eintrag(`Home-Karte, Notiz-Seite, Uhr und ${zettelBilder.length} Zettel/Karten aufgespielt`);
  }
  zeichneHome(g, karteFuer(aktivesGeraet(), KARTE), uhrzeit(new Date()), wetter);
  pruefeAbgleich();
  if (zwilling.geraet.modus) stickyModus = zwilling.geraet.modus;
  if (zwilling.geraet.fahrtv !== version && fwAb('0.11.0')) {
    const k = knoepfe();
    const texte = [0, 1, 2, 3, 4].map((i) => (k[i] ? `✓ ${k[i]}` : null)).concat(['✓ Diktat gespeichert', '● Aufnahme']);
    const dateien = texte.map((t, i) => (t ? { n: `r${String(i).padStart(2, '0')}.bin`, daten: (({ bytes, bereich }) => rueckDatei(bytes, bereich))(rueckmeldung(t)) } : null)).filter(Boolean);
    dateien.push({ n: 'layout.txt', daten: new TextEncoder().encode(text) });
    await zwilling.sollAbgleich('notiz', dateien);
    eintrag('Sticky kann jetzt auch ohne Handy Notizen sammeln');
  } else if (zwilling.geraet.fahrtv !== version) {
    await zwilling.fahrtLayout(text);
    const k = knoepfe();
    const texte = [0, 1, 2, 3, 4].map((i) => (k[i] ? `✓ ${k[i]}` : null)).concat(['✓ Diktat gespeichert', '● Aufnahme']);
    for (let i = 0; i < texte.length; i++) {
      if (!texte[i]) continue;
      const r = rueckmeldung(texte[i]);
      await zwilling.sendeBild(r.bytes, { bereich: r.bereich, rueck: i });
    }
    eintrag('Sticky kann jetzt auch ohne Handy Notizen sammeln');
  }
  await pufferAbholen();
  if (fwAb('0.13.0')) await karussellAufspielen().catch((e) => eintrag(`Karussell: ${e.message}`, true));
  if (fwAb('0.15.0')) await hilfeAufspielen().catch((e) => eintrag(`Hilfe: ${e.message}`, true));
  if (fwAb('0.27.0')) {   // Strichschrift: Alphabet, Glyphen und Hintergrund (Vorlagen in strichschrift.js)
    const n = await zwilling.sollAbgleich('schrift', [{ n: 'zeichen.bin', daten: glyphenBlatt() }, { n: 'bild.bin', daten: schriftHintergrund() },
      { n: 'alphabet.txt', daten: alphabetDatei() }]).catch((e) => { eintrag(`Schrift: ${e.message}`, true); return 0; });
    if (n) eintrag('Strichschrift aufgespielt');
  }
  if (fwAb('0.18.0')) {   // Widget-Maschine: nur Geändertes geht rüber (Bestandsliste je Widget)
    appSeite.hoch = hochkant('app');
    for (const [name, bauen] of Object.entries(widgetBauer())) {   // in ihrer Lage; Menü-Kacheln = Karussell
      const n = await zwilling.sollAbgleich(`widgets/${name}`, bauen()).catch((e) => { eintrag(`Widget ${name}: ${e.message}`, true); return 0; });
      if (n) eintrag(`Widget „${name}“ aufgespielt`);
    }
    if (fwAb('0.21.0')) await einstellungenAufspielen().catch((e) => eintrag(`Lage: ${e.message}`, true));
  }
  if (fwAb('0.10.0')) await fahrtenschreiberAbholen().catch((e) => eintrag(`Fahrtenschreiber: ${e.message}`, true));
}

// ---- Karussell (SPEC „Bedienung und Oberfläche“): Reihe, durch die ▲/▼ am Sticky blättern -------------------------
const KARUSSELL_STANDARD = 'Home, Timer, Wecker, Weltzeit, Waage, Lineal, Notiz, Kritzel, Schrift, Rechner, Umrechner, Bordbuch, Zettel, Spiel, Einstellungen';
const KARUSSELL_WOERTER = { home: 'home', notiz: 'notiz', bordbuch: 'bordbuch', zettel: 'zettel', bestellzettel: 'zettel', kritzel: 'kritzel', kritzelblock: 'kritzel', schrift: 'schrift', strichschrift: 'schrift', app: 'app', spiel: 'app', burgduell: 'app', rechner: 'app', umrechner: 'app', timer: 'widget timer', waage: 'widget waage', wasserwaage: 'widget waage', lineal: 'widget lineal', wecker: 'widget wecker', weltzeit: 'widget weltzeit', einstellungen: 'widget einstellungen' };
function karussellText() {
  // Rechner/Umrechner rechnen ab FW 0.28.0 im Sticky (Widgets); vorher über die App-Seite
  const lokal = fwAb('0.28.0'), wort = (w) => (lokal && (w === 'rechner' || w === 'umrechner') ? `widget ${w}` : KARUSSELL_WOERTER[w]);
  const roh = (localStorage.getItem(schluessel('karussell')) || KARUSSELL_STANDARD).split(/[,;\n]/).map((w) => wort(w.trim().toLowerCase())).filter(Boolean);
  return [...new Set(roh)].join('\n') + '\n';
}
/** Tastenhilfe je Modus (▲+▼ am Sticky): auf eigener Leinwand rendern, damit die Vorschau bleibt, wie sie ist */
function hilfeDateien() {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(BREITE, HOEHE) : Object.assign(document.createElement('canvas'), { width: BREITE, height: HOEHE });
  const h = c.getContext('2d', { willReadFrequently: true });
  return Object.entries(HILFE).map(([modus, seite]) => {
    bb.zeichneTextseite(h, seite, '▲+▼ = Hilfe');
    return { n: `${modus}.bin`, daten: rgbaZu1bpp(h.getImageData(0, 0, BREITE, HOEHE).data) };
  }).concat(fwAb('0.27.0') ? [{ n: 'schrift.bin', daten: schriftHilfe() }] : []);   // Alphabet als Spickzettel
}
async function hilfeAufspielen(s = null) {
  const dateien = baue(s, hilfeDateien);
  const n = await (s?.z ?? zwilling).sollAbgleich('hilfe', dateien);
  if (n) eintrag(`${s ? `${s.g.name}: ` : ''}Tastenhilfe aufgespielt (${n} Seiten)`);
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
  if (n) eintrag(`Karussell: ${karussellText().trim().split('\n').join(' → ')}`);
  // Menü-Kacheln folgen dem Karussell (FW ≥ 0.19.0)
  if (n && fwAb('0.19.0')) for (const [name, bauen] of Object.entries(widgetBauer())) if (name.startsWith('menue')) await zwilling.sollAbgleich(`widgets/${name}`, bauen());
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
const widgetFunktionen = () => ({ ...WIDGETS, menue: (h) => menueWidget(karussellText().trim().split('\n'), h) });
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
  if (n) eintrag(`Lage: ${Object.entries(lagen()).map(([s, l]) => `${LAGE_NAMEN[s]} ${{ hoch: 'hochkant', quer: 'quer', auto: 'automatisch' }[l]}`).join(', ')}`);
  if (stickyModus === 'app') await appSeite.zeigen();
}
for (const [seite, name] of Object.entries(LAGE_NAMEN)) {
  const zeile = document.createElement('label');
  zeile.className = 'lage';
  const wahl = document.createElement('select');
  wahl.innerHTML = '<option value="hoch">hochkant</option><option value="quer">quer</option><option value="auto">automatisch (Sensor)</option>';
  wahl.value = lagen()[seite];
  wahl.onchange = () => {
    const l = lagen();
    l[seite] = wahl.value;
    try { localStorage.setItem(schluessel('lagen'), JSON.stringify(l)); } catch { /* egal */ }
    lageAufspielen().catch((e) => eintrag(`Lage: ${e.message}`, true));
  };
  zeile.append(`${name} `, wahl);
  $('lagen').append(zeile);
}

// Lineal kalibrieren: die 80-mm-Marke mit einem echten Lineal nachmessen und eintragen
try { $('lineal80').value = localStorage.getItem(schluessel('lineal80')) || '80'; } catch { $('lineal80').value = '80'; }
$('lineal80').onchange = () => {
  const v = parseFloat(String($('lineal80').value).replace(',', '.'));
  if (!(v > 60 && v < 100)) { eintrag('Lineal: bitte einen Wert um 80 mm eintragen', true); return; }
  try { localStorage.setItem(schluessel('lineal80'), String(v)); } catch { /* egal */ }
  if (zwilling.verbunden && fwAb('0.18.0')) zwilling.sollAbgleich('widgets/lineal', WIDGETS.lineal()).then((n) => n && eintrag(`Lineal neu kalibriert (80 mm = ${v} mm)`)).catch((e) => eintrag(e.message, true));
};

$('dreh180').checked = dreh180();
$('dreh180').onchange = () => {
  try { localStorage.setItem(schluessel('dreh180'), $('dreh180').checked ? '1' : '0'); } catch { /* egal */ }
  if (zwilling.verbunden && fwAb('0.21.0')) einstellungenAufspielen().then((n) => n && eintrag(`Sticky ${$('dreh180').checked ? 'auf dem Kopf' : 'normal'}`)).catch((e) => eintrag(`Lage: ${e.message}`, true));
};

$('pttAblage').checked = pttAblage();
$('pttAblage').onchange = () => { try { localStorage.setItem('sticky.pttAblage', $('pttAblage').checked ? '1' : '0'); } catch { /* egal */ } };

$('karussell').value = localStorage.getItem(schluessel('karussell')) || KARUSSELL_STANDARD;
$('karussell').onchange = () => {
  localStorage.setItem(schluessel('karussell'), $('karussell').value);
  if (zwilling.verbunden && fwAb('0.13.0')) karussellAufspielen().catch((e) => eintrag(`Karussell: ${e.message}`, true));
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
  if (!s) return fn();
  const alt = bauZ;
  bauZ = s.z;
  try { return mitGeraet(s.g, fn); } finally { bauZ = alt; }
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
  if (liste.length) eintrag(`${liste.length} ${liste.length === 1 ? 'Kritzel' : 'Kritzel'} vom Sticky abgeholt`);
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
  if (liste.length) eintrag(`${liste.length} geschriebene ${liste.length === 1 ? 'Notiz' : 'Notizen'} vom Sticky abgeholt`);
}

async function fahrtenschreiberAbholen(s = null) {
  const zeilen = await istAbholen('log', LOG_ORDNER, s);
  if (zeilen) eintrag(`${s ? `${s.g.name}: ` : ''}Fahrtenschreiber: ${zeilen} neue ${zeilen === 1 ? 'Zeile' : 'Zeilen'}`);
  if (!s) await zeigeFahrtenschreiber();
  if (fwAbZ(s, '0.16.0')) await kritzelAbholen(s).catch((e) => eintrag(`Kritzel: ${e.message}`, true));
  if (fwAbZ(s, '0.27.0')) await schriftAbholen(s).catch((e) => eintrag(`Schrift: ${e.message}`, true));
  if (fwAbZ(s, '0.12.0')) {
    const mess = await istAbholen('mess', 'messreihen', s);
    if (mess) eintrag(`${s ? `${s.g.name}: ` : ''}Messreihen: ${mess} neue Werte`);
  }
}

async function zeigeFahrtenschreiber(tag = $('logTag').value) {
  const tage = await logTage();
  const wahl = $('logTag');
  const vorher = tag || tage[0];
  wahl.replaceChildren(...tage.map((t) => new Option(t.replace('.txt', ''), t)));
  if (vorher && tage.includes(vorher)) wahl.value = vorher;
  const text = wahl.value ? await logLesen(wahl.value) : '';
  $('logText').textContent = text ? text.replace(/\r/g, '').split('\n').reverse().join('\n').trim() : 'noch nichts abgeholt';
}
$('logTag').onchange = () => zeigeFahrtenschreiber();
$('logHolen').onclick = () => fahrtenschreiberAbholen().catch((e) => eintrag(`Fahrtenschreiber: ${e.message}`, true));
zeigeFahrtenschreiber();

// Ab FW 0.11.0 liegt der Puffer unter /ist/puffer und geht über den allgemeinen Datei-Abgleich
const puffer = {
  liste: (s) => { const z = s?.z ?? zwilling; return fwAbZ(s, '0.11.0') ? z.liste('/ist/puffer') : z.pufferListe(); },
  holen: (n, b, s) => { const z = s?.z ?? zwilling; return fwAbZ(s, '0.11.0') ? z.holen(`/ist/puffer/${n}`, b) : z.pufferHolen(n, b); },
  loeschen: (n, s) => { const z = s?.z ?? zwilling; return fwAbZ(s, '0.11.0') ? z.loeschen(`/ist/puffer/${n}`) : z.pufferLoeschen(n); },
};

async function pufferAbholen(s = null) {
  const wer = s ? { geraet: kurz(s.g) } : {}, vor = s ? `${s.g.name}: ` : '';
  const liste = (await puffer.liste(s)).filter((d) => !d.ordner);
  if (!liste.length) return;
  eintrag(`${vor}Hole Notizen vom Sticky (${liste.length} Dateien) …`);
  const groesse = Object.fromEntries(liste.map((d) => [d.n, d.b]));
  const roh = groesse['notizen.jsonl'] ? new TextDecoder().decode(await puffer.holen('notizen.jsonl', groesse['notizen.jsonl'], s)) : '';
  const zeilen = roh.split('\n').map((z) => { try { return JSON.parse(z); } catch { return null; } }).filter(Boolean);
  // Aufnahmen ohne Notiz-Zeile (z. B. nach einem abgebrochenen Abholen) trotzdem mitnehmen
  for (const d of liste) {
    if (d.n.endsWith('.adp') && !zeilen.some((z) => z.audio === d.n)) zeilen.push({ t: 0, art: 'diktat', audio: d.n });
  }
  let anzahl = 0;
  for (const z of zeilen) {
    const t = z.t > 1.7e12 ? z.t : Date.now();   // 0 = Sticky kannte die Uhrzeit nicht
    let n;
    if (z.art === 'diktat' && z.audio) {
      let text = '', pfad = null, dauerMs = z.dauerMs;
      try {
        if (groesse[z.audio] == null) throw new Error('Audiodatei fehlt auf dem Sticky');
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
      } catch (e) { eintrag(`Diktat ${z.audio}: ${e.message}`, true); }
      n = await notizen.notiere({ t, art: 'diktat', text, audio: pfad ?? z.audio, dauerMs, offline: true, ...wer });
    } else {
      n = await notizen.notiere({ t, art: 'knopf', knopf: z.knopf, offline: true, ...wer });
    }
    zeigeNotiz(n, true);
    anzahl++;
  }
  if (groesse['notizen.jsonl']) await puffer.loeschen('notizen.jsonl', s);
  eintrag(`${vor}${anzahl} Notizen vom Sticky abgeholt`);
}

$('notizenTeilen').onclick = async () => {
  try {
    const r = await notizen.teilen();
    if (r === 'leer') eintrag('Heute noch keine Notizen');
  } catch (e) { eintrag(`Teilen fehlgeschlagen: ${e.message}`, true); }
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
  $('pdfName').textContent = `${name} · ${pdf.numPages} Seiten`;
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
      status(`Handbuch rendern: Seite ${p} von ${pdf.numPages}`);
      const teile = await bb.pdfAusschnitte(pdf, p);
      teile.forEach((t, i) => {
        ersteVon[p] ??= hb.length;
        hb.push({ bytes: bb.dithern(bb.marke(t.daten, `S. ${p} · ${i + 1}/${teile.length}`).data), pdfSeite: p, teil: i, von: teile.length });
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
  spick.forEach((s, i) => { bb.zeichneTextseite(g, s, `Spickzettel ${i + 1}/${nSpick} · ${2 + i}/${gesamt}`); seiten.push(bildBytes()); });
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
    const { seiten, index } = await bordbuchBauen(status);
    if (seiten.length > 255) throw new Error(`Zu viele Seiten (${seiten.length}, höchstens 255)`);
    if (fwAb('0.11.0')) {
      // Auf die Karte: nur geänderte Seiten, der Index zuletzt (er lässt den Sticky neu einlesen)
      const dateien = seiten.map((b, i) => ({ n: `${String(i).padStart(2, '0')}.bin`, daten: b }));
      dateien.push({ n: 'index.txt', daten: new TextEncoder().encode(index) });
      const n = await zwilling.sollAbgleich('bordbuch', dateien, (i, von, name) => status(`Aufspielen: ${name} (${i} von ${von} geänderten) …`));
      eintrag(`Bordbuch: ${n} von ${dateien.length} Dateien neu`);
    } else {
      for (let i = 0; i < seiten.length; i++) {
        status(`Aufspielen: Seite ${i + 1} von ${seiten.length} …`);
        await zwilling.sendeBild(seiten[i], { speichern: i });
      }
      await zwilling.bordbuchIndex(index);
    }
    const s = Math.round((performance.now() - t0) / 1000);
    status(`Bordbuch aufgespielt: ${seiten.length} Seiten in ${s} s`);
    eintrag(`Bordbuch aufgespielt (${seiten.length} Seiten, ${s} s)`);
    console.info('[sticky] bordbuch', JSON.stringify({ seiten: seiten.length, sekunden: s }));
  } catch (e) {
    status(`Fehler: ${e.message}`);
    eintrag(`Bordbuch: ${e.message}`, true);
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
  if (e.a === 'inhalt') { bb.zeichneInhalt(h, plan.links, plan.rechts); bild = h.getImageData(0, 0, BREITE, HOEHE); }
  else if (e.a === 'spick') {
    const s = spickSeiten()[e.i];
    if (s) { bb.zeichneTextseite(h, s, `Spickzettel ${e.i + 1}/${e.n} · ${n + 1}/${e.von}`); bild = h.getImageData(0, 0, BREITE, HOEHE); }
  } else if (e.a === 'pdf' && pdf) {
    const teile = await bb.pdfAusschnitte(pdf, e.p);
    if (teile[e.t]) bild = bb.marke(teile[e.t].daten, `S. ${e.p} · ${e.t + 1}/${teile.length}`);
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
    if (v != null && v > 2 && o.gen < 100) {
      if (Date.now() >= fahrtBis) eintrag('Fahrt erkannt – Sticky bleibt wach');
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
    await mitFrist(s.v.verbinden({ geraet: s.g, nurGemerkt: true }), VERBINDEN_FRIST_MS, 'Verbinden').catch(async (e) => {
      await s.v.abbrechen?.().catch(() => {});
      throw e;
    });
    s.zuletzt = Date.now();
    eintrag(`Im Hintergrund verbunden: ${s.g.name}`);
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
  if (!fwAbZ(s, '0.31.0')) { eintrag(`${s.g.name}: Firmware ${z.geraet.fw ?? '?'} ist zu alt für den Hintergrund (ab 0.31)`, true); return; }
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
      const texte = [0, 1, 2, 3, 4].map((i) => (k[i] ? `✓ ${k[i]}` : null)).concat(['✓ Diktat gespeichert', '● Aufnahme']);
      const notizDateien = texte.map((t, i) => (t ? { n: `r${String(i).padStart(2, '0')}.bin`, daten: (({ bytes, bereich }) => rueckDatei(bytes, bereich))(rueckmeldung(t)) } : null))
        .filter(Boolean).concat([{ n: 'layout.txt', daten: new TextEncoder().encode(text) }]);
      const schrift = [{ n: 'zeichen.bin', daten: glyphenBlatt() }, { n: 'bild.bin', daten: schriftHintergrund() }, { n: 'alphabet.txt', daten: alphabetDatei() }];
      const widgets = Object.entries(widgetBauer()).map(([name, bauen]) => [name, bauen()]);
      return { homeV, homeDateien, version, notizDateien, schrift, widgets };
    });
    if (z.geraet.homev !== teile.homeV) { const n = await z.sollAbgleich('home', teile.homeDateien); if (n) eintrag(`${s.g.name}: Home (${n} Dateien)`); }
    if (z.geraet.fahrtv !== teile.version) await z.sollAbgleich('notiz', teile.notizDateien);
    await pufferAbholen(s);
    const nE = await einstellungenAufspielen(s).catch((e) => { eintrag(`${s.g.name}: Karussell: ${e.message}`, true); return 0; });
    if (nE) eintrag(`${s.g.name}: Karussell und Lage aufgespielt`);
    await hilfeAufspielen(s).catch((e) => eintrag(`${s.g.name}: Hilfe: ${e.message}`, true));
    const nS = await z.sollAbgleich('schrift', teile.schrift).catch((e) => { eintrag(`${s.g.name}: Schrift: ${e.message}`, true); return 0; });
    if (nS) eintrag(`${s.g.name}: Strichschrift aufgespielt`);
    for (const [name, dateien] of teile.widgets) {
      const n = await z.sollAbgleich(`widgets/${name}`, dateien).catch((e) => { eintrag(`${s.g.name}: Widget ${name}: ${e.message}`, true); return 0; });
      if (n) eintrag(`${s.g.name}: Widget „${name}“ aufgespielt`);
    }
    await fahrtenschreiberAbholen(s).catch((e) => eintrag(`${s.g.name}: Fahrtenschreiber: ${e.message}`, true));
  }
}

// stündlich Wetter und Stand nachziehen, bei Fahrt wach halten (wie beim aktiven Sticky)
setInterval(() => { for (const s of sitzungen.values()) if (s.z.verbunden) hintergrundAbgleich(s).catch(() => {}); }, 60 * 60 * 1000);
setInterval(() => { if (Date.now() < fahrtBis) for (const s of sitzungen.values()) if (s.z.verbunden) s.z.wach().catch(() => {}); }, 60 * 1000);

// ---- Benachrichtigungen ans Sticky (Test 14.11.2026) ---------------------------------------------------------------
// Der Melder (Android, Positivliste) reicht Titel und Text weiter; am Sticky erscheinen sie kurz im Rückmeldefeld
// (Home und Notiz-Seite), beim aktiven wie bei Hintergrund-Stickys. Nichts wird gespeichert.
async function meldeStatusZeigen() {
  try { const { da } = await Hintergrund.meldeZugriff(); $('meldeStatus').textContent = da ? 'Zugriff: freigegeben ✓' : 'Zugriff: noch nicht freigegeben'; }
  catch { $('meldeStatus').textContent = 'Zugriff: nur in der App auf dem Handy'; }
}
$('meldeZugriff').onclick = () => Hintergrund.meldeZugriffOeffnen().catch((e) => eintrag(e.message, true));
$('meldeTest').onclick = () => Hintergrund.testMeldung({ titel: 'Sticky', text: `Test ${uhrzeit(new Date())}` }).catch((e) => eintrag(e.message, true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') meldeStatusZeigen(); });
meldeStatusZeigen();
Promise.resolve().then(() => Hintergrund.addListener('benachrichtigung', (e) => {
  const zeile = [e.titel, e.text].filter(Boolean).join(': ').replace(/\s+/g, ' ').trim();
  const kurzText = zeile.length > 30 ? zeile.slice(0, 29) + '…' : zeile;
  eintrag(`Meldung: ${zeile}`);
  meldeStatusZeigen();   // kommt eine an, ist der Zugriff offensichtlich frei
  const r = rueckmeldung(kurzText);
  if (zwilling.verbunden && (stickyModus === 'home' || stickyModus === 'notiz')) {
    spiegel.meldung(kurzText);
    zwilling.sendeBild(r.bytes, { bereich: r.bereich }).catch((x) => eintrag(`Meldung: ${x.message}`, true));
  }
  for (const s of sitzungen.values()) {
    if (s.z.verbunden && (s.modus === 'home' || s.modus === 'notiz')) s.z.sendeBild(r.bytes, { bereich: r.bereich }).catch(() => {});
  }
})).catch(() => {});

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
    await appSeite.zeigen().catch((e) => eintrag(`Burgduell: ${e.message}`, true));
  };
  await zeigen();
  while (!spiel.vorbei && spiel.cpuBeide) {
    await warte(3500);
    if (!spiel.cpuBeide) break;
    spiel.nachzug();
    await zeigen();
  }
  eintrag(`Burgduell: ${spiel.text}`);
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
    Hintergrund.start({ text: 'Notizen und Diktate kommen an', adresse: stickyAdresse() }).catch(() => {});
    wiederverbinden();
    hintergrundStarten();
  }
} catch { /* dann eben per Knopf */ }
