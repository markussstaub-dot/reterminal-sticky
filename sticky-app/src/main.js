import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Clipboard } from '@capacitor/clipboard';
import { Spracherkennung, MODELLE, pcmBase64 } from './sprache.js';
import { BREITE, HOEHE, rgbaZu1bpp, crc32 } from './protokoll.js';
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
  const name = `sticky-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.wav`;
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
  Spracherkennung.erkennen({ pcm: pcmBase64(a.pcm), modell, threads: 6 }).then((r) => {
    const gesamt = Math.round(performance.now() - a.tLos);
    text.className = 'text';
    text.textContent = r.text || '(nichts erkannt)';
    kopieren.disabled = !r.text;
    kopieren.onclick = async () => {
      try { await Clipboard.write({ string: r.text }); kopieren.textContent = 'Kopiert ✓'; } catch (e) { eintrag(`Kopieren fehlgeschlagen: ${e.message}`, true); }
    };
    const zusatz = ` · Text nach ${gesamt} ms (Erkennung ${r.ms} ms${r.ladeMs ? `, Laden ${r.ladeMs} ms` : ''}, ${r.modell.replace('ggml-', '').replace('.bin', '')})`;
    werte.textContent += zusatz;
    console.info('[sticky] sprache', JSON.stringify({ dauer: a.dauerMs, gesamt, erkennung: r.ms, laden: r.ladeMs, modell: r.modell, text: r.text, umweg: Math.round(tErk - a.tLos) }));
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

zwilling.beobachte((art, d) => {
  if (art === 'aufnahmeLaeuft') $('aufnahmeStatus').hidden = false;
  if (art === 'aufnahme') { $('aufnahmeStatus').hidden = true; zeigeAufnahme(d); }
  if (art === 'zustand') zeigeZustand(d);
  else if (art === 'log') eintrag(d);
  else if (art === 'getrennt') { eintrag('Verbindung getrennt', true); zeigeVerbindung(); }
  else if (art === 'ereignis') {
    if (d.t === 'key' && d.a === 'down') eintrag(`Taste ${TASTEN[d.k] || d.k} gedrückt`);
    else if (d.t === 'touch' && d.a === 'down') { eintrag(`Touch bei ${d.x}, ${d.y}`); touchMarke(d.x, d.y); }
    else if (d.t === 'pong') eintrag('Pong');
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
  $('geraet').textContent = teile.join(' · ');
  pruefeAbgleich();
}

function zeigeVerbindung() {
  const an = zwilling.verbunden;
  $('status').textContent = an ? verbindung.name : 'getrennt';
  $('status').className = `pille ${an ? 'ein' : 'aus'}`;
  $('verbinden').textContent = an ? 'Trennen' : 'Verbinden';
  $('verbinden').classList.toggle('haupt', !an);
  $('senden').disabled = !an;
  $('karte').disabled = !an;
  $('simTasten').hidden = !(an && verbindung instanceof SimVerbindung);
  if (!an) $('geraet').textContent = '';
}

// ---- Bedienung ----------------------------------------------------------------------
$('verbinden').onclick = async () => {
  const knopf = $('verbinden');
  if (zwilling.verbunden) {
    await verbindung.trennen();
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

muster();
zeigeVerbindung();
