// Zwei Wege zum Sticky mit gleicher Schnittstelle: echtes BLE (Capacitor-Plugin, im Browser Web Bluetooth)
// und ein Simulator, der die Firmware nachspielt (Entwickeln im Browser ohne Gerät).
import { BleClient, ConnectionPriority, ScanMode } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';
import { UUID, BILD_BYTES, BREITE, HOEHE, crc32, lies } from './protokoll.js';
import { kodiere, SAMPLES_JE_PAKET, RATE } from './audio.js';

const dv = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
const text = (view) => new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
const SPEICHER_ID = 'sticky.geraet';

class Basis {
  constructor() {
    this.mtu = 23;
    this.name = '';
    this.onEreignis = () => {};
    this.onZustand = () => {};
    this.onGetrennt = () => {};
    this.onLog = () => {};
    this.onAudio = () => {};
  }
}

export class BleVerbindung extends Basis {
  constructor() {
    super();
    this.id = null;
    this.nativ = Capacitor.isNativePlatform();
    this.bereit = false;
  }

  async init() {
    if (this.bereit) return;
    await BleClient.initialize({ androidNeverForLocation: true });
    this.bereit = true;
  }

  /** Sucht den Sticky (Android: kurzer Scan ohne Auswahl-Dialog; Browser: Web-Bluetooth-Auswahl). */
  async suchen() {
    await this.init();
    if (!this.nativ) {
      const g = await BleClient.requestDevice({ services: [UUID.dienst], namePrefix: 'Sticky' });
      return { id: g.deviceId, name: g.name || 'Sticky' };
    }
    return new Promise((ok, fehler) => {
      let fertig = false;
      const ende = async (wert, err) => {
        if (fertig) return;
        fertig = true;
        clearTimeout(zeit);
        await BleClient.stopLEScan().catch(() => {});
        err ? fehler(err) : ok(wert);
      };
      const zeit = setTimeout(() => ende(null, new Error('Kein Sticky gefunden (10 s gesucht). Ist er wach? Eine Taste drücken.')), 10000);
      BleClient.requestLEScan({ services: [UUID.dienst], scanMode: ScanMode.SCAN_MODE_LOW_LATENCY }, (r) => {
        ende({ id: r.device.deviceId, name: r.device.name || r.localName || 'Sticky' });
      }).catch((e) => ende(null, e));
    });
  }

  async verbinden() {
    await this.init();
    let gemerkt = null;
    try { gemerkt = JSON.parse(localStorage.getItem(SPEICHER_ID) || 'null'); } catch { /* egal */ }
    let geraet = null;
    if (gemerkt && this.nativ) {
      try {
        await this.#verbindeMit(gemerkt);
        return;
      } catch (e) {
        this.onLog(`Gemerkter Sticky nicht erreichbar (${e.message}), suche neu …`);
      }
    }
    geraet = await this.suchen();
    await this.#verbindeMit(geraet);
    try { localStorage.setItem(SPEICHER_ID, JSON.stringify(geraet)); } catch { /* egal */ }
  }

  async #verbindeMit(g) {
    this.onLog(`Verbinde mit ${g.name} …`);
    await BleClient.connect(g.id, () => { this.id = null; this.onGetrennt(); }, { timeout: 8000 });
    this.id = g.id;
    this.name = g.name;
    if (this.nativ) {
      try { this.mtu = await BleClient.getMtu(g.id); } catch { this.mtu = 23; }
    } else {
      this.mtu = 23 + 0; // Web Bluetooth verrät die MTU nicht; Chrome handelt meist 517 aus, sicher ist 23
    }
    await BleClient.startNotifications(g.id, UUID.dienst, UUID.ereignis, (v) => this.#json(v, this.onEreignis));
    await BleClient.startNotifications(g.id, UUID.dienst, UUID.zustand, (v) => this.#json(v, this.onZustand));
    await BleClient.startNotifications(g.id, UUID.dienst, UUID.audio, (v) => this.onAudio(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)))
      .catch((e) => this.onLog(`Audio nicht verfügbar (alte Firmware?): ${e.message}`));
    const z = await BleClient.read(g.id, UUID.dienst, UUID.zustand);
    this.#json(z, this.onZustand);
  }

  #json(view, ziel) {
    const t = text(view);
    try { ziel(JSON.parse(t)); } catch { this.onLog(`Unlesbar: ${t}`); }
  }

  get verbunden() { return !!this.id; }

  async trennen() {
    if (this.id) await BleClient.disconnect(this.id).catch(() => {});
    this.id = null;
  }

  async schnell() {
    if (this.nativ && this.id) await BleClient.requestConnectionPriority(this.id, ConnectionPriority.CONNECTION_PRIORITY_HIGH).catch(() => {});
  }

  async schreiben(rahmen, ohneAntwort = false) {
    const opt = { timeout: 20000 }; // Standard 5 s ist zu knapp, wenn der Funk kurz zäh ist
    if (ohneAntwort) await BleClient.writeWithoutResponse(this.id, UUID.dienst, UUID.befehl, dv(rahmen), opt);
    else await BleClient.write(this.id, UUID.dienst, UUID.befehl, dv(rahmen), opt);
  }
}

