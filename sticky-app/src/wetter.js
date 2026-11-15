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
