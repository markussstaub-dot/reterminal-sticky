// App-Reiter „Zettel“ (EN „Cards“), SPEC „Zettel überarbeiten: Karten statt Textfeld …“ (abgenommen 18.11.2026),
// Mockup docs/zettel-mockup.html. Eine Liste aus Karten wie bei „Dokumente“: Symbol der Art, Titel, Kurzinfo, Schalter
// „auf dem Sticky“ (höchstens 6), ⋮⋮ ziehen = Reihenfolge, Tippen öffnet die Karte. Gespeichert wird weiter der Text
// (zettel.js) – das Textfeld bleibt hinter „Als Text bearbeiten“ und ist die Quelle, aus der alles gelesen wird.
import { T, fuerSticky } from './uebersetzen.js';
import { BREITE, HOEHE } from './protokoll.js';
import {
  MAX_ZETTEL, zettelKarten, zettelText, zettelListe, punkte, kurzinfo, strichLesen, strichZeile, titelVorschlag, qrZeilen, eindeutig,
} from './zettel.js';
import { zeichneZettelSeite } from './zettelBild.js';
import { codeAusBild } from './qrlesen.js';
import { strichFormat, strichModule } from './strichcode.js';
import { blattOeffnen, el } from './blatt.js';
import { orteLesen } from './kontext.js';

export const SYMBOL = { liste: '☑', qr: '▦', strich: '║', text: '≡', wlan: '◉', link: '↗' };
const ARTNAME = () => ({
  qr: [T('QR abfotografieren', 'Photograph QR code'), T('Kundenkarte, Ticket, Gutschein', 'Loyalty card, ticket, voucher')],
  strich: [T('Strichcode abfotografieren', 'Photograph barcode'), T('Payback, Bibliotheksausweis …', 'Loyalty card, library card …')],
  liste: [T('Liste', 'List'), T('Einkauf, Packliste – am Sticky abhaken', 'Shopping, packing – tick off on the Sticky')],
  text: ['Text', T('Bestellung zum Vorzeigen', 'Order to show at the counter')],
  wlan: [T('WLAN', 'Wi-Fi'), T('Name + Passwort → QR zum Einwählen', 'Name + password → QR to join')],
  link: ['Link', T('Adresse → QR', 'Address → QR')],
});

/**
 * dep: { $, eintrag, speichern(text) (Textfeld + localStorage + Abgleich), orteText(), orteUmbenennen(alt, neu) }
 * → { zeigen() } (nach Änderungen am Textfeld von außen)
 */
