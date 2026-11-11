// Der Zwilling: Soll-Zustand des Sticky in der App (Quelle der Wahrheit) plus Übertragung.
import { rahmenStart, rahmenDaten, rahmenEnde, rahmenKarte, rahmenPing, nutzlastFuer, crc32, rahmenSpeichern, rahmenBbIndex, rahmenBbModus,
  rahmenRueck, rahmenHome, rahmenHomeVersion, rahmenModus, rahmenZeit, rahmenFahrtLayout, rahmenPufferListe, rahmenPufferHolen, rahmenPufferLoeschen } from './protokoll.js';
import { Aufnahme, wav } from './audio.js';

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
      if (e.t === 'itvl') { this.intervall = e.v; this.warteSchnell?.(); }
      if (e.t === 'key' && e.k === 'ki' && e.a === 'up') this.tLos = performance.now();
      if (e.t === 'audio' && e.a === 'start') {
        this.aufnahme = new Aufnahme();
        this.tLos = null;
        // Aufnahmezeit vom Sticky (Uhr), sonst Ankunft – zählt für Notiz, Dateiname und GPS-Entscheidung
        this.aufnahmeStart = e.ms > 1.7e12 ? e.ms : Date.now();
        this.#melde('aufnahmeLaeuft', { start: this.aufnahmeStart });
      }
      if (e.t === 'audio' && e.a === 'stop' && this.aufnahme) {
        const r = this.aufnahme.ergebnis();
        this.aufnahme = null;
        const tStop = performance.now();
        this.#melde('aufnahme', { ...r, wav: wav(r.pcm), geraet: e, tLos: this.tLos ?? tStop, tStop, start: this.aufnahmeStart ?? Date.now() });
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
      const zeit = setTimeout(() => { this.warteBild = null; fehler(new Error('Sticky hat das Bild nicht bestätigt (20 s).')); }, 20000);
      this.warteBild = (e) => { clearTimeout(zeit); ok(e); };
    });
    await v.schreiben(speichern != null ? rahmenSpeichern(speichern) : rueck != null ? rahmenRueck(rueck) : home != null ? rahmenHome(home) : rahmenEnde(schnell));
    const e = await antwort;
    if (!e.ok) throw new Error(`Sticky meldet Fehler: ${e.err}${e.got != null ? ` (${e.got} Byte angekommen)` : ''}`);
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
  async ping() { await this.verbindung.schreiben(rahmenPing()); }
  async homeVersion(text) { await this.verbindung.schreiben(rahmenHomeVersion(text)); }
  async modusSetzen(m, seite = null) { await this.verbindung.schreiben(rahmenModus(m, seite)); }
  async zeitSetzen() { await this.verbindung.schreiben(rahmenZeit()); }
  async fahrtLayout(text) { await this.verbindung.schreiben(rahmenFahrtLayout(text)); }

  /** Liste der gepufferten Dateien auf dem Sticky: [{ n, b }] */
  async pufferListe() {
    const e = await new Promise((ok, fehler) => {
      const zeit = setTimeout(() => { this.wartePuffer = null; fehler(new Error('Sticky antwortet nicht auf die Puffer-Liste')); }, 5000);
      this.wartePuffer = (x) => { clearTimeout(zeit); ok(x); };
      this.verbindung.schreiben(rahmenPufferListe()).catch(fehler);
    });
    return e.dateien ?? [];
  }

  /** Eine Puffer-Datei Stück für Stück abholen (Anfrage → Antwort, bei Verlust wiederholen) → Uint8Array */
  async pufferHolen(name, groesse) {
    const daten = new Uint8Array(groesse);
    await this.verbindung.schnell();
    let off = 0;
    while (off < groesse) {
      let stueck = null;
      for (let versuch = 0; versuch < 4 && !stueck; versuch++) {
        stueck = await new Promise((ok) => {
          const zeit = setTimeout(() => { this.datei = null; ok(null); }, 1500);
          this.datei = { warte: off, fertig: (p) => { clearTimeout(zeit); this.datei = null; ok(p); } };
          this.verbindung.schreiben(rahmenPufferHolen(name, off)).catch(() => ok(null));
        });
      }
      if (!stueck) throw new Error(`${name}: bei Byte ${off} keine Antwort`);
      if (!stueck.length) break;   // Ende der Datei
      daten.set(stueck.subarray(0, Math.min(stueck.length, groesse - off)), off);
      off += stueck.length;
    }
    if (off < groesse) throw new Error(`${name}: unvollständig (${off}/${groesse} Byte)`);
    return daten;
  }

  async pufferLoeschen(name) { await this.verbindung.schreiben(rahmenPufferLoeschen(name)); }
  async bordbuchIndex(text) { await this.verbindung.schreiben(rahmenBbIndex(text)); }
  async bordbuchModus(an, seite = null) { await this.verbindung.schreiben(rahmenBbModus(an, seite)); }
}
