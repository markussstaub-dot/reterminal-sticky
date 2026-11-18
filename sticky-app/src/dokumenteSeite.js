// App-Reiter „Dokumente“ (EN „Docs“), SPEC „Dokumente: App-Reiter als Dokumenten-Manager …“ (abgenommen 15.11.2026).
// Oben die Handbücher (PDF, je Dokument „auf dem Sticky“, Inhaltsverzeichnis, Suche, Umbenennen, Löschen), darunter die
// Spickzettel (Karten mit Szenen-Marken). „Auf den Sticky“ spielt alles auf, was sich geändert hat (FW ≥ 0.38.0):
// /soll/doku/<name>/ je Handbuch, /soll/doku/bibliothek.*, /soll/spick/. Die PDFs bleiben im App-Speicher, nie im Repo.
import { Filesystem, Directory } from '@capacitor/filesystem';
import * as bb from './bordbuch.js';
import * as dk from './dokumente.js';
import { HANDGRIFFE_STANDARD } from './handgriffe.js';
import { T, fuerSticky } from './uebersetzen.js';
import { BREITE, HOEHE, rgbaZu1bpp, crc32 } from './protokoll.js';

const LISTE = 'sticky.dokumente';   // [{ id, titel, pdfSeiten, groesse, aufSticky, inhalt, pdfMap, zuletzt }]
const SEITE = 48000;                // Byte je Bildschirm auf der Karte
const name2 = (i) => `${String(i).padStart(2, '0')}.bin`;
const hex = (b) => crc32(b).toString(16).padStart(8, '0');

/**
 * dep: { $, zwilling, eintrag, fwAb, schluessel, nativ, reiter(eintrag) → { glieder: [{ name, i }], aktiv } | null }
 * → { aufspielen, leichtAufspielen, seiteGemeldet(d), zeigeVerbindung() }
 */
