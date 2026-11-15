// Der Zwilling: Soll-Zustand des Sticky in der App (Quelle der Wahrheit) plus Übertragung.
import { rahmenStart, rahmenDaten, rahmenEnde, rahmenKarte, rahmenWach, nutzlastFuer, crc32, rahmenSpeichern, rahmenBbIndex,
  rahmenRueck, rahmenHome, rahmenHomeVersion, rahmenTippen, rahmenModus, rahmenZeit, rahmenFahrtLayout, rahmenPufferListe, rahmenPufferHolen, rahmenPufferLoeschen,
  rahmenListe, rahmenHolen, rahmenLoeschen, rahmenLeeren, rahmenSchreibStart, rahmenSchreibDaten, rahmenSchreibEnde } from './protokoll.js';
import { Aufnahme, wav } from './audio.js';
import { T } from './uebersetzen.js';

/** PackBits entpacken: Kopf k < 128 → k + 1 Bytes wörtlich, k > 128 → nächstes Byte 257 − k mal */
export function entpacken(p, n) {
  const o = new Uint8Array(n);
  let i = 0, j = 0;
  while (i < p.length && j < n) {
    const k = p[i++];
    if (k < 128) { o.set(p.subarray(i, i + k + 1).subarray(0, n - j), j); i += k + 1; j += k + 1; }
    else if (k > 128) { o.fill(p[i++], j, Math.min(n, j + 257 - k)); j += 257 - k; }
  }
  if (j < n) throw new Error(T(`Bildschirm: unvollständig (${j}/${n} Byte)`, `Screen: incomplete (${j}/${n} bytes)`));
  return o;
}

export class Zwilling {
  constructor() {
    this.verbindung = null;
    this.geraet = {};        // letzter gemeldeter Ist-Zustand
    this.gesendetCrc = null; // CRC des Bildes, das der Sticky zuletzt bestätigt hat
    this.warteBild = null;
    this.beobachter = new Set();
  }

  beobachte(fn) { this.beobachter.add(fn); }
  #melde(art, daten) { for (const fn of this.beobachter) fn(art, daten); }

