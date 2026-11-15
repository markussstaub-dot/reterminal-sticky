// Handy liefert, Sticky zeigt (SPEC „Ideen mit Handy → Die drei naheliegenden“, 15.11.2026). Reine Logik ohne DOM,
// damit sie sich testen lässt: dauerhafte Meldungen, Orte mit Ankunft/Abfahrt, Parkplatz und die Zeilen, die daraus
// unten auf der Home-Karte stehen.

// ---- A. Benachrichtigungen ------------------------------------------------------------------------------------------
export const MELDE_STANDARD = 'app.bubblelog.microlino\napp.sticky.zwilling';
export const MELDUNGEN_MAX = 3;
export const MELDUNG_DAUER_MS = 12 * 60 * 60 * 1000;

/**
 * Positivliste lesen: je Zeile ein Paketname, optional „: Wort, Wort“ = nur, wenn eins davon im Titel steht
 * (z. B. eine Person in einem Messenger). → [{ paket, nurVon: [...] }]
 */
export function meldeRegeln(text) {
  return String(text ?? '').split('\n').map((z) => z.replace(/#.*/, '').trim()).filter(Boolean).map((z) => {
    const i = z.indexOf(':');
    const paket = (i < 0 ? z : z.slice(0, i)).trim();
    const nurVon = i < 0 ? [] : z.slice(i + 1).split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
    return { paket, nurVon };
  }).filter((r) => /^[\w.]+$/.test(r.paket));
}

/** Pakete für den Android-Melder (der filtert nur nach Paket; „nur von“ prüft die App) */
export const meldePakete = (regeln) => [...new Set(regeln.map((r) => r.paket))];

/** Darf diese Meldung auf den Sticky? */
export function meldungErlaubt(regeln, paket, titel = '') {
  const t = String(titel).toLowerCase();
  return regeln.some((r) => r.paket === paket && (!r.nurVon.length || r.nurVon.some((w) => t.includes(w))));
}

/** Meldung vorn anfügen (gleicher Schlüssel ersetzt), alte und überzählige fallen raus */
export function meldungDazu(liste, m, jetzt = Date.now()) {
  const neu = [{ key: m.key ?? `${m.paket}:${m.titel}`, app: m.app || m.paket, titel: m.titel ?? '', t: m.t ?? jetzt }];
  for (const x of liste ?? []) if (x.key !== neu[0].key) neu.push(x);
  return meldungenAufraeumen(neu, jetzt);
}

/** Am Handy weggewischt → auch vom Sticky weg */
export const meldungWeg = (liste, key) => (liste ?? []).filter((x) => x.key !== key);

export const meldungenAufraeumen = (liste, jetzt = Date.now()) =>
  (liste ?? []).filter((x) => jetzt - x.t < MELDUNG_DAUER_MS).slice(0, MELDUNGEN_MAX);

// ---- C. Orte -------------------------------------------------------------------------------------------------------
export const UMKREIS_M = 150;
/** Ziele, auf die die App den Sticky schicken kann (Befehl 0x14: 0 Home, 1 Handbuch – bis FW 0.37.0 Bordbuch –, 2 Notiz,
 *  3 Zettel n, 8 Spickzettel ab FW 0.38.0) */
const ZIELE = [
  [/^(home|start)$/i, () => ({ modus: 0 })],
  [/^(bordbuch|logbook|handbuch|manual)$/i, () => ({ modus: 1 })],
  [/^(spickzettel|cheat ?sheets?)$/i, () => ({ modus: 8 })],
  [/^(notiz|note|fahrt)$/i, () => ({ modus: 2 })],
  [/^(zettel|list)\s*(\d)?$/i, (m) => ({ modus: 3, seite: Math.max(0, Number(m[2] ?? 1) - 1) })],
];
export function zielLesen(wort) {
  for (const [re, f] of ZIELE) { const m = String(wort ?? '').trim().match(re); if (m) return f(m); }
  return { modus: 0 };
}

/**
 * Orte lesen, je Zeile „Name; Breite, Länge; Ziel[; Umkreis m]“, z. B. „Supermarkt; 47.1, 8.2; Zettel 1“.
 * → [{ name, lat, lon, ziel: { modus, seite? }, umkreis }]
 */
