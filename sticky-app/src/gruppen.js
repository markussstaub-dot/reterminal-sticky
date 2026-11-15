// Gruppen im Menü (SPEC „Gruppen im Menü: Werkzeuge mit Reitern“, abgenommen 15.11.2026):
// eine Menü-Kachel je Gruppe, im Werkzeug oben Reiter der Gruppe. ▲/▼ bleibt flach (Karussell unverändert);
// Gruppen ordnen nur Menü und Reiter. Reine Logik ohne Zeichnen, damit sie in Node testbar ist.

/** Standard-Gruppen; Einträge wie in karussell.txt. Was in keiner Gruppe steht, bekommt eine eigene Kachel. */
export const GRUPPEN = [
  { id: 'zeit', de: 'Zeit', en: 'Time', glieder: ['widget timer', 'widget wecker', 'widget weltzeit'] },
  { id: 'messen', de: 'Messen', en: 'Measure', glieder: ['widget waage', 'widget lineal'] },
  { id: 'notieren', de: 'Notieren', en: 'Capture', glieder: ['notiz', 'widget recorder', 'kritzel', 'schrift'] },
  { id: 'rechnen', de: 'Rechnen', en: 'Calculate', glieder: ['widget rechner', 'widget umrechner'] },
  { id: 'nachschlagen', de: 'Nachschlagen', en: 'Look up', glieder: ['bordbuch', 'zettel'] },
];

const gruppeVon = (e) => GRUPPEN.find((g) => g.glieder.includes(e)) ?? null;

/**
 * Menü-Kacheln in Karussell-Reihenfolge (eine Gruppe erscheint dort, wo ihr erstes Glied steht).
 * → [{ gruppe|null, glieder: [{ e, i }] }]; i = Index im Karussell. Eine Gruppe mit nur einem vorhandenen Glied
 * wird zur normalen Einzelkachel.
 */
export function menueKacheln(eintraege) {
  const kacheln = [], gesehen = new Set();
  eintraege.forEach((e, i) => {
    const g = gruppeVon(e);
    if (!g) { kacheln.push({ gruppe: null, glieder: [{ e, i }] }); return; }
    if (gesehen.has(g.id)) return;
    gesehen.add(g.id);
    const glieder = g.glieder.map((x) => ({ e: x, i: eintraege.indexOf(x) })).filter((x) => x.i >= 0);
    kacheln.push({ gruppe: glieder.length > 1 ? g : null, glieder });
  });
  return kacheln;
}

/** Aktion einer Kachel: Gruppe → „gruppe <Bitmaske der Indizes>“ (Firmware wählt das zuletzt benutzte), sonst „gehe <i>“ */
export function kachelAktion(k) {
  if (!k.gruppe) return `gehe ${k.glieder[0].i}`;
  return `gruppe ${k.glieder.reduce((m, x) => m | (1 << x.i), 0)}`;
}

/**
 * Reiter für ein Widget (Name wie im Ordner, z. B. „waage“, „lineal-us“, „waage-h“) → { glieder: [{ e, i }], aktiv } oder
 * null, wenn das Widget in keiner Gruppe mit mindestens zwei vorhandenen Gliedern steckt.
 */
export function reiterFuer(name, eintraege) {
  const e = `widget ${name.replace(/-(us|h)$/, '').replace(/-(us|h)$/, '')}`;
  const g = gruppeVon(e);
  if (!g || !eintraege.includes(e)) return null;
  const glieder = g.glieder.map((x) => ({ e: x, i: eintraege.indexOf(x) })).filter((x) => x.i >= 0);
  if (glieder.length < 2) return null;
  return { glieder, aktiv: glieder.findIndex((x) => x.e === e) };
}
