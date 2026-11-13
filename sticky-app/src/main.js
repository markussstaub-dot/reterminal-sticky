import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Clipboard } from '@capacitor/clipboard';
import { Spracherkennung, MODELLE, WOERTER_STANDARD, pcmBase64 } from './sprache.js';
import { registerPlugin } from '@capacitor/core';
// Vordergrund-Dienst (Android), damit die App bei verbundenem Sticky nicht eingefroren wird
const Hintergrund = registerPlugin('Hintergrund', { web: { async start() {}, async stop() {} } });
const p2 = (n, l = 2) => String(n).padStart(l, '0');
/** Ortszeit mit Millisekunden für Dateinamen: 2026-11-11-22-27-50-123 */
const dateiZeit = (t) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}-${p2(d.getMilliseconds(), 3)}`; };
/** GPS nur, wenn das Ereignis frisch ist; was mehr als 60 s zu spät ankommt, bekommt keinen (falschen) Ort */
const VERSPAETET_MS = 60000;
const woerter = () => $('woerter').value.trim();
/** Erkennung mit Wächter: kurze/leise Aufnahmen und nachgeplapperte Wortliste werden „(unklar)“, der Ton bleibt */
async function erkenne(pcm) {
  const p = sprachPruefung(pcm);
  if (!p.ok) return { text: '(unklar)', unklar: p.grund, ms: 0, ladeMs: 0, modell: $('modell').value, pruefung: p };
  const r = await Spracherkennung.erkennen({ pcm: pcmBase64(angehoben(pcm)), modell: $('modell').value, threads: 6, hinweis: woerter() });
  if (r.text && nurWortliste(r.text, woerter())) return { ...r, text: '(unklar)', unklar: 'nur Wörter der Liste', pruefung: p };
  return { ...r, pruefung: p };
}
import { zeichneFahrt, trefferKnopf, rueckmeldung, layoutText, STANDARD_KNOEPFE } from './fahrtseite.js';
import { zeichneHome, zeichneZiffern } from './homeseite.js';
import { holeWetter, letztesWetter } from './wetter.js';
import { BESTELL_STANDARD, zettel, zeichneZettel } from './bestellung.js';
import { KARTEN_STANDARD, karten, zeichneKarte } from './karten.js';
import { Aufnahme, wav, sprachPruefung, nurWortliste, angehoben } from './audio.js';
import * as notizen from './notizen.js';
import * as bb from './bordbuch.js';
import { tabsEinrichten } from './tabs.js';
import { spiegelEinrichten } from './spiegel.js';
import { BREITE, HOEHE, rgbaZu1bpp, crc32, rueckDatei } from './protokoll.js';
import { BleVerbindung, SimVerbindung } from './verbindung.js';
import { Zwilling } from './zwilling.js';

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
  g.fillText(jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), BREITE - 24, 37);
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
  zeit.textContent = new Date().toLocaleTimeString('de-DE');
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
  kopf.textContent = `${(a.dauerMs / 1000).toFixed(1)} s · ${new Date().toLocaleTimeString('de-DE')}`;
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
    neueNotiz({ t: a.start, art: 'diktat', text: r.text || '', ...(r.unklar ? { unklar: r.unklar } : {}), audio: nativ ? `aufnahmen/${name}` : name, dauerMs: a.dauerMs, ...(spaet ? { offline: true } : {}) },
      spaet ? null : a.ort, 'Diktat');
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

// Der Sticky schlummert im Akkubetrieb nach 2 min ohne Bedienung (Firmware 0.8.0, schlaf.h) und meldet das vorher
let stickySchlaeft = false;
zwilling.beobachte((art, d) => {
  if (art === 'zustand') stickySchlaeft = false;
  if (art === 'aufnahmeLaeuft') { $('aufnahmeStatus').hidden = false; ortBeiAufnahme = notizen.standort(); }
  if (art === 'aufnahme') { $('aufnahmeStatus').hidden = true; d.ort = ortBeiAufnahme; zeigeAufnahme(d); }
  if (art === 'zustand') { zeigeZustand(d); if (d.modus) spiegelSetze({ modus: d.modus, bb: d.bb ?? 0, zettel: d.zettel ?? 0, bat: d.bat, usb: !!d.usb, verbunden: true }); }
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
    else if (d.t === 'touch' && d.a === 'down') { eintrag(`Touch bei ${d.x}, ${d.y}`); touchMarke(d.x, d.y); fahrtTouch(d.x, d.y, d.ms); }
    else if (d.t === 'pong') eintrag('Pong');
    else if (d.t === 'schlaf') stickySchlaeft = true;
    else if (d.t === 'modus') { spiegelSetze({ modus: d.m, ...(d.zettel != null ? { zettel: d.zettel } : {}), verbunden: true }); stickyModus = d.m; imBordbuch = d.m === 'bordbuch'; eintrag(`Modus: ${{ home: 'Home', notiz: 'Notiz', bordbuch: 'Bordbuch', bestell: `Bestellzettel ${(d.zettel ?? 0) + 1}` }[d.m] ?? d.m}`); }
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
  const an = zwilling.verbunden;
  $('status').textContent = an ? verbindung.name : 'getrennt';
  $('status').className = `pille ${an ? 'ein' : 'aus'}`;
  $('verbinden').textContent = an ? 'Trennen' : wiederTimer ? 'Wiederverbinden stoppen' : 'Verbinden';
  $('verbinden').classList.toggle('haupt', !an);
  $('senden').disabled = !an;
  $('fahrtZeigen').disabled = !an;
  $('homeZeigen').disabled = !an;
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
  try { return JSON.parse(localStorage.getItem('sticky.geraet') || 'null')?.id ?? null; } catch { return null; }
}

// Wecker: Der Dienst merkt per autoConnect, dass der Sticky wieder funkt, und weckt die App (12.11.2026: im Doze
// standen die Zeitgeber 15 min still, die ganze Rückfahrt lief offline)
Promise.resolve().then(() => Hintergrund.addListener('sticky', (e) => {
  if (!e.da || !autoVerbinden || zwilling.verbunden) return;
  console.info('[sticky] Wecker: Sticky funkt wieder');
  clearTimeout(wiederTimer);
  wiederverbinden();
})).catch(() => {});   // im Browser gibt es den Dienst nicht

let verbindeGerade = false;
async function wiederverbinden() {
  wiederTimer = 0;
  if (!autoVerbinden || zwilling.verbunden || verbindeGerade || !(verbindung instanceof BleVerbindung)) return;
  verbindeGerade = true;
  try {
    await verbindung.verbinden({ nurGemerkt: true });
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

$('verbinden').onclick = async () => {
  const knopf = $('verbinden');
  if (zwilling.verbunden || wiederTimer) {
    autoVerbinden = false;
    clearTimeout(wiederTimer);
    wiederTimer = 0;
    Hintergrund.stop().catch(() => {});
    if (zwilling.verbunden) await verbindung.trennen();
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
let fahrtCrc = null;
const knoepfe = () => {
  const l = $('knoepfe').value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 5);
  return l.length ? l : STANDARD_KNOEPFE;
};
try { $('knoepfe').value = localStorage.getItem('sticky.knoepfe') || STANDARD_KNOEPFE.join(', '); } catch { $('knoepfe').value = STANDARD_KNOEPFE.join(', '); }
$('knoepfe').onchange = () => {
  try { localStorage.setItem('sticky.knoepfe', knoepfe().join(', ')); } catch { /* egal */ }
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
$('bestellZeigen').onclick = () => zwilling.modusSetzen(3).catch((e) => eintrag(e.message, true));
try { $('bestellText').value = localStorage.getItem('sticky.bestellung') || BESTELL_STANDARD; } catch { $('bestellText').value = BESTELL_STANDARD; }
$('bestellText').onchange = () => {
  try { localStorage.setItem('sticky.bestellung', $('bestellText').value); } catch { /* egal */ }
  if (zwilling.verbunden) abgleich().catch((e) => eintrag(e.message, true));   // geänderte Zettel gleich aufspielen
};
$('bestellStandard').onclick = () => { $('bestellText').value = BESTELL_STANDARD; $('bestellText').onchange(); };
try { $('kartenText').value = localStorage.getItem('sticky.karten') ?? KARTEN_STANDARD; } catch { $('kartenText').value = KARTEN_STANDARD; }
$('kartenText').onchange = () => {
  try { localStorage.setItem('sticky.karten', $('kartenText').value); } catch { /* egal */ }
  if (zwilling.verbunden) abgleich().catch((e) => eintrag(e.message, true));
};
$('kartenStandard').onclick = () => { $('kartenText').value = KARTEN_STANDARD; $('kartenText').onchange(); };
/** Alle Zettel in der Reihenfolge am Sticky: Bestellzettel, dann Karten (zusammen höchstens 6) */
function alleZettel() {
  const z = zettel($('bestellText').value);
  const k = karten($('kartenText').value);
  const liste = [
    ...z.map((x, i) => ({ zeichne: (g) => zeichneZettel(g, x, i + 1, z.length) })),
    ...k.map((x, i) => ({ zeichne: (g) => zeichneKarte(g, x, i + 1, k.length) })),
  ];
  return liste.slice(0, 6);
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
async function neueNotiz(teile, ortPromise, kurz) {
  const ort = await (ortPromise ?? null);
  let n;
  try { n = await notizen.notiere(teile, ort); } catch (e) { eintrag(`Notiz nicht gespeichert: ${e.message}`, true); return; }
  zeigeNotiz(n, true);
  if (stickyModus === 'notiz' || stickyModus === 'home') {   // Rückmeldefeld gibt es auf beiden Seiten
    const zeit = new Date(n.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const r = rueckmeldung(`✓ ${kurz} ${zeit}`);
    spiegel.meldung(`✓ ${kurz} ${zeit}`);
    zwilling.sendeBild(r.bytes, { bereich: r.bereich }).catch((e) => eintrag(`Rückmeldung: ${e.message}`, true));
  }
}

function zeigeNotiz(n, neu = false) {
  const li = document.createElement('li');
  li.className = `${n.art}${neu ? ' neu' : ''}`;
  const kopf = document.createElement('div');
  kopf.className = 'kopf';
  const ort = n.lat != null ? `${n.lat.toFixed(5)}, ${n.lon.toFixed(5)} (±${n.gen} m)` : n.offline ? 'ohne Handy aufgenommen' : 'ohne GPS';
  kopf.textContent = `${new Date(n.t).toLocaleTimeString('de-DE')} · ${ort}`;
  const was = document.createElement('div');
  was.className = 'was';
  was.textContent = n.art === 'diktat' ? `🎙 ${n.text || '(nichts erkannt)'}` : n.knopf;
  li.append(kopf, was);
  $('notizen').prepend(li);
}

// ---- Ohne Handy: Abgleich und Puffer abholen ------------------------------------------------
/** Nach dem Verbinden: Uhr stellen, Fahrt-Layout + Rückmeldungen für den Offline-Betrieb aufspielen, Puffer abholen */
async function abgleich() {
  if (!zwilling.geraet.fw || zwilling.geraet.fw === 'sim' || zwilling.geraet.fahrtv == null) return;   // braucht Firmware 0.5
  await zwilling.zeitSetzen();
  const text = layoutText(knoepfe());
  const version = crc32(new TextEncoder().encode(text)).toString(16).padStart(8, '0');
  // Home-Karte, Notiz-Seite und Ziffernblatt (einmalig, wenn sich etwas geändert hat)
  // Wetter für die Home-Karte (bei Fehler bleibt die letzte Vorhersage)
  const ort = await notizen.standort();
  const wetter = (await holeWetter(ort)) ?? letztesWetter();
  zeichneHome(g, undefined, null, wetter);
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
    const dateien = alle.map((b, i) => ({ n: `${i}.bin`, daten: b })).concat([{ n: 'version.txt', daten: new TextEncoder().encode(homeV) }]);
    const n = await zwilling.sollAbgleich('home', dateien);
    eintrag(`Home: ${n} Dateien aufgespielt`);
  } else if (zwilling.geraet.homev !== homeV) {
    // Nur geänderte Bilder senden (das Wetter ändert meist nur die Karte); unbekannt → alle
    let alt = null;
    try { alt = JSON.parse(localStorage.getItem('sticky.homecrcs') || 'null'); } catch { /* egal */ }
    const crcs = alle.map((b) => crc32(b));
    const vollstaendig = !alt || alt.version !== zwilling.geraet.homev || alt.crcs.length !== crcs.length;
    for (let i = 0; i < alle.length; i++) if (vollstaendig || alt.crcs[i] !== crcs[i]) await zwilling.sendeBild(alle[i], { home: i });
    await zwilling.homeVersion(homeV);
    try { localStorage.setItem('sticky.homecrcs', JSON.stringify({ version: homeV, crcs })); } catch { /* egal */ }
    eintrag(`Home-Karte, Notiz-Seite, Uhr und ${zettelBilder.length} Zettel/Karten aufgespielt`);
  }
  zeichneHome(g, undefined, new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), wetter);
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
  if (fwAb('0.10.0')) await fahrtenschreiberAbholen().catch((e) => eintrag(`Fahrtenschreiber: ${e.message}`, true));
}

// ---- Karussell (SPEC „Bedienung und Oberfläche“): Reihe, durch die ▲/▼ am Sticky blättern -------------------------
const KARUSSELL_STANDARD = 'Home, Notiz, Bordbuch, Zettel';
const KARUSSELL_WOERTER = { home: 'home', notiz: 'notiz', bordbuch: 'bordbuch', zettel: 'zettel', bestellzettel: 'zettel' };
function karussellText() {
  const roh = (localStorage.getItem('sticky.karussell') || KARUSSELL_STANDARD).split(/[,;\n]/).map((w) => KARUSSELL_WOERTER[w.trim().toLowerCase()]).filter(Boolean);
  return [...new Set(roh)].join('\n') + '\n';
}
async function karussellAufspielen() {
  const n = await zwilling.sollAbgleich('einstellungen', [{ n: 'karussell.txt', daten: new TextEncoder().encode(karussellText()) }]);
  if (n) eintrag(`Karussell: ${karussellText().trim().split('\n').join(' → ')}`);
}
$('karussell').value = localStorage.getItem('sticky.karussell') || KARUSSELL_STANDARD;
$('karussell').onchange = () => {
  localStorage.setItem('sticky.karussell', $('karussell').value);
  if (zwilling.verbunden && fwAb('0.13.0')) karussellAufspielen().catch((e) => eintrag(`Karussell: ${e.message}`, true));
};

// ---- Fahrtenschreiber (SPEC „Zwilling 2.0“): /ist/log/JJJJ-MM-TT.txt auf der Karte des Sticky ----------------------
// Die App holt nur den neuen Teil (Stand je Datei in localStorage) und hängt ihn an ihre Kopie an
// (Data/fahrtenschreiber/…). Vergangene Tage löscht sie danach auf dem Sticky, den heutigen lässt sie dort weiterwachsen.
/** Firmware mindestens v? ("sim" kann alles) */
const fwAb = (v) => { const f = zwilling.geraet.fw; if (f === 'sim') return true; const a = String(f ?? '0').split('.').map(Number), b = v.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i]; return true; };
const LOG_ORDNER = 'fahrtenschreiber';
const logStand = () => { try { return JSON.parse(localStorage.getItem('sticky.logStand') ?? '{}'); } catch { return {}; } };
const heuteName = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.txt`; };
const logSim = {};   // im Browser statt Filesystem

