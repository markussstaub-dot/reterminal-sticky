// Wetter für die Home-Karte (Markus, 12.11.2026: „Wetter ist immer sinnvoll“). Quelle: Open-Meteo (frei, ohne Konto).
// Standort vom Handy, auf ~1 km gerundet; ohne GPS der zuletzt bekannte Ort. Ergebnis wird gemerkt, damit die
// Karte auch nach einem App-Neustart ohne Netz die letzte Vorhersage zeigt (mit „Stand hh:mm“).
import { T } from './uebersetzen.js';

const SCHLUESSEL = 'sticky.wetter';
const ORT = 'sticky.wetterOrt';

// WMO-Wettercodes → kurzes Wort (Symbole wären Farb-Emojis, die auf dem E-Paper nur grau werden); Sprache zur Zeichenzeit
export function wetterWort(code) {
  if (code === 0) return T('klar', 'clear');
  if (code <= 2) return T('heiter', 'fair');
  if (code === 3) return T('bewölkt', 'cloudy');
  if (code <= 48) return T('Nebel', 'fog');
  if (code <= 57) return T('Niesel', 'drizzle');
  if (code <= 67) return T('Regen', 'rain');
  if (code <= 77) return T('Schnee', 'snow');
  if (code <= 82) return T('Schauer', 'showers');
  if (code <= 86) return T('Schneeschauer', 'snow showers');
  return T('Gewitter', 'thunderstorm');
}

/**
 * Wettersymbol als Strichzeichnung (Markus, 15.11.2026: „Wetter-Icon auf die Startkarte“), Schwarz auf Weiß für e-Ink.
 * cx/cy = Mitte, s = Kantenlänge (≈ 44 px). Sonne, Sonne+Wolke, Wolke, Nebel, Niesel/Regen, Schnee, Gewitter.
 */
export function wetterSymbol(p, code, cx, cy, s = 44) {
  const k = s / 44;
  p.save();
  p.translate(cx, cy);
  p.scale(k, k);
  p.strokeStyle = '#000';
  p.fillStyle = '#000';
  p.lineWidth = 3;
  p.lineCap = 'round';
  const sonne = (x, y, r) => {
    p.beginPath(); p.arc(x, y, r, 0, Math.PI * 2); p.stroke();
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; p.beginPath(); p.moveTo(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4)); p.lineTo(x + Math.cos(a) * (r + 9), y + Math.sin(a) * (r + 9)); p.stroke(); }
  };
  const wolke = (x, y, voll = false) => {   // Wolke aus drei Bögen, unten gerade
    p.beginPath();
    p.moveTo(x - 16, y + 8);
    p.arc(x - 9, y + 1, 7, Math.PI * 0.75, Math.PI * 1.5);
    p.arc(x + 1, y - 4, 10, Math.PI * 1.1, Math.PI * 1.95);
    p.arc(x + 11, y + 2, 6, Math.PI * 1.5, Math.PI * 0.4);
    p.lineTo(x - 16, y + 8);
    p.closePath();
    p.fillStyle = voll ? '#000' : '#fff';
    p.fill();
    p.stroke();
    p.fillStyle = '#000';
  };
  const striche = (n, y0, form) => { for (let i = 0; i < n; i++) { const x = -10 + i * 10; form(x, y0); } };
  if (code === 0) sonne(0, 0, 9);
  else if (code <= 2) { sonne(-6, -6, 7); wolke(4, 6); }
  else if (code === 3) wolke(0, 0);
  else if (code <= 48) { for (let i = 0; i < 4; i++) { p.beginPath(); p.moveTo(-17 + (i % 2) * 4, -11 + i * 8); p.lineTo(17 - (i % 2) * 4, -11 + i * 8); p.stroke(); } }
  else if (code <= 67 || (code >= 80 && code <= 82)) { wolke(0, -6); striche(3, 10, (x, y) => { p.beginPath(); p.moveTo(x + 2, y); p.lineTo(x - 2, y + (code <= 57 ? 5 : 10)); p.stroke(); }); }
  else if (code <= 77 || code <= 86) { wolke(0, -6); striche(3, 14, (x, y) => { for (let a = 0; a < 3; a++) { const w = (a * Math.PI) / 3; p.beginPath(); p.moveTo(x - Math.cos(w) * 4, y - Math.sin(w) * 4); p.lineTo(x + Math.cos(w) * 4, y + Math.sin(w) * 4); p.stroke(); } }); }
  else { wolke(0, -8, true); p.beginPath(); p.moveTo(2, 4); p.lineTo(-5, 13); p.lineTo(1, 13); p.lineTo(-4, 22); p.lineTo(8, 9); p.lineTo(2, 9); p.closePath(); p.fill(); }
  p.restore();
}

/** Eine Zeile für die Karte, z. B. „bewölkt 12° · 4–14° · Regen 20 %“; us = °F (Einstellung am Sticky bzw. Handy) */
export function wetterZeile(w, us = false) {
  if (!w) return null;
  const r = (v) => Math.round(us ? v * 9 / 5 + 32 : v), e = us ? '°F' : '°';
  return `${wetterWort(w.code)} ${r(w.temp)}${e} · ${r(w.min)}–${r(w.max)}${e} · ${T('Regen', 'rain')} ${Math.round(w.regen)} %`;
}

export function letztesWetter() {
  try { return JSON.parse(localStorage.getItem(SCHLUESSEL) || 'null'); } catch { return null; }
}

/** Holt das aktuelle Wetter; ort = { lat, lon } oder null (dann letzter bekannter). Fehler → null, alter Stand bleibt */
export async function holeWetter(ort) {
  try {
    if (ort?.lat != null) localStorage.setItem(ORT, JSON.stringify({ lat: ort.lat, lon: ort.lon }));
    else ort = JSON.parse(localStorage.getItem(ORT) || 'null');
  } catch { /* egal */ }
  if (!ort) return null;
  const lat = ort.lat.toFixed(2), lon = ort.lon.toFixed(2);   // ~1 km: genug fürs Wetter, verrät nicht die Haustür
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&timezone=Europe%2FBerlin&forecast_days=1';
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json();
    const w = {
      temp: d.current.temperature_2m,
      code: d.current.weather_code,
      min: d.daily.temperature_2m_min[0],
      max: d.daily.temperature_2m_max[0],
      regen: d.daily.precipitation_probability_max[0] ?? 0,
      zeit: Date.now(),
    };
    try { localStorage.setItem(SCHLUESSEL, JSON.stringify(w)); } catch { /* egal */ }
    return w;
  } catch {
    return null;
  }
}