export function zettelSeiteEinrichten(dep) {
  const { $, eintrag } = dep;
  const lesen = () => zettelKarten($('zettelText').value);
  const schreiben = (d) => { dep.speichern(zettelText(d)); zeigen(); };
  const anzahlAn = (d) => d.karten.filter((k) => k.aufSticky).length;
  /** Platz am Sticky (1 …) oder 0 */
  const platzVon = (d, i) => {
    if (!d.karten[i].aufSticky) return 0;
    const titel = zettelListe(zettelText(d)).map((z) => z.titel);
    return titel.indexOf(d.karten[i].titel) + 1;
  };

  // ---- Liste ------------------------------------------------------------------------------------------------
  function zeigen() {
    const d = lesen();
    const liste = $('zettelListe');
    liste.replaceChildren(...d.karten.map((k, i) => {
      const schalter = el('input', { type: 'checkbox', checked: k.aufSticky, 'aria-label': T('auf dem Sticky', 'on the Sticky') });
      schalter.onclick = (e) => e.stopPropagation();
      schalter.onchange = () => {
        const d2 = lesen();
        if (schalter.checked && anzahlAn(d2) >= MAX_ZETTEL) {
          schalter.checked = false;
          eintrag(T(`Höchstens ${MAX_ZETTEL} Zettel auf dem Sticky – erst einen ausschalten`, `At most ${MAX_ZETTEL} cards on the Sticky – switch one off first`), true);
          return;
        }
        d2.karten[i].aufSticky = schalter.checked;
        schreiben(d2);
      };
      const griff = el('span', { className: 'griff', textContent: '⋮⋮', 'aria-label': T('ziehen zum Sortieren', 'drag to sort') });
      const zeile = el('div', { className: `zettelzeile${k.aufSticky ? '' : ' aus'}`, dataset: { i: String(i) } },
        griff, el('span', { className: 'sym', textContent: SYMBOL[k.art] }),
        el('div', { className: 't' }, el('b', { textContent: k.titel }), el('span', { className: 'klein', textContent: kurzinfo(k) })),
        el('label', { className: 'schalter' }, schalter));
      zeile.onclick = () => karteOeffnen(i);
      ziehbar(griff, zeile);
      return zeile;
    }));
    if (!d.karten.length) liste.append(el('p', { className: 'klein', textContent: T('Noch keine Zettel. „+ Zettel“ legt einen an.', 'No cards yet. “+ Card” adds one.') }));
    const n = anzahlAn(d);
    $('zettelZahl').textContent = T(`${Math.min(n, MAX_ZETTEL)} von ${MAX_ZETTEL} auf dem Sticky`, `${Math.min(n, MAX_ZETTEL)} of ${MAX_ZETTEL} on the Sticky`)
      + (d.karten.length > n ? T(` · ${d.karten.length - n} nur in der App`, ` · ${d.karten.length - n} in the app only`) : '');
  }

  /** ⋮⋮ ziehen: Zeile wandert mit, beim Loslassen gilt die neue Reihenfolge */
  function ziehbar(griff, zeile) {
    griff.addEventListener('click', (e) => e.stopPropagation());
    griff.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { griff.setPointerCapture(e.pointerId); } catch { /* ohne Capture geht es auch, solange der Finger auf dem Griff bleibt */ }
      zeile.classList.add('zieht');
      const liste = zeile.parentElement;
      const bewegen = (ev) => {
        const y = ev.clientY;
        const vor = zeile.previousElementSibling, nach = zeile.nextElementSibling;
        if (vor && y < vor.getBoundingClientRect().top + vor.offsetHeight / 2) liste.insertBefore(zeile, vor);
        else if (nach && y > nach.getBoundingClientRect().top + nach.offsetHeight / 2) liste.insertBefore(nach, zeile);
      };
      const los = () => {
        griff.removeEventListener('pointermove', bewegen);
        griff.removeEventListener('pointerup', los);
        griff.removeEventListener('pointercancel', los);
        zeile.classList.remove('zieht');
        const folge = [...liste.querySelectorAll('.zettelzeile')].map((z) => Number(z.dataset.i));
        if (folge.every((x, i) => x === i)) return;
        const d = lesen();
        d.karten = folge.map((i) => d.karten[i]);
        schreiben(d);
      };
      griff.addEventListener('pointermove', bewegen);
      griff.addEventListener('pointerup', los);
      griff.addEventListener('pointercancel', los);
    });
  }

  // ---- Neuer Zettel -----------------------------------------------------------------------------------------
  function fotoWahl(art, wennFertig, meldung) {
    const eingabe = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
    eingabe.onchange = async () => {
      const datei = eingabe.files?.[0];
      eingabe.value = '';
      if (!datei) return;
      meldung.textContent = T('lese …', 'reading …');
      try {
        const r = await codeAusBild(datei, art);
        if (!r) { meldung.textContent = T('Kein Code erkannt – näher ran, gerade halten, gutes Licht.', 'No code found – get closer, hold straight, good light.'); return; }
        meldung.textContent = '';
        wennFertig(r);
      } catch (e) { meldung.textContent = T(`Foto nicht lesbar: ${e.message}`, `Photo not readable: ${e.message}`); }
    };
    return eingabe;
  }

  function anlegen(titel, zeilen, art) {
    const d = lesen();
    const k = { titel: eindeutig(titel, d.karten.map((x) => x.titel)), zeilen, aufSticky: anzahlAn(d) < MAX_ZETTEL, art };
    d.karten.push(k);
    schreiben(d);
    if (!k.aufSticky) eintrag(T(`Schon ${MAX_ZETTEL} auf dem Sticky – „${k.titel}“ bleibt erst einmal in der App`, `Already ${MAX_ZETTEL} on the Sticky – “${k.titel}” stays in the app for now`));
    karteOeffnen(d.karten.length - 1, art);
  }

  function neuOeffnen() {
    const meldung = el('p', { className: 'klein meldung2' });
    const namen = ARTNAME();
    const zeilen = ['qr', 'strich', 'liste', 'text', 'wlan', 'link'].map((art) => {
      const inhalt = [el('span', { className: 'sym', textContent: SYMBOL[art] }), el('div', { className: 't' }, el('b', { textContent: namen[art][0] }), el('span', { className: 'klein', textContent: namen[art][1] }))];
      if (art === 'qr' || art === 'strich') {
        const wahl = fotoWahl(art, (r) => {
          if (r.art === 'qr') anlegen(titelVorschlag(r.text, 'qr'), qrZeilen(r.text), null);
          else anlegen(titelVorschlag(r.code, 'strich'), [strichZeile(r)], 'strich');
        }, meldung);
        return el('label', { className: 'zettelzeile wahl' }, wahl, ...inhalt);
      }
      const b = el('div', { className: 'zettelzeile wahl', role: 'button', tabIndex: 0 }, ...inhalt);
      b.onclick = () => anlegen({ liste: T('Einkauf', 'Shopping'), text: T('Bestellung', 'Order'), wlan: T('Gast-WLAN', 'Guest Wi-Fi'), link: 'Link' }[art], [], art);
      return b;
    });
    blattOeffnen(T('Neuer Zettel', 'New card'), [...zeilen, meldung,
      el('p', { className: 'klein', textContent: T('Abfotografieren läuft offline, das Foto wird nicht gespeichert.', 'Reading works offline, the photo is not kept.') })]);
  }

  // ---- Karte ------------------------------------------------------------------------------------------------
  function karteOeffnen(i, artWunsch = null) {
    let d = lesen();
    let k = d.karten[i];
    if (!k) return;
    const art = artWunsch ?? k.art;
    const titel = k.titel;
    const re = { qr: /^qr:\s*(.*)$/i, strich: /^strich:\s*(.*)$/i, wlan: /^wlan:\s*(.*)$/i, link: /^link:\s*(.*)$/i }[art];
    const haupt = re ? k.zeilen.find((z) => re.test(z))?.match(re)[1].trim() ?? '' : '';
    const zusatz = re ? k.zeilen.filter((z) => !re.test(z)) : [];

    const vorschau = el('canvas', { className: 'zettelvorschau', width: BREITE, height: HOEHE });
    const meldung = el('p', { className: 'klein meldung2' });
    const felder = [];
    const titelFeld = el('input', { type: 'text', value: titel });
    let zeilenAus;   // () → Zeilen der Karte aus den Feldern

    if (art === 'qr' || art === 'link') {
      const inhalt = el('input', { type: 'text', value: haupt, spellcheck: false });
      const mehr = el('textarea', { rows: 2, value: zusatz.join('\n'), spellcheck: false });
      felder.push(el('span', { className: 'klein', textContent: art === 'qr' ? T('Inhalt (nur zur Kontrolle)', 'Content (just to check)') : T('Adresse', 'Address') }), inhalt,
        el('span', { className: 'klein', textContent: T('Zeilen daneben (z. B. Kundennummer)', 'Lines beside it (e.g. customer number)') }), mehr);
      zeilenAus = () => [...(inhalt.value.trim() ? [`${art}: ${inhalt.value.trim()}`] : []), ...mehr.value.split('\n').map((z) => z.trim()).filter(Boolean)];
    } else if (art === 'strich') {
      const s = haupt ? strichLesen(haupt) : { format: 'EAN13', code: '' };
      const format = el('select', {}, el('option', { value: 'EAN13', textContent: 'EAN-13' }), el('option', { value: 'CODE128', textContent: 'Code128' }));
      format.value = s.format;
      const nummer = el('input', { type: 'text', value: s.code, inputMode: 'text', spellcheck: false });
      nummer.addEventListener('change', () => { if (nummer.value.trim()) format.value = strichFormat(nummer.value); });
      const mehr = el('textarea', { rows: 2, value: zusatz.join('\n'), spellcheck: false });
      felder.push(el('span', { className: 'klein', textContent: T('Nummer', 'Number') }), el('div', { className: 'leiste' }, format, nummer),
        el('span', { className: 'klein', textContent: T('Zeilen darunter', 'Lines below') }), mehr);
      zeilenAus = () => {
        const code = nummer.value.trim();
        let ok = true;
        if (code) { try { strichModule({ format: format.value, code: format.value === 'EAN13' ? code.replace(/\s/g, '') : code }); } catch { ok = false; } }
        meldung.textContent = ok ? '' : T('Diese Nummer passt nicht zum Format (EAN-13 = 13 Ziffern mit Prüfziffer).', 'This number does not fit the format (EAN-13 = 13 digits with check digit).');
        return [...(code ? [strichZeile({ format: format.value, code: format.value === 'EAN13' ? code.replace(/\s/g, '') : code })] : []), ...mehr.value.split('\n').map((z) => z.trim()).filter(Boolean)];
      };
    } else if (art === 'wlan') {
      const [n0 = '', p0 = ''] = haupt.split('|').map((t) => t.trim());
      const name = el('input', { type: 'text', value: n0, spellcheck: false, autocomplete: 'off' });
      const pw = el('input', { type: 'text', value: p0, spellcheck: false, autocomplete: 'off' });
      felder.push(el('span', { className: 'klein', textContent: T('Netzname', 'Network name') }), name, el('span', { className: 'klein', textContent: T('Passwort (leer = offenes Netz)', 'Password (empty = open network)') }), pw);
      zeilenAus = () => [...(name.value.trim() ? [`wlan: ${name.value.trim().replace(/\|/g, '/')}${pw.value.trim() ? ` | ${pw.value.trim()}` : ''}`] : []), ...zusatz];
    } else if (art === 'liste') {
      const kasten = el('div', { className: 'punkte' });
      const p = punkte(k.zeilen).map((x) => ({ ...x }));
      const malen = () => kasten.replaceChildren(...p.map((x, j) => {
        const cb = el('input', { type: 'checkbox', checked: x.ab });
        cb.onchange = () => { x.ab = cb.checked; uebernehmen(); };
        const t = el('input', { type: 'text', value: x.text });
        t.onchange = () => { x.text = t.value.trim(); if (!x.text) p.splice(j, 1); uebernehmen(); malen(); };
        const weg = el('button', { className: 'klein2', textContent: '✕', 'aria-label': T('entfernen', 'remove') });
        weg.onclick = () => { p.splice(j, 1); uebernehmen(); malen(); };
        return el('div', { className: 'punkt' }, cb, t, weg);
      }));
      const neu = el('input', { type: 'text', placeholder: T('+ Punkt (Enter)', '+ item (Enter)'), enterKeyHint: 'enter' });
      neu.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !neu.value.trim()) return;
        e.preventDefault();
        for (const t of neu.value.split(/[,;]\s*/)) if (t.trim()) p.push({ text: t.trim(), ab: false });
        neu.value = '';
        uebernehmen(); malen();
      });
      neu.addEventListener('change', () => { if (neu.value.trim()) neu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
      const abWeg = el('button', { textContent: T('Abgehakte entfernen', 'Remove ticked') });
      abWeg.onclick = () => { for (let j = p.length - 1; j >= 0; j--) if (p[j].ab) p.splice(j, 1); uebernehmen(); malen(); };
      const keinHaken = el('button', { textContent: T('Alle Häkchen weg', 'Untick all') });
      keinHaken.onclick = () => { p.forEach((x) => { x.ab = false; }); uebernehmen(); malen(); };
      malen();
      felder.push(kasten, neu, el('div', { className: 'leiste' }, abWeg, keinHaken),
        el('p', { className: 'klein', textContent: T('Am Sticky: Tippen auf eine Zeile hakt ab, die App übernimmt es beim Abgleich. Bis 20 Punkte.', 'On the Sticky: tap a line to tick it, the app takes it over when syncing. Up to 20 items.') }));
      zeilenAus = () => p.filter((x) => x.text).map((x) => `[${x.ab ? 'x' : ' '}] ${x.text}`);
    } else {
      const text = el('textarea', { rows: 6, value: k.zeilen.join('\n'), spellcheck: true });
      felder.push(el('span', { className: 'klein', textContent: T('Zeilen (so groß wie möglich am Sticky)', 'Lines (as large as possible on the Sticky)') }), text);
      zeilenAus = () => text.value.split('\n').map((z) => z.trim()).filter(Boolean);
    }

    const amSticky = el('input', { type: 'checkbox', checked: k.aufSticky });
    const platz = el('span', { className: 'klein' });
    const ortInfo = el('span', { className: 'klein' });
    const infoAuffrischen = () => {
      const n = platzVon(d, i);
      platz.textContent = n ? T(`als Zettel ${n}`, `as card ${n}`) : k.aufSticky ? T('kein Inhalt – noch nicht am Sticky', 'no content – not on the Sticky yet') : T('nur in der App', 'in the app only');
      const orte = orteLesen(dep.orteText(), [k.titel]).filter((o) => o.ziel.name === k.titel).map((o) => o.name);
      ortInfo.textContent = orte.length ? orte.join(', ') : T('kein Ort – unter Mehr → Verknüpfungen → Orte als Ziel eintragen', 'no place – set it as target under More → Connections → Places');
    };
    const vorschauMalen = () => {
      const g = vorschau.getContext('2d');
      const x = fuerSticky(() => zettelListe(zettelText({ karten: [{ ...k, aufSticky: true }] }))[0]);
      if (x) fuerSticky(() => zeichneZettelSeite(g, x, Math.max(1, platzVon(d, i)), Math.max(1, Math.min(MAX_ZETTEL, anzahlAn(d)))));
      else { g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, BREITE, HOEHE); g.fillStyle = '#666'; g.font = '32px sans-serif'; g.textAlign = 'center'; g.fillText(T('noch leer', 'still empty'), BREITE / 2, HOEHE / 2); }
    };
    /** Felder → Karte → Text speichern */
    function uebernehmen() {
      d = lesen();
      const jetzt = d.karten[i];
      if (!jetzt) return;
      jetzt.zeilen = zeilenAus();
      jetzt.aufSticky = amSticky.checked;
      const t = titelFeld.value.trim() || k.titel;
      if (t !== jetzt.titel) {
        const neu = eindeutig(t, d.karten.filter((_, j) => j !== i).map((x) => x.titel));
        dep.orteUmbenennen(jetzt.titel, neu);
        jetzt.titel = neu;
        titelFeld.value = neu;
        b.titelSetzen(neu);
      }
      k = jetzt;
      schreiben(d);
      d = lesen();
      infoAuffrischen();
      vorschauMalen();
    }
    amSticky.onchange = () => {
      if (amSticky.checked && !k.aufSticky && anzahlAn(lesen()) >= MAX_ZETTEL) {
        amSticky.checked = false;
        eintrag(T(`Höchstens ${MAX_ZETTEL} Zettel auf dem Sticky – erst einen ausschalten`, `At most ${MAX_ZETTEL} cards on the Sticky – switch one off first`), true);
        return;
      }
      uebernehmen();
    };
    titelFeld.onchange = uebernehmen;
    for (const f of felder) for (const e of [f, ...f.querySelectorAll?.('input,select,textarea') ?? []]) {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName) && !e.onchange && !e.closest('.punkte')) e.addEventListener('change', uebernehmen);
    }

    const knoepfe = [];
    if (art === 'qr' || art === 'strich') {
      knoepfe.push(el('label', { className: 'dateiwahl' }, fotoWahl(art, (r) => {
        d = lesen();
        d.karten[i].zeilen = r.art === 'qr' ? [...qrZeilen(r.text), ...zusatz] : [strichZeile(r), ...zusatz];
        schreiben(d);
        karteOeffnen(i);
        eintrag(T('Neu abfotografiert', 'Photographed again'));
      }, meldung), el('span', { textContent: T('Neu abfotografieren', 'Photograph again') })));
    }
    const loeschen = el('button', { textContent: T('Löschen', 'Delete') });
    loeschen.onclick = () => {
      if (!confirm(T(`Zettel „${k.titel}“ löschen?`, `Delete card “${k.titel}”?`))) return;
      d = lesen();
      d.karten.splice(i, 1);
      schreiben(d);
      b.schliessen();
    };
    const fertig = el('button', { className: 'haupt', textContent: T('Fertig', 'Done') });
    fertig.onclick = () => b.schliessen();
    knoepfe.push(loeschen, fertig);

    const b = blattOeffnen(k.titel, [
      el('span', { className: 'klein', textContent: T('Titel', 'Title') }), titelFeld,
      el('div', { className: 'vorschaurahmen' }, vorschau),
      ...felder, meldung,
      el('label', { className: 'zettelzeile' }, el('div', { className: 't' }, el('b', { textContent: T('Auf dem Sticky', 'On the Sticky') }), platz), el('span', { className: 'schalter' }, amSticky)),
      el('div', { className: 'zettelzeile' }, el('div', { className: 't' }, el('b', { textContent: T('Bei Ort nach vorn', 'Brought up at a place') }), ortInfo)),
      el('div', { className: 'leiste' }, ...knoepfe),
    ], { klasse: 'zettelblatt', beimSchliessen: () => zeigen() });
    infoAuffrischen();
    vorschauMalen();
  }

  // ---- Knöpfe -----------------------------------------------------------------------------------------------
  $('zettelNeu').onclick = neuOeffnen;
  $('zettelAlsText').onclick = () => {
    const box = $('zettelTextBox');
    box.hidden = !box.hidden;
    $('zettelAlsText').classList.toggle('an', !box.hidden);
  };
  zeigen();
  return { zeigen };
}