async function logAnhaengen(name, text, ordner = LOG_ORDNER) {
  if (!nativ) { if (ordner === LOG_ORDNER) logSim[name] = (logSim[name] ?? '') + text; return; }
  await Filesystem.appendFile({ path: `${ordner}/${name}`, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
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
async function istAbholen(quelle, ziel) {
  const liste = (await zwilling.liste(`/ist/${quelle}`)).filter((d) => !d.ordner && /\.(txt|csv)$/.test(d.n));
  const stand = logStand();
  const schluessel = (n) => (quelle === 'log' ? n : `${quelle}/${n}`);
  let zeilen = 0;
  for (const d of liste) {
    const ab = Math.min(stand[schluessel(d.n)] ?? 0, d.b);
    if (d.b > ab) {
      const neu = new TextDecoder().decode(await zwilling.holen(`/ist/${quelle}/${d.n}`, d.b, ab));
      await logAnhaengen(d.n, neu, ziel);
      zeilen += neu.split('\n').filter(Boolean).length;
      stand[schluessel(d.n)] = d.b;
      localStorage.setItem('sticky.logStand', JSON.stringify(stand));
    }
    // vergangene Tage (und die Zeilen ohne Uhrzeit) sind abgeschlossen: auf dem Sticky quittieren
    if (!d.n.includes(heuteName().replace('.txt', '')) && await zwilling.loeschen(`/ist/${quelle}/${d.n}`)) {
      delete stand[schluessel(d.n)];
      localStorage.setItem('sticky.logStand', JSON.stringify(stand));
    }
  }
  return zeilen;
}

async function fahrtenschreiberAbholen() {
  const zeilen = await istAbholen('log', LOG_ORDNER);
  if (zeilen) eintrag(`Fahrtenschreiber: ${zeilen} neue ${zeilen === 1 ? 'Zeile' : 'Zeilen'}`);
  await zeigeFahrtenschreiber();
  if (fwAb('0.12.0')) {
    const mess = await istAbholen('mess', 'messreihen');
    if (mess) eintrag(`Messreihen: ${mess} neue Werte`);
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
  liste: () => (fwAb('0.11.0') ? zwilling.liste('/ist/puffer') : zwilling.pufferListe()),
  holen: (n, b) => (fwAb('0.11.0') ? zwilling.holen(`/ist/puffer/${n}`, b) : zwilling.pufferHolen(n, b)),
  loeschen: (n) => (fwAb('0.11.0') ? zwilling.loeschen(`/ist/puffer/${n}`) : zwilling.pufferLoeschen(n)),
};

async function pufferAbholen() {
  const liste = (await puffer.liste()).filter((d) => !d.ordner);
  if (!liste.length) return;
  eintrag(`Hole Notizen vom Sticky (${liste.length} Dateien) …`);
  const groesse = Object.fromEntries(liste.map((d) => [d.n, d.b]));
  const roh = groesse['notizen.jsonl'] ? new TextDecoder().decode(await puffer.holen('notizen.jsonl', groesse['notizen.jsonl'])) : '';
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
        const daten = await puffer.holen(z.audio, groesse[z.audio]);
        console.info('[sticky] abgeholt', z.audio, daten.length, Math.round(performance.now() - t0));
        const a = new Aufnahme();
        for (let o = 0; o + 245 <= daten.length; o += 245) a.paket(daten.subarray(o, o + 245));
        const e = a.ergebnis();
        dauerMs = e.dauerMs;
        pfad = await speichern(`sticky-${dateiZeit(t)}-offline.wav`, wav(e.pcm));
        text = (await erkenne(e.pcm)).text || '';
        await puffer.loeschen(z.audio);
      } catch (e) { eintrag(`Diktat ${z.audio}: ${e.message}`, true); }
      n = await notizen.notiere({ t, art: 'diktat', text, audio: pfad ?? z.audio, dauerMs, offline: true });
    } else {
      n = await notizen.notiere({ t, art: 'knopf', knopf: z.knopf, offline: true });
    }
    zeigeNotiz(n, true);
    anzahl++;
  }
  if (groesse['notizen.jsonl']) await puffer.loeschen('notizen.jsonl');
  eintrag(`${anzahl} Notizen vom Sticky abgeholt`);
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
try { $('spickzettel').value = localStorage.getItem('sticky.spickzettel') || bb.SPICKZETTEL_STANDARD; } catch { $('spickzettel').value = bb.SPICKZETTEL_STANDARD; }
$('spickzettel').onchange = () => { try { localStorage.setItem('sticky.spickzettel', $('spickzettel').value); } catch { /* egal */ } };
$('spickStandard').onclick = () => { $('spickzettel').value = bb.SPICKZETTEL_STANDARD; $('spickzettel').onchange(); };

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
  const spick = bb.spickzettelSeiten($('spickzettel').value);
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
  try { localStorage.setItem('sticky.bbplan', JSON.stringify(plan)); } catch { /* egal */ }
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
window.__sticky = { ladePdf, zwilling, pufferAbholen, fahrtenschreiberAbholen, erkenne, sprachPruefung };   // zum Prüfen per WebView-Fernsteuerung (adb)

try { $('woerter').value = localStorage.getItem('sticky.woerter') ?? WOERTER_STANDARD; } catch { $('woerter').value = WOERTER_STANDARD; }
$('woerter').onchange = () => { try { localStorage.setItem('sticky.woerter', $('woerter').value); } catch { /* egal */ } };

// ---- Spiegel: Vorschau folgt dem Sticky, Tipps und ▲▼ steuern ihn ----------------------
const bbCache = new Map();
async function bordbuchSeite(n) {
  let plan = null;
  try { plan = JSON.parse(localStorage.getItem('sticky.bbplan') || 'null'); } catch { /* egal */ }
  const e = plan?.seiten?.[n];
  if (!e) return null;
  if (bbCache.has(n)) return bbCache.get(n);
  const c = document.createElement('canvas');
  c.width = BREITE; c.height = HOEHE;
  const h = c.getContext('2d', { willReadFrequently: true });
  let bild = null;
  if (e.a === 'inhalt') { bb.zeichneInhalt(h, plan.links, plan.rechts); bild = h.getImageData(0, 0, BREITE, HOEHE); }
  else if (e.a === 'spick') {
    const s = bb.spickzettelSeiten($('spickzettel').value)[e.i];
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
    bestellText: () => $('bestellText').value,
    alleZettel,
    bordbuchSeite,
    inhaltsFelder: () => { try { return JSON.parse(localStorage.getItem('sticky.bbplan') || 'null')?.felder ?? []; } catch { return []; } },
  },
  befehl: (m, seite) => { if (zwilling.verbunden) zwilling.modusSetzen(m, seite).catch((e) => eintrag(e.message, true)); },
  notizTipp: (x, y) => fahrtTouch(x, y),
});
/** Spiegel-Zustand setzen und merken (nach dem App-Start zeigt die Vorschau den letzten Stand) */
function spiegelSetze(teile) {
  spiegel.setze(teile);
  try { const { modus, bb: s, zettel } = spiegel.zustand(); localStorage.setItem('sticky.spiegel', JSON.stringify({ modus, bb: s, zettel })); } catch { /* egal */ }
}
try { const alt = JSON.parse(localStorage.getItem('sticky.spiegel') || 'null'); if (alt) spiegel.setze({ ...alt, verbunden: false }); else spiegel.setze({}); } catch { spiegel.setze({}); }
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

// Wetter stündlich nachziehen, solange verbunden (Abgleich schickt nur die geänderte Karte)
setInterval(() => { if (zwilling.verbunden) abgleich().catch(() => {}); }, 60 * 60 * 1000);
// Neuer Tag → Home-Karte mit neuem Datum gleich aufspielen (bei Dauerverbindung sonst bis zu einer Stunde zu spät)
let heute = new Date().toDateString();
setInterval(() => {
  if (new Date().toDateString() === heute) return;
  heute = new Date().toDateString();
  if (zwilling.verbunden) abgleich().catch(() => {});
}, 60 * 1000);

tabsEinrichten();
muster();
zeigeVerbindung();

// Beim Start gleich den bekannten Sticky suchen (12.11.2026: nach Neustart der App blieb sie sonst getrennt, bis
// jemand „Verbinden“ tippte – mit dem Schlummermodus wichtig, damit der geweckte Sticky die App wiederfindet)
try {
  if (nativ && localStorage.getItem('sticky.geraet')) {
    verbindung = new BleVerbindung();
    zwilling.anbinden(verbindung);
    autoVerbinden = true;
    Hintergrund.start({ text: 'Notizen und Diktate kommen an', adresse: stickyAdresse() }).catch(() => {});
    wiederverbinden();
  }
} catch { /* dann eben per Knopf */ }