  anbinden(v) {
    this.verbindung = v;
    v.onZustand = (z) => { this.geraet = z; if (z.itvl) this.intervall = z.itvl; this.#melde('zustand', z); };
    v.onEreignis = (e) => {
      if (e.t === 'img' && this.warteBild) { this.warteBild(e); this.warteBild = null; }
      if (e.t === 'puffer' && this.wartePuffer) { this.wartePuffer(e); this.wartePuffer = null; }
      if ((e.t === 'liste' || e.t === 'geloescht' || e.t === 'abgleich') && this.warteAbgleich) { this.warteAbgleich(e); this.warteAbgleich = null; }
      if (e.t === 'geschrieben' && this.warteGeschrieben) { this.warteGeschrieben(e); this.warteGeschrieben = null; }
      if (e.t === 'itvl') { this.intervall = e.v; this.warteSchnell?.(); }
      if (e.t === 'key' && e.k === 'ki' && e.a === 'up') this.tLos = performance.now();
      if (e.t === 'audio' && e.a === 'start') {
        this.aufnahme = new Aufnahme();
        this.tLos = null;
        // Aufnahmezeit vom Sticky (Uhr), sonst Ankunft – zählt für Notiz, Dateiname und GPS-Entscheidung
        this.aufnahmeStart = e.ms > 1.7e12 ? e.ms : Date.now();
        this.aufnahmeZiel = e.ziel ?? null;   // „tippen“: der Text gehört an die Schreibmarke (FW ≥ 0.37.0)
        this.#melde('aufnahmeLaeuft', { start: this.aufnahmeStart });
      }
      // Recorder (FW ≥ 0.34.0): live nur, wenn der Sticky „live“ meldet; die Datei liegt ohnehin auf seiner Karte
      if (e.t === 'rec' && e.a === 'start') {
        this.aufnahme = e.live ? new Aufnahme() : null;
        this.rec = { datei: e.datei, start: e.ms > 1.7e12 ? e.ms : Date.now(), merker: [] };
        this.#melde('recorderLaeuft', this.rec);
      }
      if (e.t === 'rec' && e.a === 'merker' && this.rec) this.rec.merker.push(e.ms);
      if (e.t === 'rec' && e.a === 'stop') {
        const r = this.aufnahme && this.rec?.datei === e.datei ? this.aufnahme.ergebnis() : null;
        const rec = this.rec?.datei === e.datei ? this.rec : { datei: e.datei, start: Date.now() - (e.ms ?? 0), merker: [] };
        this.aufnahme = null;
        this.rec = null;
        // vollständig: live begonnen, kein Paket fehlt und alle, die der Sticky aufnahm, sind da
        const vollstaendig = !!(r && e.live && r.fehlend === 0 && r.pakete >= e.pakete);
        this.#melde('recorder', { ...(r ?? {}), datei: e.datei, start: rec.start, merker: e.merker ?? rec.merker, dauerMs: e.ms, vollstaendig });
      }
      if (e.t === 'audio' && e.a === 'stop' && this.aufnahme) {
        const r = this.aufnahme.ergebnis();
        this.aufnahme = null;
        const tStop = performance.now();
        this.#melde('aufnahme', { ...r, wav: wav(r.pcm), geraet: e, tLos: this.tLos ?? tStop, tStop, start: this.aufnahmeStart ?? Date.now(), ziel: this.aufnahmeZiel ?? null });
      }
      this.#melde('ereignis', e);
    };
    v.onAudio = (p) => this.aufnahme?.paket(p);
    v.onDatei = (p) => {
      // Stück: offset:u32 + Daten; nur das gerade erwartete annehmen
      const off = (p[0] | p[1] << 8 | p[2] << 16 | p[3] << 24) >>> 0;
      if (this.datei && off === this.datei.warte) this.datei.fertig(p.slice(4));
    };
    v.onGetrennt = () => this.#melde('getrennt');
    v.onLog = (t) => this.#melde('log', t);
  }

  get verbunden() { return !!this.verbindung?.verbunden; }

  /** Schickt ein 1-bpp-Bild; liefert Messwerte. Übertragungen laufen strikt nacheinander (Warteschlange). */
  sendeBild(bild, optionen = {}) {
    const lauf = (this.schlange ?? Promise.resolve()).catch(() => {}).then(() => this.#sende(bild, optionen));
    this.schlange = lauf;
    return lauf;
  }

  async #sende(bild, { schnell = false, fortschritt = () => {}, bereich = null, speichern = null, rueck = null, home = null } = {}) {
    const v = this.verbindung;
    const t0 = performance.now();
    const nutzlast = nutzlastFuer(v.mtu);
    const rahmen = rahmenDaten(bild, nutzlast);
    // BILD_START lässt den Sticky ein kurzes Verbindungsintervall anfordern. Erst wenn es greift, streamen –
    // im trägen Ruhetakt (180 ms) staut sich sonst alles und Android meldet „Write timeout“.
    const schnellDa = new Promise((ok) => {
      const fertig = () => { if ((this.intervall ?? 999) <= 16) { clearTimeout(zeit); this.warteSchnell = null; ok(true); } };
      const zeit = setTimeout(() => { this.warteSchnell = null; ok(false); }, 2500);
      this.warteSchnell = fertig;
      fertig();
    });
    await v.schreiben(rahmenStart(bild, bereich));
    // Kleine Teilbilder (Rückmeldung „✓ …“) gehen auch im Ruhetakt in wenigen Rahmen durch
    const warSchnell = bild.length > 4000 ? await schnellDa : false;
    const tStart = performance.now();
    let gesendet = 0;
    for (const r of rahmen) {
      await v.schreiben(r, true);
      gesendet += r.length - 5;
      fortschritt(gesendet / bild.length);
    }
    const tFunk = performance.now() - tStart;
    const antwort = new Promise((ok, fehler) => {
      const zeit = setTimeout(() => { this.warteBild = null; fehler(new Error(T('Sticky hat das Bild nicht bestätigt (20 s).', 'Sticky did not confirm the image (20 s).'))); }, 20000);
      this.warteBild = (e) => { clearTimeout(zeit); ok(e); };
    });
    await v.schreiben(speichern != null ? rahmenSpeichern(speichern) : rueck != null ? rahmenRueck(rueck) : home != null ? rahmenHome(home) : rahmenEnde(schnell));
    const e = await antwort;
    if (!e.ok) throw new Error(T(`Sticky meldet Fehler: ${e.err}${e.got != null ? ` (${e.got} Byte angekommen)` : ''}`, `Sticky reports error: ${e.err}${e.got != null ? ` (${e.got} bytes arrived)` : ''}`));
    if (!bereich && speichern == null && rueck == null && home == null) this.gesendetCrc = crc32(bild);
    return {
      gesamt: Math.round(performance.now() - t0),
      funk: Math.round(tFunk),
      anlauf: Math.round(tStart - t0),
      warSchnell,
      dle: e.dle,
      empfang: e.ms,
      anzeige: e.show,
      rahmen: rahmen.length,
      nutzlast,
      mtu: e.mtu ?? v.mtu,
      phy: e.phy,
    };
  }

  async zeigeKarte() { await this.verbindung.schreiben(rahmenKarte()); this.gesendetCrc = null; }
  /** Sticky piept, bis eine Taste kommt (FW ≥ 0.25.0) */
  async suchen(sekunden = 30) { await this.verbindung.schreiben(new Uint8Array([0x30, sekunden])); }
  async wach() { await this.verbindung.schreiben(rahmenWach()); }
  async homeVersion(text) { await this.verbindung.schreiben(rahmenHomeVersion(text)); }
  /** Diktat-Text an die Schreibmarke der Tippen-Seite (FW ≥ 0.37.0) */
  async tippen(text) { await this.verbindung.schreiben(rahmenTippen(text)); }
  async modusSetzen(m, seite = null) { await this.verbindung.schreiben(rahmenModus(m, seite)); }
  async zeitSetzen() { await this.verbindung.schreiben(rahmenZeit()); }
  async fahrtLayout(text) { await this.verbindung.schreiben(rahmenFahrtLayout(text)); }

  /** Liste der gepufferten Dateien auf dem Sticky: [{ n, b }] */
  async pufferListe() {
    const e = await new Promise((ok, fehler) => {
      const zeit = setTimeout(() => { this.wartePuffer = null; fehler(new Error(T('Sticky antwortet nicht auf die Puffer-Liste', 'Sticky does not answer the buffer list request'))); }, 5000);
      this.wartePuffer = (x) => { clearTimeout(zeit); ok(x); };
      this.verbindung.schreiben(rahmenPufferListe()).catch(fehler);
    });
    return e.dateien ?? [];
  }

  /** Eine Puffer-Datei Stück für Stück abholen (Anfrage → Antwort, bei Verlust wiederholen) → Uint8Array */
  pufferHolen(name, groesse) { return this.#stueckweise(name, (off) => rahmenPufferHolen(name, off), groesse); }

  /** Datei-Abgleich: Inhalt eines Ordners unter /ist → [{ n, b, ordner? }] */
  async liste(pfad) {
    const alle = [];
    for (let seite = 0; seite < 100; seite++) {
      // Passt nicht alles in ein Paket, blättert „pfad|ab“ weiter (FW ≥ 0.11.0)
      const e = await this.#abgleich(rahmenListe(alle.length ? `${pfad}|${alle.length}` : pfad), `${T('Liste', 'List')} ${pfad}`);
      if (e.t !== 'liste') throw new Error(`${pfad}: ${e.err ?? T('abgelehnt', 'rejected')}`);
      alle.push(...(e.d ?? []));
      if (!e.mehr || !e.d?.length) break;
    }
    return alle;
  }
  /** Datei ab Byte `ab` bis `groesse` holen → Uint8Array (nur der neue Teil) */
  /** Bildschirmfoto (FW ≥ 0.31.3): das gerade gezeigte Bild, 800 × 480, 1 bpp, PackBits-gepackt übertragen */
  async bildschirm() {
    const pfad = '/ist/bildschirm.rle';
    const gepackt = await this.#nacheinander(() => this.#stueckweiseJetzt('Bildschirm', (off) => rahmenHolen(pfad, off), 49000, 0, true));
    return entpacken(gepackt, 48000);
  }

  holen(pfad, groesse, ab = 0) { return this.#stueckweise(pfad, (off) => rahmenHolen(pfad, off), groesse, ab); }
  /** Sticky für die Weitergabe leeren (FW ≥ 0.31.6): wartet auf {"t":"geleert"} oder höchstens 30 s */
  leeren() {
    return new Promise((ok, fehler) => {
      const zeit = setTimeout(() => { this.beobachter.delete(hoer); fehler(new Error(T('Sticky hat das Leeren nicht bestätigt', 'Sticky did not confirm the wipe'))); }, 30000);
      const hoer = (art, d) => { if (art === 'ereignis' && d.t === 'geleert') { clearTimeout(zeit); this.beobachter.delete(hoer); ok(d); } };
      this.beobachte(hoer);
      this.verbindung.schreiben(rahmenLeeren()).catch((e) => { clearTimeout(zeit); this.beobachter.delete(hoer); fehler(e); });
    });
  }

  async loeschen(pfad) {
    const e = await this.#abgleich(rahmenLoeschen(pfad), `${T('Löschen', 'Delete')} ${pfad}`);
    return e.ok === true;
  }
  /** Datei unter /soll schreiben (bis 1 MB). Läuft in derselben Schlange wie die Bilder. */
  schreibeDatei(pfad, daten) {
    const lauf = (this.schlange ?? Promise.resolve()).catch(() => {}).then(() => this.#schreibe(pfad, daten));
    this.schlange = lauf;
    return lauf;
  }
  async #schreibe(pfad, daten) {
    const v = this.verbindung;
    const schnellDa = new Promise((ok) => {
      const fertig = () => { if ((this.intervall ?? 999) <= 16) { clearTimeout(zeit); this.warteSchnell = null; ok(true); } };
      const zeit = setTimeout(() => { this.warteSchnell = null; ok(false); }, 2500);
      this.warteSchnell = fertig;
      fertig();
    });
    // Antwort schon vor dem Start erwarten: einen falschen Pfad oder zu große Datei lehnt der Sticky sofort ab
    let frueh = null;
    const antwort = new Promise((ok, fehler) => {
      const zeit = setTimeout(() => { this.warteGeschrieben = null; fehler(new Error(T(`${pfad}: keine Bestätigung (20 s)`, `${pfad}: no confirmation (20 s)`))); }, 20000);
      this.warteGeschrieben = (e) => { clearTimeout(zeit); frueh = e; ok(e); };
    });
    await v.schreiben(rahmenSchreibStart(daten, pfad));
    if (daten.length > 4000) await schnellDa;
    for (const r of rahmenSchreibDaten(daten, nutzlastFuer(v.mtu))) { if (frueh) break; await v.schreiben(r, true); }
    if (!frueh) await v.schreiben(rahmenSchreibEnde());
    const e = await antwort;
    if (!e.ok) throw new Error(`${pfad}: ${e.err}`);
    return e;
  }

  /**
   * Soll-Ordner abgleichen: `dateien` = [{ n, daten }] in der gewünschten Reihenfolge (Auslöser wie version.txt zuletzt).
   * Der Sticky führt /soll/<ordner>/stand.txt („name crc“ je Zeile) als Bestandsliste; geschrieben wird nur, was sich
   * unterscheidet, Überzähliges wird gelöscht, stand.txt kommt zum Schluss. → Anzahl geschriebener Dateien
   */
  async sollAbgleich(ordner, dateien, fortschritt = () => {}) {
    const basis = `/soll/${ordner}`;
    const liste = await this.liste(basis).catch(() => []);
    const standDatei = liste.find((d) => d.n === 'stand.txt');
    const alt = {};
    if (standDatei?.b) {
      const text = new TextDecoder().decode(await this.holen(`${basis}/stand.txt`, standDatei.b));
      for (const z of text.split('\n')) { const [n, c] = z.trim().split(' '); if (n && c) alt[n] = c; }
    }
    const vorhanden = new Set(liste.map((d) => d.n));
    const neu = dateien.map((d) => ({ ...d, crc: crc32(d.daten).toString(16).padStart(8, '0') }));
    const zuSchreiben = neu.filter((d) => alt[d.n] !== d.crc || !vorhanden.has(d.n));
    let i = 0;
    for (const d of zuSchreiben) {
      fortschritt(++i, zuSchreiben.length, d.n);
      await this.schreibeDatei(`${basis}/${d.n}`, d.daten);
    }
    const namen = new Set(neu.map((d) => d.n));
    for (const d of liste) if (!d.ordner && d.n !== 'stand.txt' && !namen.has(d.n)) await this.loeschen(`${basis}/${d.n}`);
    if (zuSchreiben.length || Object.keys(alt).length !== neu.length) {
      await this.schreibeDatei(`${basis}/stand.txt`, new TextEncoder().encode(neu.map((d) => `${d.n} ${d.crc}`).join('\n') + '\n'));
    }
    return zuSchreiben.length;
  }

  /** Anfragen mit Antwort (LISTE, LOESCHEN, HOLEN) nacheinander: es gibt je nur einen Wartenden */
  #nacheinander(fn) {
    const lauf = (this.abgSchlange ?? Promise.resolve()).catch(() => {}).then(fn);
    this.abgSchlange = lauf;
    return lauf;
  }

  #abgleich(rahmen, was) {
    return this.#nacheinander(() => new Promise((ok, fehler) => {
      const zeit = setTimeout(() => { this.warteAbgleich = null; fehler(new Error(T(`Sticky antwortet nicht (${was})`, `Sticky does not answer (${was})`))); }, 5000);
      this.warteAbgleich = (x) => { clearTimeout(zeit); ok(x); };
      this.verbindung.schreiben(rahmen).catch(fehler);
    }));
  }

  #stueckweise(name, anfrage, groesse, ab = 0) { return this.#nacheinander(() => this.#stueckweiseJetzt(name, anfrage, groesse, ab)); }
  async #stueckweiseJetzt(name, anfrage, groesse, ab = 0, bisEnde = false) {
    const daten = new Uint8Array(Math.max(0, groesse - ab));
    await this.verbindung.schnell();
    let off = ab;
    while (off < groesse) {
      let stueck = null;
      for (let versuch = 0; versuch < 4 && !stueck; versuch++) {
        stueck = await new Promise((ok) => {
          const zeit = setTimeout(() => { this.datei = null; ok(null); }, 1500);
          this.datei = { warte: off, fertig: (p) => { clearTimeout(zeit); this.datei = null; ok(p); } };
          this.verbindung.schreiben(anfrage(off)).catch(() => ok(null));
        });
      }
      if (!stueck) throw new Error(T(`${name}: bei Byte ${off} keine Antwort`, `${name}: no answer at byte ${off}`));
      if (!stueck.length) break;   // Ende der Datei
      daten.set(stueck.subarray(0, Math.min(stueck.length, groesse - off)), off - ab);
      off += stueck.length;
    }
    if (bisEnde) return daten.subarray(0, off - ab);   // Länge vorher unbekannt: bis zum leeren Stück
    if (off < groesse) throw new Error(T(`${name}: unvollständig (${off}/${groesse} Byte)`, `${name}: incomplete (${off}/${groesse} bytes)`));
    return daten;
  }

  async pufferLoeschen(name) { await this.verbindung.schreiben(rahmenPufferLoeschen(name)); }
  async bordbuchIndex(text) { await this.verbindung.schreiben(rahmenBbIndex(text)); }
}