export function orteLesen(text) {
  const orte = [];
  for (const zeile of String(text ?? '').split('\n')) {
    const z = zeile.replace(/#.*/, '').trim();
    if (!z) continue;
    const [name, koord, ziel, umkreis] = z.split(';').map((s) => s.trim());
    const m = (koord ?? '').match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (!name || !m) continue;
    const u = Number(String(umkreis ?? '').replace(/\s*m$/i, ''));
    orte.push({ name, lat: Number(m[1]), lon: Number(m[2]), ziel: zielLesen(ziel), umkreis: u > 0 ? u : UMKREIS_M });
  }
  return orte;
}

/** Zeile für „Hier merken“ */
export const ortZeile = (name, o, ziel = 'Home') => `${name}; ${o.lat.toFixed(5)}, ${o.lon.toFixed(5)}; ${ziel}`;

export function abstandM(a, b) {
  const r = Math.PI / 180, x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
}

/**
 * Wo bin ich? Nächster Ort im Umkreis; wer schon an einem Ort ist, bleibt bis zum 1,5-fachen Umkreis (Hysterese,
 * damit GPS-Zittern am Rand nicht ständig springt). Ungenauer Ort (> 100 m) ändert nichts.
 */
export function ortFinden(orte, o, bisher = null) {
  if (!o || o.lat == null) return bisher;
  if (o.gen != null && o.gen > 100) return bisher;
  const alt = bisher && orte.find((x) => x.name === bisher);
  if (alt && abstandM(alt, o) <= alt.umkreis * 1.5) return bisher;
  let best = null, bestD = Infinity;
  for (const x of orte) { const d = abstandM(x, o); if (d <= x.umkreis && d < bestD) { best = x; bestD = d; } }
  return best?.name ?? null;
}

// ---- B. Fahrt beendet → Rückfrage „Parkplatz merken?“ ---------------------------------------------------------------
/**
 * Fahrt-Ende erkennen: nach einer Fahrt (Tempo > 2 m/s) zwei Prüfungen in Folge Stillstand (< 1 m/s bzw. < 30 m
 * bewegt). Zustand { faehrt, still } wird fortgeschrieben. → { zustand, ende }
 */
export function fahrtSchritt(zustand, v) {
  const z = { faehrt: !!zustand?.faehrt, still: zustand?.still ?? 0 };
  if (v != null && v > 2) return { zustand: { faehrt: true, still: 0 }, ende: false };
  if (!z.faehrt) return { zustand: z, ende: false };
  if (v == null || v < 1) z.still++; else z.still = 0;
  if (z.still >= 2) return { zustand: { faehrt: false, still: 0 }, ende: true };
  return { zustand: z, ende: false };
}

export const PARKPLATZ_DAUER_MS = 24 * 60 * 60 * 1000;

// ---- Zeilen für die Home-Karte --------------------------------------------------------------------------------------
/**
 * Was unten auf Home steht (höchstens 4 Zeilen, darunter liegt das Rückmeldefeld): Ort, Parkplatz, Meldungen. T und uhrzeit kommen von außen,
 * damit das hier ohne Sprachmodul testbar bleibt.
 */
export function homeZeilen({ ort = null, parkplatz = null, meldungen = [] } = {}, { T = (de) => de, uhrzeit = (t) => new Date(t).toTimeString().slice(0, 5), jetzt = Date.now() } = {}) {
  const z = [];
  if (ort) z.push(T(`Ort: ${ort}`, `Place: ${ort}`));
  if (parkplatz && jetzt - parkplatz.t < PARKPLATZ_DAUER_MS) z.push(T(`Geparkt um ${uhrzeit(parkplatz.t)}`, `Parked at ${uhrzeit(parkplatz.t)}`));
  for (const m of meldungenAufraeumen(meldungen, jetzt)) z.push(`${uhrzeit(m.t)}  ${m.app}${m.titel ? ` · ${m.titel}` : ''}`);
  return z.slice(0, 4);
}
