// Der Zwilling: Soll-Zustand des Sticky in der App (Quelle der Wahrheit) plus Übertragung.
import { rahmenStart, rahmenDaten, rahmenEnde, rahmenKarte, rahmenPing, nutzlastFuer, crc32 } from './protokoll.js';
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
      if (e.t === 'itvl') { this.intervall = e.v; this.warteSchnell?.(); }
      if (e.t === 'key' && e.k === 'ki' && e.a === 'up') this.tLos = performance.now();
      if (e.t === 'audio' && e.a === 'start') { this.aufnahme = new Aufnahme(); this.tLos = null; this.#melde('aufnahmeLaeuft'); }
      if (e.t === 'audio' && e.a === 'stop' && this.aufnahme) {
        const r = this.aufnahme.ergebnis();
        this.aufnahme = null;
        const tStop = performance.now();
        this.#melde('aufnahme', { ...r, wav: wav(r.pcm), geraet: e, tLos: this.tLos ?? tStop, tStop });
      }
      this.#melde('ereignis', e);
    };
    v.onAudio = (p) => this.aufnahme?.paket(p);
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

  async #sende(bild, { schnell = false, fortschritt = () => {}, bereich = null } = {}) {
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
    await v.schreiben(rahmenEnde(schnell));
    const e = await antwort;
    if (!e.ok) throw new Error(`Sticky meldet Fehler: ${e.err}${e.got != null ? ` (${e.got} Byte angekommen)` : ''}`);
    if (!bereich) this.gesendetCrc = crc32(bild);
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
}
