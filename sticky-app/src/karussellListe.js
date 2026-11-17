// Karussell als Liste nach Gruppen (Mehr → Karussell; SPEC „Gruppen im Menü“ und Vorschlag „Karussell mit Häkchen und
// Pfeilen“, Markus 15.11.2026). Statt eines Textfelds: Gruppen-Blöcke mit Häkchen (drin/raus) und Pfeilen (Reihenfolge).
// Reine Logik ohne DOM; gespeichert wird weiter die Wortliste unter `karussell` (kanonische deutsche Wörter).
import { GRUPPEN } from './gruppen.js';

/** alle Seiten in Standard-Reihenfolge: kanonisches Wort → Eintrag in karussell.txt */
export const SEITEN = [
  ['home', 'home'], ['timer', 'widget timer'], ['wecker', 'widget wecker'], ['weltzeit', 'widget weltzeit'],
  ['waage', 'widget waage'], ['lineal', 'widget lineal'], ['recorder', 'widget recorder'], ['tippen', 'widget tippen'],
  ['kritzel', 'kritzel'], ['schrift', 'schrift'], ['notiz', 'notiz'], ['rechner', 'widget rechner'], ['umrechner', 'widget umrechner'],
  ['handbuch', 'handbuch'], ['spickzettel', 'spickzettel'], ['zettel', 'zettel'], ['spiel', 'app'], ['einstellungen', 'widget einstellungen'], ['notfall', 'widget notfall'],
];
const EINTRAG = Object.fromEntries(SEITEN);
const WORT = Object.fromEntries(SEITEN.map(([w, e]) => [e, w]));

/** Blöcke in Standard-Reihenfolge: Gruppe (mehrere Wörter) oder Einzelseite */
function standardBloecke() {
  const bloecke = [], drin = new Set();
  for (const [w, e] of SEITEN) {
    if (drin.has(w)) continue;
    const g = GRUPPEN.find((x) => x.glieder.includes(e));
    const glieder = g ? g.glieder.map((x) => WORT[x]).filter(Boolean) : [w];
    glieder.forEach((x) => drin.add(x));
    bloecke.push({ id: g ? g.id : w, gruppe: g ?? null, glieder });
  }
  return bloecke;
}

/**
 * Zustand aus den aufgelösten Einträgen (Zeilen von karussellText(), z. B. „widget timer“): Blöcke in der Reihenfolge,
 * in der ihr erstes eingeschaltetes Glied steht; darin erst die eingeschalteten in Karussell-Reihenfolge, dann die übrigen.
 * → { bloecke: [{ id, gruppe, glieder }], an: Set<Wort> }
 */
export function zustandAus(eintraege) {
  const pos = new Map();
  eintraege.forEach((e, i) => { if (WORT[e] && !pos.has(WORT[e])) pos.set(WORT[e], i); });
  const an = new Set(pos.keys());
  an.add('home');
  pos.set('home', -1);   // Home steht immer vorn (die Firmware setzt es sonst selbst davor)
  const rang = (w) => (pos.has(w) ? pos.get(w) : Infinity);
  const bloecke = standardBloecke().map((b, i) => ({ ...b, glieder: [...b.glieder].sort((x, y) => rang(x) - rang(y)), std: i }));
  bloecke.sort((x, y) => (rang(x.glieder[0]) - rang(y.glieder[0])) || (x.std - y.std));
  return { bloecke: bloecke.map(({ std, ...b }) => b), an };
}

/** Zustand → Wortliste zum Speichern (nur eingeschaltete, Blockreihenfolge, darin Gliedreihenfolge) */
export function wortliste(z) {
  return z.bloecke.flatMap((b) => b.glieder.filter((w) => z.an.has(w))).join(', ');
}


/** Häkchen umschalten (Home bleibt immer an) */
export function umschalten(z, wort) {
  if (wort === 'home') return z;
  const an = new Set(z.an);
  if (an.has(wort)) an.delete(wort); else an.add(wort);
  return { ...z, an };
}

/** Block um r (−1 hoch, +1 runter) verschieben; Home bleibt oben */
export function blockSchieben(z, id, r) {
  const b = [...z.bloecke], i = b.findIndex((x) => x.id === id), j = i + r;
  if (i < 0 || j < 0 || j >= b.length || b[i].id === 'home' || b[j].id === 'home') return z;
  [b[i], b[j]] = [b[j], b[i]];
  return { ...z, bloecke: b };
}

/** Glied innerhalb seines Blocks um r verschieben */
export function gliedSchieben(z, wort, r) {
  const bloecke = z.bloecke.map((b) => {
    const i = b.glieder.indexOf(wort), j = i + r;
    if (i < 0 || j < 0 || j >= b.glieder.length) return b;
    const g = [...b.glieder];
    [g[i], g[j]] = [g[j], g[i]];
    return { ...b, glieder: g };
  });
  return { ...z, bloecke };
}

export { EINTRAG };
