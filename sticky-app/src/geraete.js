// Geräteliste (Multiclient Stufe 1, SPEC „Mehrere Stickys an einer App“, docs/architektur-multiclient.svg, 14.11.2026).
// Mehrere Stickys an einer App; verbunden ist einer zur Zeit (Stufe 2: gleichzeitig). Je Gerät ein Profil – eine
// Vorlage, die mehrere Geräte teilen dürfen. Persönliches (Zettel, Spickzettel, Wörterbuch …) hängt am Profil, der
// Abgleich-Stand am Gerät. Unpersönliches (Widgets, Schrift, Hilfe) baut die App für alle gleich.

const LISTE = 'sticky.geraete', AKTIV = 'sticky.aktiv', ALT = 'sticky.geraet';

export const PROFILE = { edc: 'EDC', wand: 'Wand / Test', einfach: 'Einfach' };

/** Einstellungen, die zum Profil gehören (Vorlage) */
export const PROFIL_SCHLUESSEL = ['karussell', 'lagen', 'dreh180', 'zettel', 'bestellung', 'karten', 'spickzettel', 'handgriffe',
  'woerter', 'woerterbuch', 'knoepfe'];
/** Zustand eines einzelnen Geräts (was auf seiner Karte liegt, seine Kalibrierung) */
export const GERAET_SCHLUESSEL = ['homecrcs', 'spiegel', 'logStand', 'lineal80', 'bbplan'];

const lesen = (k, sonst) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? sonst; } catch { return sonst; } };
const schreiben = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* egal */ } };

export function geraete() { return lesen(LISTE, []); }
export function aktivesGeraet() {
  const liste = geraete();
  const id = lesen(AKTIV, null);
  return liste.find((g) => g.id === id) ?? liste[0] ?? null;
}
export function aktivesProfil() { return aktivesGeraet()?.profil ?? 'edc'; }

/** Name im Speicher für eine Einstellung eines bestimmten Geräts: je Profil, je Gerät oder für die ganze App */
export function schluesselFuer(g, k) {
  if (PROFIL_SCHLUESSEL.includes(k)) return `sticky.p.${g?.profil ?? 'edc'}.${k}`;
  if (GERAET_SCHLUESSEL.includes(k)) return `sticky.g.${g?.id ?? 'ohne'}.${k}`;
  return `sticky.${k}`;
}

// Bau-Kontext (Stufe 2): Seiten für einen Hintergrund-Sticky werden aus SEINEM Profil gebaut. Nur für synchrone
// Bauschritte – zwischen zwei await kann der Vordergrund laufen, dann gilt wieder das aktive Gerät.
let kontext = null;
export function mitGeraet(g, fn) {
  const alt = kontext;
  kontext = g;
  try { return fn(); } finally { kontext = alt; }
}

/** Name im Speicher für eine Einstellung: für das Gerät im Bau-Kontext, sonst das aktive */
export function schluessel(k) { return schluesselFuer(kontext ?? aktivesGeraet(), k); }

/** Den Sticky, mit dem gerade verbunden wurde, in die Liste aufnehmen (neu: Profil „edc“) und aktiv setzen */
export function geraetMerken({ id, name }) {
  const liste = geraete();
  let g = liste.find((x) => x.id === id);
  // Der Scan liefert den Namen nicht immer; die Firmware wirbt als „Sticky-“ + letzte zwei MAC-Bytes
  if (!name || name === 'Sticky') name = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(id) ? `Sticky-${id.slice(-5).replace(':', '')}` : 'Sticky';
  if (!g) {
    g = { id, name, profil: 'edc', seit: Date.now() };
    liste.push(g);
  } else if (name && !g.eigenerName) g.name = name;
  schreiben(LISTE, liste);
  schreiben(AKTIV, id);
  schreiben(ALT, { id, name: g.name });   // für ältere Stellen und den nativen Wecker (StickyDienst)
  return g;
}

export function aktivSetzen(id) {
  const g = geraete().find((x) => x.id === id);
  if (!g) return;
  schreiben(AKTIV, id);
  schreiben(ALT, { id, name: g.name });
}

export function geraetAendern(id, teile) {
  const liste = geraete();
  const g = liste.find((x) => x.id === id);
  if (!g) return;
  Object.assign(g, teile, teile.name ? { eigenerName: true } : {});
  schreiben(LISTE, liste);
  if (aktivesGeraet()?.id === id) schreiben(ALT, { id, name: g.name });
}

/** Gerät vergessen: aus der Liste und sein Geräte-Zustand weg (Profile bleiben, sie sind Vorlagen) */
export function geraetVergessen(id) {
  const liste = geraete().filter((x) => x.id !== id);
  schreiben(LISTE, liste);
  for (const k of GERAET_SCHLUESSEL) { try { localStorage.removeItem(`sticky.g.${id}.${k}`); } catch { /* egal */ } }
  if (lesen(AKTIV, null) === id) {
    if (liste[0]) aktivSetzen(liste[0].id);
    else { try { localStorage.removeItem(AKTIV); localStorage.removeItem(ALT); } catch { /* egal */ } }
  }
}

/** Home-Karte eines Sticky (14.11.2026): der erste behält die eingebaute (vorlage), jeder weitere zeigt seinen Namen;
 *  QR nur, wenn in der Geräteliste ein Link steht (g.link) */
export function karteFuer(g, vorlage) {
  if (!g) return vorlage;
  const erster = geraete()[0];
  if (!g.link && (!erster || erster.id === g.id)) return vorlage;
  const link = g.link ?? '';
  return { name: kurz(g), qr: link, zeile: link.replace(/^https?:\/\//, '').replace(/\/$/, '') };
}

/** Kurzname fürs Protokoll und für Ist-Daten: „Sticky-559D“ → „559D“ */
export const kurz = (g) => (g?.name ?? '').replace(/^Sticky-?/, '') || g?.id?.slice(-5).replace(':', '') || '?';

// ---- Umzug (einmalig): bisher ein Sticky, alle Einstellungen global → Gerät A mit Profil „edc“ ----------------------
(function umzug() {
  try {
    if (localStorage.getItem(LISTE)) return;
    const alt = lesen(ALT, null);
    if (!alt?.id) { schreiben(LISTE, []); return; }
    schreiben(LISTE, [{ id: alt.id, name: alt.name || 'Sticky', profil: 'edc', seit: Date.now() }]);
    schreiben(AKTIV, alt.id);
    for (const k of PROFIL_SCHLUESSEL) {
      const v = localStorage.getItem(`sticky.${k}`);
      if (v != null) localStorage.setItem(`sticky.p.edc.${k}`, v);
    }
    for (const k of GERAET_SCHLUESSEL) {
      const v = localStorage.getItem(`sticky.${k}`);
      if (v != null) localStorage.setItem(`sticky.g.${alt.id}.${k}`, v);
    }
    // die alten Einträge bleiben als Rückfall stehen (werden nicht mehr gelesen)
  } catch { /* egal */ }
})();