/** Spielt die Firmware nach: gleiche Rahmen, gleiche JSON-Antworten. */
export class SimVerbindung extends Basis {
  constructor() {
    super();
    this.name = 'Sticky-SIM';
    this.mtu = 247;
    this.verbunden = false;
    this.puffer = new Uint8Array(BILD_BYTES);
    this.erwartet = null;
    this.t0 = 0;
    this.seite = 'karte';
    this.bild = null; // was der simulierte Sticky gerade zeigt (1 bpp)
  }

  async verbinden() {
    await warte(400);
    this.verbunden = true;
    this.#zustand();
  }

  async trennen() { this.verbunden = false; this.onGetrennt(); }
  async schnell() {}

  #zustand() {
    this.onZustand({ fw: 'sim', seite: this.seite, bat: 87, mv: 3990, ma: -12, chg: false, mtu: this.mtu, phy: 2, itvl: 128, tp: `${BREITE}x${HOEHE}` });
  }

  async schreiben(rahmen) {
    await warte(2); // grob wie ein BLE-Rahmen bei 7,5 ms Intervall und mehreren Paketen pro Ereignis
    const r = lies(rahmen);
    if (r.op === 'start') {
      this.erwartet = r;
      this.erwartetTeil = r.breite !== BREITE || r.hoehe !== HOEHE;
      this.t0 = performance.now();
      this.puffer = new Uint8Array(r.laenge);
      setTimeout(() => this.onEreignis({ t: 'itvl', v: 6, lat: 0 }), 150);
    } else if (r.op === 'daten' && this.erwartet) {
      this.puffer.set(r.daten, r.offset);
    } else if (r.op === 'ende' && this.erwartet) {
      const ms = Math.round(performance.now() - this.t0);
      const ok = crc32(this.puffer) === this.erwartet.crc;
      if (r.speichern != null) {
        this.erwartet = null;
        (this.bbSeiten ??= [])[r.speichern] = this.puffer.slice();
        this.onEreignis({ t: 'img', ok, gespeichert: r.speichern, ms });
        return;
      }
      this.erwartet = null;
      await warte(r.schnell ? 400 : 1500); // E-Paper-Refresh
      if (ok && this.erwartetTeil) { /* Teilbild: der Simulator merkt sich nur die ganze Seite */ }
      else if (ok) { this.bild = this.puffer.slice(); this.seite = 'bild'; }
      this.onEreignis(ok ? { t: 'img', ok: true, ms, show: r.schnell ? 400 : 1500, mtu: this.mtu, phy: 2 } : { t: 'img', ok: false, err: 'crc' });
      this.#zustand();
    } else if (r.op === 'ping') {
      this.onEreignis({ t: 'pong' });
      this.#zustand();
    } else if (r.op === 'bbIndex') {
      this.bbAnzahl = +(r.text.match(/seiten=(\d+)/)?.[1] ?? 0);
      this.onEreignis({ t: 'bordbuch', seiten: this.bbAnzahl, belegtKB: this.bbAnzahl * 47 });
    } else if (r.op === 'bbModus') {
      this.onEreignis({ t: 'modus', m: r.an ? 'bordbuch' : 'fahrt' });
      if (r.an) this.onEreignis({ t: 'seite', n: r.seite ?? 0, von: this.bbAnzahl ?? 0 });
    } else if (r.op === 'karte') {
      this.seite = 'karte';
      this.bild = null;
      this.#zustand();
    }
  }

  // Bedienelemente des simulierten Geräts: KI halten = Aufnahme (Ton mit Vibrato, ~1 % Paketverlust)
  tasteRunter(k) {
    if (!this.verbunden) return;
    this.onEreignis({ t: 'key', k, a: 'down' });
    if (k !== 'ki') return;
    this.onEreignis({ t: 'audio', a: 'start', rate: RATE, codec: 'ima-adpcm', n: SAMPLES_JE_PAKET });
    const z = { pred: 0, index: 0 };
    let seq = 0, verworfen = 0;
    const t0 = performance.now();
    this.sim = setInterval(() => {
      const pcm = Int16Array.from({ length: SAMPLES_JE_PAKET }, (_, i) => {
        const t = (seq * SAMPLES_JE_PAKET + i) / RATE;
        return Math.round(6000 * Math.sin(2 * Math.PI * (330 + 30 * Math.sin(2 * Math.PI * 5 * t)) * t));
      });
      const p = kodiere(pcm, seq++, z);
      if (Math.random() < 0.01) verworfen++; else this.onAudio(p);
    }, 30);
    this.simStopp = () => {
      clearInterval(this.sim);
      this.onEreignis({ t: 'audio', a: 'stop', pakete: seq - verworfen, verworfen: 0, ms: Math.round(performance.now() - t0), spitze: 6000 });
    };
  }
  tasteHoch(k) {
    if (!this.verbunden) return;
    this.onEreignis({ t: 'key', k, a: 'up' });
    if (k === 'ki' && this.simStopp) { this.simStopp(); this.simStopp = null; }
  }
  touch(x, y) {
    if (!this.verbunden) return;
    this.onEreignis({ t: 'touch', a: 'down', x, y });
    setTimeout(() => this.onEreignis({ t: 'touch', a: 'up', x, y }), 100);
  }
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