export function dokumenteEinrichten(dep) {
  const { $, zwilling, eintrag, fwAb, schluessel, nativ } = dep;
  const pdfs = new Map();     // id → pdf.js-Dokument (geöffnet)
  const bytesWeb = new Map(); // id → Uint8Array (im Browser ohne App-Speicher)
  let liste = [];
  let laeuft = false;
  const lesen = () => { try { liste = JSON.parse(localStorage.getItem(LISTE) || '[]'); } catch { liste = []; } };
  const sichern = () => { try { localStorage.setItem(LISTE, JSON.stringify(liste)); } catch { /* egal */ } };
  const status = (t) => { $('dokStatus').textContent = t; };
  const leinwand = () => { const c = document.createElement('canvas'); c.width = BREITE; c.height = HOEHE; return c; };
  const bild = (zeichnen) => {
    const c = leinwand(), g = c.getContext('2d', { willReadFrequently: true });
    const r = fuerSticky(() => zeichnen(g));
    return { r, daten: rgbaZu1bpp(g.getImageData(0, 0, BREITE, HOEHE).data) };
  };

  // ---- PDFs im App-Speicher ----------------------------------------------------------------------------------
  const pfad = (id) => `dokumente/${id}.pdf`;
  async function pdfBytes(id) {
    if (bytesWeb.has(id)) return bytesWeb.get(id).slice();   // pdf.js übernimmt (leert) den Puffer
    if (!nativ) throw new Error(T('PDF nicht im Speicher (Browser)', 'PDF not stored (browser)'));
    const d = await Filesystem.readFile({ path: pfad(id), directory: Directory.Data });
    return Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
  }
  async function pdfVon(id) {
    if (!pdfs.has(id)) pdfs.set(id, await bb.oeffnePdf(await pdfBytes(id)));
    return pdfs.get(id);
  }
  async function pdfSpeichern(id, bytes) {
    if (!nativ) { bytesWeb.set(id, bytes.slice()); return; }
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    await Filesystem.writeFile({ path: pfad(id), data: btoa(bin), directory: Directory.Data, recursive: true });
  }

  /** Inhaltsverzeichnis automatisch: Lesezeichen des PDFs, sonst die INHALT-Seite (Microlino), sonst leer */
  async function inhaltAuto(pdf) {
    try {
      const outline = await pdf.getOutline();
      if (outline?.length) {
        const l = [];
        for (const o of outline.slice(0, dk.INHALT_MAX)) {
          let ziel = o.dest;
          if (typeof ziel === 'string') ziel = await pdf.getDestination(ziel);
          if (Array.isArray(ziel) && ziel[0]) l.push({ titel: o.title.trim(), seite: (await pdf.getPageIndex(ziel[0])) + 1 });
        }
        if (l.length) return l;
      }
    } catch { /* weiter mit INHALT */ }
    return (await bb.kapitel(pdf)).slice(0, dk.INHALT_MAX);
  }

  // ---- Einmaliger Umzug aus dem Bordbuch -----------------------------------------------------------------------
  async function umzug() {
    lesen();
    // Handgriffe werden Karten im Spickzettel (einmal je Profil)
    try {
      const merk = schluessel('handgriffeAlsKarten');
      if (!localStorage.getItem(merk)) {
        localStorage.setItem(merk, '1');
        const hg = localStorage.getItem(schluessel('handgriffe')) ?? HANDGRIFFE_STANDARD;
        const neu = dk.kartenAnhaengen($('spickzettel').value, hg);
        if (neu !== $('spickzettel').value) { $('spickzettel').value = neu; $('spickzettel').onchange(); }
      }
    } catch { /* egal */ }
    if (localStorage.getItem(LISTE) || !nativ) return;
    // Das Handbuch des Bordbuchs wird Dokument „Microlino“ (Ordner microlino, wie die Firmware umzieht)
    try {
      const st = await Filesystem.stat({ path: 'bordbuch/handbuch.pdf', directory: Directory.Data });
      await Filesystem.rename({ from: 'bordbuch/handbuch.pdf', to: pfad('microlino'), directory: Directory.Data, toDirectory: Directory.Data })
        .catch(async () => { await Filesystem.mkdir({ path: 'dokumente', directory: Directory.Data, recursive: true }).catch(() => {}); await Filesystem.rename({ from: 'bordbuch/handbuch.pdf', to: pfad('microlino'), directory: Directory.Data, toDirectory: Directory.Data }); });
      const pdf = await pdfVon('microlino');
      liste = [{ id: 'microlino', titel: 'Microlino', pdfSeiten: pdf.numPages, groesse: st.size, aufSticky: true, inhalt: null, pdfMap: null }];
      sichern();
      eintrag(T('Bordbuch-Handbuch ist jetzt das Dokument „Microlino“', 'Logbook manual is now the document “Microlino”'));
    } catch { liste = []; sichern(); }
  }

  // ---- Rendern ------------------------------------------------------------------------------------------------
  /** Inhaltsverzeichnis-Einträge mit Bildschirm-Zielen; braucht pdfMap (PDF-Seite je Bildschirm 1 …) */
  function inhaltMitZiel(d, kap) {
    const ersteVon = {};
    (d.pdfMap ?? []).forEach((p, i) => { ersteVon[p] ??= i + 1; });
    return kap.filter((k) => ersteVon[k.seite] != null).map((k) => ({ ...k, ziel: ersteVon[k.seite] }));
  }
  async function inhaltVon(d) {
    if (d.inhalt != null) return dk.inhaltLesen(d.inhalt);
    const auto = await inhaltAuto(await pdfVon(d.id));
    d.inhalt = dk.inhaltText(auto);
    sichern();
    return auto;
  }
  /** Bildschirm 0 (Inhaltsverzeichnis) und index.txt */
  async function tocUndIndex(d) {
    const eintraege = inhaltMitZiel(d, await inhaltVon(d));
    const { r, daten } = bild((g) => dk.zeichneInhaltsverzeichnis(g, d.titel, eintraege, dep.reiter('handbuch')));
    const index = dk.dokIndex({ seiten: 1 + d.pdfMap.length, pdf: [0, ...d.pdfMap], felder: r.felder, lz: r.lz, reiter: r.reiter });
    return { toc: daten, index: new TextEncoder().encode(index) };
  }
  /** alle PDF-Seiten als Ausschnitte rendern → Uint8Array[]; setzt d.pdfMap */
  async function pdfRendern(d) {
    const pdf = await pdfVon(d.id);
    const seiten = [], map = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      status(T(`${d.titel}: Seite ${p} von ${pdf.numPages} rendern`, `${d.titel}: rendering page ${p} of ${pdf.numPages}`));
      const teile = await bb.pdfAusschnitte(pdf, p);
      teile.forEach((t, i) => {
        seiten.push(bb.dithern(fuerSticky(() => bb.marke(t.daten, `${T('S.', 'p.')} ${p} · ${i + 1}/${teile.length}`)).data));
        map.push(p);
      });
    }
    if (seiten.length + 1 > 999) throw new Error(T('Zu viele Seiten (höchstens 998 Bildschirme)', 'Too many pages (998 screens at most)'));
    d.pdfMap = map;
    d.pdfSeiten = pdf.numPages;
    sichern();
    return seiten;
  }

  /** Ein Handbuch aufspielen. Leicht = nur Inhaltsverzeichnis und Index neu, die Seiten liegen schon drüben */
  async function dokAufspielen(d, { leicht = false } = {}) {
    const ordner = `doku/${d.id}`;
    const fort = (i, von, n) => status(T(`${d.titel}: ${n} (${i} von ${von})`, `${d.titel}: ${n} (${i} of ${von})`));
    if (leicht && d.pdfMap) {
      const { alt } = await zwilling.sollStand(ordner);
      const { toc, index } = await tocUndIndex(d);
      const dateien = [{ n: name2(0), daten: toc }, ...d.pdfMap.map((_, i) => ({ n: name2(i + 1), crc: alt[name2(i + 1)] })), { n: 'index.txt', daten: index }];
      if (dateien.every((x) => x.daten || x.crc)) {
        try { return await zwilling.sollAbgleich(ordner, dateien, fort, { umbenennen: true }); } catch (e) { if (!e.fehlt) throw e; }
      }
    }
    const seiten = await pdfRendern(d);
    const { toc, index } = await tocUndIndex(d);
    const dateien = [{ n: name2(0), daten: toc }, ...seiten.map((b, i) => ({ n: name2(i + 1), daten: b })), { n: 'index.txt', daten: index }];
    return zwilling.sollAbgleich(ordner, dateien, fort, { umbenennen: true });
  }

  /** Handbuch vom Sticky nehmen: Index zuerst (dann kennt der Sticky es nicht mehr), dann die Seiten */
  async function dokEntfernen(id) {
    const l = await zwilling.liste(`/soll/doku/${id}`).catch(() => []);
    const reihe = [...l.filter((x) => x.n === 'index.txt'), ...l.filter((x) => x.n !== 'index.txt' && !x.ordner)];
    let i = 0;
    for (const x of reihe) { status(T(`Entferne ${id}: ${++i} von ${reihe.length}`, `Removing ${id}: ${i} of ${reihe.length}`)); await zwilling.loeschen(`/soll/doku/${id}/${x.n}`); }
  }

  async function bibliothekAufspielen() {
    const drauf = liste.filter((d) => d.aufSticky && d.pdfMap).sort((a, b) => (b.zuletzt ?? 0) - (a.zuletzt ?? 0)).slice(0, 8);
    const { r, daten } = bild((g) => dk.zeichneBibliothek(g, drauf.map((d) => ({ name: d.id, titel: d.titel, seiten: d.pdfSeiten })), dep.reiter('handbuch')));
    return zwilling.sollAbgleich('doku', [{ n: 'bibliothek.bin', daten }, { n: 'bibliothek.txt', daten: new TextEncoder().encode(dk.bibIndex(r.kacheln, r.reiter)) }]);
  }

  const szene = () => { try { return localStorage.getItem(schluessel('spickSzene')) ?? ''; } catch { return ''; } };
  const kartenJetzt = () => dk.kartenDerSzene(dk.karten($('spickzettel').value), szene()).slice(0, 99);
  async function spickAufspielen() {
    const k = kartenJetzt();
    const reiter = dep.reiter('spickzettel');
    const dateien = [], felder = [];
    let rf = [];
    k.forEach((_, i) => { const { r, daten } = bild((g) => dk.zeichneSpickKarte(g, k, i, reiter)); dateien.push({ n: name2(i), daten }); felder.push(r.felder); rf = r.reiter; });
    dateien.push({ n: 'index.txt', daten: new TextEncoder().encode(dk.spickIndex(k.length, felder, rf)) });
    return zwilling.sollAbgleich('spick', dateien, (i, von, n) => status(T(`Spickzettel: ${n} (${i} von ${von})`, `Cheat sheets: ${n} (${i} of ${von})`)), { umbenennen: true });
  }

  /** Alles aufspielen; leicht = Handbuch-Seiten nicht neu rendern (nach Karussell- oder Sprachwechsel) */
  async function aufspielen({ leicht = false } = {}) {
    if (!zwilling.verbunden || laeuft) return;
    if (!fwAb('0.38.0')) { status(T('Dokumente brauchen Firmware 0.38.0 auf dem Sticky', 'Docs need firmware 0.38.0 on the Sticky')); return; }
    laeuft = true;
    knoepfe();
    const t0 = performance.now();
    let n = 0;
    try {
      n += await spickAufspielen();
      const doku = await zwilling.liste('/soll/doku').catch(() => []);
      // Schalter = nur sichtbar in der Bibliothek (Markus, 15.11.2026: Karte hat Platz, Bluetooth ist langsam) – Dateien bleiben
      // auf der Karte; entfernt wird nur, was in der App gelöscht wurde
      for (const x of doku.filter((x) => x.ordner && !liste.some((d) => d.id === x.n))) await dokEntfernen(x.n);
      for (const d of liste.filter((x) => x.aufSticky)) {
        try { n += await dokAufspielen(d, { leicht: leicht || !!d.pdfMap?.length }); } catch (e) { eintrag(`${d.titel}: ${e.message}`, true); }
      }
      n += await bibliothekAufspielen();
      const s = Math.round((performance.now() - t0) / 1000);
      status(T(`Auf dem Sticky (${n} Dateien neu, ${s} s)`, `On the Sticky (${n} files new, ${s} s)`));
      if (n) eintrag(T(`Dokumente aufgespielt: ${n} Dateien, ${s} s`, `Docs uploaded: ${n} files, ${s} s`));
    } catch (e) {
      status(T(`Fehler: ${e.message}`, `Error: ${e.message}`));
      eintrag(T(`Dokumente: ${e.message}`, `Docs: ${e.message}`), true);
    } finally {
      laeuft = false;
      knoepfe();
      zeigen();
    }
  }

  // ---- Oberfläche ---------------------------------------------------------------------------------------------
  const el = (tag, attr = {}, ...kinder) => { const e = Object.assign(document.createElement(tag), attr); e.append(...kinder.filter((k) => k != null)); return e; };
  const mb = (b) => (b / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 });
  function knoepfe() {
    const an = zwilling.verbunden && !laeuft;
    $('dokAufspielen').disabled = !an;
    for (const b of document.querySelectorAll('#dokListe .braucht')) b.disabled = !an;
  }

  async function suchen(d, wort, ziel) {
    ziel.textContent = T('Suche …', 'Searching …');
    const pdf = await pdfVon(d.id), w = wort.toLowerCase(), treffer = [];
    for (let p = 1; p <= pdf.numPages && treffer.length < 8; p++) {
      const text = (await (await pdf.getPage(p)).getTextContent()).items.map((x) => x.str).join(' ');
      const i = text.toLowerCase().indexOf(w);
      if (i >= 0) treffer.push({ p, schnipsel: text.slice(Math.max(0, i - 30), i + w.length + 40).replace(/\s+/g, ' ').trim() });
    }
    ziel.replaceChildren(...(treffer.length ? treffer.map((t) => {
      const b = el('button', { className: 'braucht', textContent: `${T('S.', 'p.')} ${t.p}` });
      b.disabled = !zwilling.verbunden;
      b.onclick = async () => {
        const screen = (d.pdfMap ?? []).indexOf(t.p);
        if (screen < 0) { eintrag(T('Erst aufspielen, dann springen', 'Upload first, then jump'), true); return; }
        try {
          await zwilling.schreibeDatei('/soll/doku/sprung.txt', new TextEncoder().encode(`${d.id} ${screen + 1}\n`));
          eintrag(T(`Sticky zeigt ${d.titel}, S. ${t.p}`, `Sticky shows ${d.titel}, p. ${t.p}`));
        } catch (e) { eintrag(e.message, true); }
      };
      return el('div', { className: 'leiste' }, b, el('span', { className: 'klein', textContent: `… ${t.schnipsel} …` }));
    }) : [el('span', { className: 'klein', textContent: T('nichts gefunden', 'nothing found') })]));
  }

  function zeigen() {
    lesen();
    const ziel = $('dokListe');
    ziel.replaceChildren(...liste.map((d) => {
      const schalter = el('input', { type: 'checkbox', checked: !!d.aufSticky, title: T('in der Bibliothek am Sticky sichtbar (bleibt auf der Karte)', 'visible in the library on the Sticky (stays on the card)') });
      schalter.onclick = (e) => e.stopPropagation();
      schalter.onchange = () => { d.aufSticky = schalter.checked; sichern(); zeigen(); };
      const n = dk.inhaltLesen(d.inhalt ?? '').length;
      const info = [d.pdfSeiten ? T(`${d.pdfSeiten} Seiten`, `${d.pdfSeiten} pages`) : null, d.groesse ? `${mb(d.groesse)} MB` : null,
        n ? T(`Inhalt ${n} Kapitel`, `${n} chapters`) : null, d.pdfMap && d.aufSticky ? T(`${d.pdfMap.length + 1} Bildschirme`, `${d.pdfMap.length + 1} screens`) : null].filter(Boolean).join(' · ');
      const kopf = el('summary', {}, el('label', { className: 'schalter' }, schalter), ' ', el('b', { textContent: d.titel }), el('div', { className: 'klein', textContent: info }));
      // Inhaltsverzeichnis
      const inhalt = el('textarea', { rows: 8, spellcheck: false, value: d.inhalt ?? '' });
      inhalt.onchange = () => { d.inhalt = inhalt.value; sichern(); };
      const auto = el('button', { textContent: T('Automatisch', 'Automatic') });
      auto.onclick = async () => { try { inhalt.value = dk.inhaltText(await inhaltAuto(await pdfVon(d.id))); inhalt.onchange(); } catch (e) { eintrag(e.message, true); } };
      // Suche
      const wort = el('input', { type: 'text', placeholder: T('z. B. Reifendruck', 'e.g. tyre pressure') });
      const treffer = el('div');
      const such = el('button', { textContent: T('Suchen', 'Search') });
      such.onclick = () => { if (wort.value.trim()) suchen(d, wort.value.trim(), treffer).catch((e) => { treffer.textContent = e.message; }); };
      // Umbenennen, Löschen
      const titel = el('input', { type: 'text', value: d.titel });
      const umb = el('button', { textContent: T('Umbenennen', 'Rename') });
      umb.onclick = () => { const t = titel.value.trim(); if (t) { d.titel = t; sichern(); zeigen(); } };
      const weg = el('button', { className: 'gefahr', textContent: T('Löschen', 'Delete') });
      weg.onclick = async () => {
        if (!confirm(T(`„${d.titel}“ aus der App löschen? Auf dem Sticky verschwindet es beim nächsten Aufspielen.`, `Delete “${d.titel}” from the app? It leaves the Sticky with the next upload.`))) return;
        liste = liste.filter((x) => x.id !== d.id);
        sichern();
        pdfs.delete(d.id);
        if (nativ) await Filesystem.deleteFile({ path: pfad(d.id), directory: Directory.Data }).catch(() => {});
        zeigen();
      };
      return el('details', { className: 'werkstatt' }, kopf,
        el('p', { className: 'klein', textContent: T('Seite suchen – der Sticky springt hin:', 'Find a page – the Sticky jumps there:') }),
        el('div', { className: 'leiste' }, wort, such), treffer,
        el('p', { className: 'klein', textContent: T(`Inhaltsverzeichnis, je Zeile „Titel | PDF-Seite“ (höchstens ${dk.INHALT_MAX}):`, `Contents, one “title | PDF page” per line (at most ${dk.INHALT_MAX}):`) }),
        inhalt, el('div', { className: 'leiste' }, auto),
        el('div', { className: 'leiste' }, titel, umb, weg));
    }));
    if (!liste.length) ziel.append(el('p', { className: 'klein', textContent: T('Noch kein Handbuch. „+ PDF“ lädt eins.', 'No manual yet. “+ PDF” adds one.') }));
    const belegt = liste.filter((d) => d.aufSticky && d.pdfMap).reduce((s, d) => s + (d.pdfMap.length + 1) * SEITE, 0) + kartenJetzt().length * SEITE;
    const karte = zwilling.geraet?.sdmb;
    $('dokPlatz').textContent = T(`Platz auf der Karte: ${mb(belegt)} MB für Dokumente${karte ? ` von ${(karte / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} GB` : ''}`,
      `Space on the card: ${mb(belegt)} MB for docs${karte ? ` of ${(karte / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} GB` : ''}`);
    spickZeigen();
    knoepfe();
  }

  function spickZeigen() {
    const alle = dk.karten($('spickzettel').value), s = szene();
    const chip = (m, t) => { const b = el('button', { textContent: t, className: m === s ? 'an' : '' }); b.onclick = () => { try { localStorage.setItem(schluessel('spickSzene'), m); } catch { /* egal */ } spickZeigen(); }; return b; };
    $('szenen').replaceChildren(el('span', { className: 'klein', textContent: T('Szene:', 'Scene:') }), chip('', T('Alle', 'All')), ...dk.alleMarken(alle).map((m) => chip(m, `#${m}`)));
    const drin = new Set(dk.kartenDerSzene(alle, s));
    $('spickListe').replaceChildren(...alle.map((k) => el('div', { className: `kartezeile${drin.has(k) ? '' : ' aus'}` },
      el('b', { textContent: k.titel }), ' ', el('span', { className: 'klein', textContent: `${k.marken.map((m) => `#${m}`).join(' ')} · ${T(`${k.zeilen.length} Zeilen`, `${k.zeilen.length} lines`)}${k.zeilen.length > 10 ? T(' – zu lang?', ' – too long?') : ''}` }))));
    $('spickZahl').textContent = T(`${drin.size} von ${alle.length} Karten kommen auf den Sticky`, `${drin.size} of ${alle.length} cards go to the Sticky`);
  }

  // + PDF
  $('pdfDatei').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      lesen();
      const bytes = new Uint8Array(await f.arrayBuffer());
      const titel = f.name.replace(/\.pdf$/i, '');
      const id = dk.ordnerName(titel, liste.map((d) => d.id)), groesse = bytes.length;
      await pdfSpeichern(id, bytes);
      const pdf = await pdfVon(id);
      liste.push({ id, titel, pdfSeiten: pdf.numPages, groesse, aufSticky: true, inhalt: null, pdfMap: null });
      sichern();
      await inhaltVon(liste[liste.length - 1]);
      eintrag(T(`Handbuch „${titel}“ geladen (${pdf.numPages} Seiten)`, `Manual “${titel}” loaded (${pdf.numPages} pages)`));
      zeigen();
    } catch (err) { eintrag(T(`PDF: ${err.message}`, `PDF: ${err.message}`), true); }
  };
  $('dokAufspielen').onclick = () => aufspielen();
  $('spickzettel').addEventListener('input', () => spickZeigen());
  $('spickzettel').addEventListener('change', () => spickZeigen());

  umzug().finally(zeigen);

  return {
    aufspielen,
    zeigeVerbindung: () => { knoepfe(); if ($('dokPlatz')) zeigen(); },
    /** Ereignis „seite“ vom Sticky: zuletzt gelesenes Dokument merken (Bibliothek ordnet danach) */
    seiteGemeldet(d) {
      if (!d.d) return;
      lesen();
      const x = liste.find((y) => y.id === d.d);
      if (x) { x.zuletzt = Date.now(); sichern(); }
    },
  };
}
