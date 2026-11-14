// Burgduell lite (Markus, 14.11.2026): Artillerie-Duell zweier Burgen als App-Seite auf dem Sticky. Hommage an die
// Burgen-Duelle der Atari-ST-Zeit, eigene Grafik und eigene Regeln; Vorlage ist Markus' Artefakt „Burgduell“.
// E-Paper-gerecht: keine Flug-Animation – jeder Schuss wird sofort durchgerechnet und als gepunktete Bahn mit Krater
// gezeigt, ein Bild pro Zug. Lite: kein Laden, kein Gold; je Burg zwei Kanonen und ein König, dazu Wind.
// Gegner: Computer (rechnet in der App) oder ein zweiter Mensch am selben Sticky.
import { braunKnopf, BRAUN_FONT } from './braun.js';

const FONT = BRAUN_FONT;
const G = 0.12, WK = 0.012, R = 11;
const rnd = (a, b) => a + Math.random() * (b - a);
const klemme = (v, a, b) => Math.max(a, Math.min(b, v));

/** Maße je Lage (logisch): Feld und Tastenleiste; oben bleiben Reiter und Statuszeile frei */
export function burgMasse(hoch) {
  return hoch
    ? { feld: { x: 0, y: 104, w: 480, h: 512 }, tasten: { x: 8, y: 622, w: 464, h: 170, zeilen: 2 } }
    : { feld: { x: 0, y: 64, w: 800, h: 336 }, tasten: { x: 8, y: 404, w: 784, h: 72, zeilen: 1 } };
}
const TASTEN = [
  { id: 'w-', text: '◀ Winkel' }, { id: 'w+', text: 'Winkel ▶' }, { id: 'p-', text: 'Pulver −' },
  { id: 'p+', text: 'Pulver +' }, { id: 'feuer', text: 'FEUER', rolle: 'haupt' }, { id: 'neu', text: 'Neu' },
];

export class Burgduell {
  constructor(hoch = false) { this.neu(hoch, true); }

  /** Duell auf zwei Stickys (Markus, 14.11.2026): West spielt am aktiven, Ost am Hintergrund-Sticky; namen = [West, Ost] */
  duell(namen) { this.zweiSticky = true; this.namen = namen; this.neu(this.hoch, false); this.text = `Duell auf zwei Stickys: ${namen[0]} gegen ${namen[1]}. ${namen[0]} beginnt.`; }
  /** Computer gegen Computer (14.11.2026): beide Seiten mit demselben Computer-Spieler, wer beginnt, entscheidet ein Münzwurf */
  maschinenDuell() {
    this.cpuBeide = true;
    this.neu(this.hoch, false);
    this.zug = Math.random() < 0.5 ? 0 : 1;
    this.text = `Computer gegen Computer: ${this.p[this.zug].name} beginnt (Münzwurf).`;
  }
  /** zurück zu einem Sticky gegen den Computer */
  solo() { if (!this.zweiSticky) return; this.zweiSticky = false; this.namen = null; this.neu(this.hoch, true); this.text = 'Wieder gegen den Computer. West beginnt.'; }

  /** Neues Spiel in der Feldgröße der Lage; gegnerCpu bleibt, wie er war */
  neu(hoch = this.hoch, cpu = this.cpu ?? true) {
    this.hoch = hoch;
    const { feld } = burgMasse(hoch);
    const W = this.W = feld.w, H = this.H = feld.h;
    this.vs = Math.sqrt(W / 640);   // Reichweite ~ v²: so reicht dasselbe Pulver über das ganze Feld
    const mat = this.mat = new Uint8Array(W * H);
    const ph = [rnd(0, 7), rnd(0, 7), rnd(0, 7)], peak = rnd(0.18, 0.36) * H, px = W / 2 + rnd(-W / 14, W / 14);
    const h = [];
    for (let x = 0; x < W; x++) h[x] = 0.78 * H + 0.04 * H * Math.sin(x / 57 + ph[0]) + 0.02 * H * Math.sin(x / 23 + ph[1]) - peak * Math.exp(-(((x - px) / (W / 8)) ** 2));
    const rand = Math.round(W * 0.16);
    const cs = [Math.round(rnd(rand * 0.85, rand * 1.15)), W - Math.round(rnd(rand * 0.85, rand * 1.15))];
    const fys = cs.map((c) => { let s = 0; for (let x = c - 52; x <= c + 52; x++) s += h[klemme(x, 0, W - 1)]; return Math.round(s / 105 - rnd(4, 16)); });
    cs.forEach((c, i) => {
      const fy = fys[i];
      for (let x = Math.max(0, c - 80); x <= Math.min(W - 1, c + 80); x++) {
        const d = Math.abs(x - c);
        if (d <= 52) h[x] = fy; else { let t = (d - 52) / 28; t = t * t * (3 - 2 * t); h[x] = fy * (1 - t) + h[x] * t; }
      }
    });
    for (let x = 0; x < W; x++) for (let y = Math.max(0, Math.round(h[x])); y < H; y++) mat[y * W + x] = 1;
    cs.forEach((c, i) => this.#burg(c, fys[i]));
    this.p = cs.map((c, i) => ({
      name: this.namen?.[i] ?? (i ? 'Ost' : 'West'), c, dir: i ? -1 : 1, winkel: 45, pulver: 20, sel: 0, schuesse: 0,
      koenig: { x: c, y: fys[i], lebt: true }, kanonen: [-40, 40].map((o) => ({ x: c + o, y: this.#oben(c + o), lebt: true })),
    }));
    this.cpu = cpu;
    this.zug = 0;
    this.wind = rnd(-0.6, 0.6);
    this.bahn = null;
    this.krater = null;
    this.vorbei = false;
    this.text = `${this.p[0].name} beginnt: Winkel und Pulver einstellen, dann FEUER.`;
  }

  /** Darf dieser Spieler (0 = aktiver Sticky, 1 = Hintergrund-Sticky) gerade etwas tun? */
  #darf(spieler) {
    if (this.vorbei) return false;
    if (this.cpuBeide) return false;
    if (this.zweiSticky) return spieler === this.zug;
    return spieler === 0 && !(this.cpu && this.zug === 1);
  }

  #rechteck(x0, y0, x1, y1, v) { for (let y = Math.max(0, y0); y <= Math.min(this.H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.W - 1, x1); x++) this.mat[y * this.W + x] = v; }
  #zinnen(x0, x1, y) { for (let x = x0; x <= x1; x++) if (((x - x0) >> 2) % 2 === 0) for (let yy = y - 4; yy < y; yy++) if (yy >= 0 && x >= 0 && x < this.W) this.mat[yy * this.W + x] = 2; }
  #burg(c, fy) {
    this.#rechteck(c - 44, fy - 36, c + 44, fy - 1, 2); this.#zinnen(c - 44, c + 44, fy - 36);
    this.#rechteck(c - 48, fy - 62, c - 32, fy - 1, 2); this.#zinnen(c - 48, c - 32, fy - 62);
    this.#rechteck(c + 32, fy - 62, c + 48, fy - 1, 2); this.#zinnen(c + 32, c + 48, fy - 62);
    this.#rechteck(c - 12, fy - 50, c + 12, fy - 1, 2); this.#zinnen(c - 12, c + 12, fy - 50);
    this.#rechteck(c - 5, fy - 15, c + 5, fy - 1, 0);   // Thronsaal
    for (const wx of [c - 41, c + 39]) { this.#rechteck(wx, fy - 52, wx + 1, fy - 47, 0); this.#rechteck(wx, fy - 32, wx + 1, fy - 27, 0); }
  }
  #oben(x) { for (let y = 0; y < this.H; y++) if (this.mat[y * this.W + x]) return y; return this.H; }
  #fest(x, y) { return x >= 0 && x < this.W && y >= 0 && y < this.H && this.mat[y * this.W + x] !== 0; }
  #lebende(p) { return p.kanonen.map((k, i) => (k.lebt ? i : -1)).filter((i) => i >= 0); }
  #kanone(p) { const k = p.kanonen[p.sel]; return k?.lebt ? k : null; }

  #start(k, winkel, pulver, dir) {
    const a = (winkel * Math.PI) / 180, v = pulver * 0.32 * this.vs;
    return { x: k.x + dir * Math.cos(a) * 8, y: k.y - 5 - Math.sin(a) * 8, vx: dir * Math.cos(a) * v, vy: -Math.sin(a) * v, weg: 0 };
  }
  /** einen Schritt weiter; → null (fliegt) | { art: 'raus'|'treffer', x, y, ziel? } */
  #schritt(s, ziele) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(s.vx), Math.abs(s.vy))));
    for (let i = 0; i < n; i++) {
      s.x += s.vx / n; s.y += s.vy / n; s.weg++;
      const xi = Math.round(s.x), yi = Math.round(s.y);
      if (xi < 0 || xi >= this.W || yi >= this.H) return { art: 'raus', x: xi, y: yi };
      if (yi < 0 || s.weg <= 6) continue;
      if (this.mat[yi * this.W + xi]) return { art: 'treffer', x: xi, y: yi };
      if (ziele) for (const e of ziele) if (xi >= e.x0 && xi <= e.x1 && yi >= e.y0 && yi <= e.y1) return { art: 'treffer', x: xi, y: yi, ziel: e };
    }
    s.vx += this.wind * WK; s.vy += G;
    return null;
  }
  #ziele() {
    const a = [];
    this.p.forEach((p) => {
      p.kanonen.forEach((k) => { if (k.lebt) a.push({ x0: k.x - 4, x1: k.x + 4, y0: k.y - 7, y1: k.y - 1 }); });
      const K = p.koenig; if (K.lebt) a.push({ x0: K.x - 4, x1: K.x + 4, y0: K.y - 13, y1: K.y - 1 });
    });
    return a;
  }

  /** Schuss des Spielers am Zug, sofort ganz durchgerechnet */
  feuer() {
    if (this.vorbei) return;
    const p = this.p[this.zug], k = this.#kanone(p);
    if (!k) { this.text = `${p.name} hat keine Kanone mehr.`; this.#weiter(''); return; }
    p.schuesse++;
    const s = this.#start(k, p.winkel, p.pulver, p.dir), bahn = [];
    let r = null;
    for (let n = 0; !r && n < 3000; n++) { r = this.#schritt(s, this.#ziele()); bahn.push([s.x, s.y]); }
    this.bahn = bahn;
    this.krater = null;
    if (r?.art === 'treffer') this.#explodiere(r.x, r.y, p.name);
    else this.#weiter(`${p.name}: daneben, die Kugel fliegt aus dem Bild.`);
  }

  #explodiere(x, y, wer) {
    for (let yy = y - R; yy <= y + R; yy++) for (let xx = x - R; xx <= x + R; xx++) {
      if (xx < 0 || xx >= this.W || yy < 0 || yy >= this.H) continue;
      if ((xx - x) ** 2 + (yy - y) ** 2 <= R * R) this.mat[yy * this.W + xx] = 0;
    }
    this.krater = { x, y };
    const notizen = [];
    this.p.forEach((p, i) => {
      p.kanonen.forEach((k) => {
        if (!k.lebt) return;
        const treffer = Math.hypot(k.x - x, k.y - 3 - y) < R + 4, faellt = !this.#fest(k.x, k.y) && !this.#fest(k.x - 3, k.y) && !this.#fest(k.x + 3, k.y);
        if (treffer || faellt) { k.lebt = false; notizen.push(i === this.zug ? 'eigene Kanone verloren' : `Kanone von ${p.name} zerstört`); }
      });
      const K = p.koenig;
      if (K.lebt && Math.hypot(K.x - x, K.y - 6 - y) < R + 5) { K.lebt = false; notizen.push(`König von ${p.name} getroffen`); }
    });
    this.#weiter(`${wer}: ${notizen.length ? notizen.join(', ') + '.' : 'Einschlag, kein wichtiges Ziel.'}`);
  }

  #weiter(text) {
    const tot = this.p.findIndex((p) => !p.koenig.lebt);
    if (tot >= 0) { this.vorbei = true; this.text = `${text} ${this.p[1 - tot].name} gewinnt!`; return; }
    if (this.p.every((p) => !this.#lebende(p).length)) { this.vorbei = true; this.text = `${text} Keine Kanonen mehr: unentschieden.`; return; }
    this.zug = 1 - this.zug;
    const p = this.p[this.zug];
    this.wind = klemme(this.wind + rnd(-0.35, 0.35), -1, 1);
    if (!this.#kanone(p)) { const a = this.#lebende(p); if (a.length) p.sel = a[0]; }
    this.text = `${text} Jetzt ${p.name}${this.cpuBeide || (this.cpu && this.zug === 1) ? ' (Computer)' : ''}.`;
  }

  /** Computer am Zug? Dann zielen und schießen; true, wenn er geschossen hat (die Seite zeigt danach seinen Schuss) */
  nachzug() {
    if (this.vorbei || !(this.cpuBeide || (this.cpu && this.zug === 1))) return false;
    const p = this.p[this.zug], gegner = this.p[1 - this.zug], K = gegner.koenig;   // gleicher Computer-Spieler für jede Seite
    if (!this.#lebende(p).length) { this.#weiter(`${p.name} hat keine Kanone mehr.`); return true; }
    const kb = [{ x0: K.x - 4, x1: K.x + 4, y0: K.y - 13, y1: K.y - 1 }];
    let best = null;
    for (const idx of this.#lebende(p)) {
      const c = p.kanonen[idx];
      for (const w of [40, 45, 50, 55, 60, 65, 70, 75]) for (let pw = 6; pw <= 30; pw += 0.5) {
        const s = this.#start(c, w, pw, p.dir);
        let r = null, n = 0;
        while (!r && n++ < 1500) r = this.#schritt(s, kb);
        if (!r) continue;
        const wert = r.ziel ? 0 : r.art === 'raus' ? 9999 : Math.hypot(r.x - K.x, r.y - (K.y - 6));
        if (!best || wert < best.wert) best = { wert, idx, w, pw };
      }
    }
    const fehler = Math.max(0.3, 2.4 - p.schuesse * 0.4);
    p.sel = best.idx; p.winkel = best.w; p.pulver = Math.round(klemme(best.pw + rnd(-fehler, fehler), 1, 30));
    this.feuer();
    return true;
  }

  /** Taste der Leiste; → true, wenn sich etwas geändert hat */
  taste(id, spieler = 0) {
    if (id === 'neu') { this.cpuBeide = false; this.neu(this.hoch); return true; }
    if (!this.#darf(spieler)) return false;
    const p = this.p[this.zug];
    if (id === 'w-') p.winkel = klemme(p.winkel - 5, 5, 85);
    else if (id === 'w+') p.winkel = klemme(p.winkel + 5, 5, 85);
    else if (id === 'p-') p.pulver = klemme(p.pulver - 2, 2, 30);
    else if (id === 'p+') p.pulver = klemme(p.pulver + 2, 2, 30);
    else if (id === 'feuer') this.feuer();
    else return false;
    return true;
  }

  /** Tipp ins Feld auf eine eigene Kanone wählt sie aus */
  feldTipp(x, y, spieler = 0) {
    if (!this.#darf(spieler)) return false;
    const p = this.p[this.zug];
    let bi = -1, bd = 24;
    p.kanonen.forEach((k, i) => { if (!k.lebt) return; const d = Math.hypot(k.x - x, k.y - 4 - y); if (d < bd) { bd = d; bi = i; } });
    if (bi < 0 || bi === p.sel) return false;
    p.sel = bi;
    return true;
  }

  // ---- Zeichnen (schwarz/weiß, Muster statt Grau) --------------------------------------------------------------
  zeichne(g, ox, oy) {
    const { W, H, mat } = this;
    const bild = g.createImageData(W, H), d = bild.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, m = mat[i];
      let an = false;
      if (m) {
        const kante = (y > 0 && !mat[i - W]) || (x > 0 && !mat[i - 1]) || (x < W - 1 && !mat[i + 1]) || (y < H - 1 && !mat[i + W]);
        if (kante) an = true;
        else if (m === 1) an = ((x & 3) === 0 && (y & 3) === 0) || ((x & 3) === 2 && (y & 3) === 2);
        else an = y % 6 === 0 || (x + ((y / 6) | 0 & 1) * 5) % 10 === 0;
      }
      const v = an ? 0 : 255, j = i * 4;
      d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255;
    }
    g.putImageData(bild, ox, oy);
    g.fillStyle = '#000';
    if (this.bahn) this.bahn.forEach((t, i) => { if (i % 3 === 0) g.fillRect(ox + (t[0] | 0), oy + (t[1] | 0), 2, 2); });
    if (this.krater) { g.lineWidth = 2; g.strokeStyle = '#000'; g.setLineDash([3, 3]); g.beginPath(); g.arc(ox + this.krater.x, oy + this.krater.y, R + 4, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    this.p.forEach((p, i) => {
      this.#koenig(g, ox, oy, p.koenig);
      p.kanonen.forEach((k, j) => { if (k.lebt) this.#kanoneMalen(g, ox, oy, k, p, i === this.zug && j === p.sel && !this.vorbei); });
    });
    // Kopfzeile im Feld: wer, Winkel, Pulver, Wind
    const p = this.p[this.zug];
    g.font = `500 22px ${FONT}`; g.textBaseline = 'top'; g.textAlign = 'left';
    g.fillText(this.vorbei ? 'Spiel vorbei' : `${p.name}${this.cpu && this.zug === 1 ? ' (CPU)' : ''} am Zug · ${p.winkel}° · Pulver ${p.pulver}`, ox + 8, oy + 6);
    const s = Math.round(Math.abs(this.wind) * 10), wx = ox + W - 120;
    g.textAlign = 'right';
    g.fillText(s ? `Wind ${s}` : 'windstill', ox + W - 8, oy + 6);
    if (s) {
      const len = 8 + Math.abs(this.wind) * 50, dir = Math.sign(this.wind), mx = wx - 30, x0 = mx - (dir * len) / 2, x1 = mx + (dir * len) / 2;
      g.fillRect(Math.min(x0, x1), oy + 16, Math.abs(x1 - x0), 3);
      for (let i = 0; i < 6; i++) g.fillRect(x1 - dir * (i + 1), oy + 17 - i, 1, 2 * i + 1);
    }
    // Meldung unten im Feld
    g.font = `20px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'bottom';
    const zeile = this.text.length > (this.hoch ? 44 : 72) ? this.text.slice(0, this.hoch ? 43 : 71) + '…' : this.text;
    g.fillStyle = '#fff'; g.fillRect(ox + 4, oy + H - 28, g.measureText(zeile).width + 12, 26);
    g.fillStyle = '#000'; g.fillText(zeile, ox + 10, oy + H - 6);
  }
  #koenig(g, ox, oy, K) {
    const MUSTER = ['X.X.X.X.X', 'XXXXXXXXX', '.X.....X.', '.X.X.X.X.', '.X.....X.', '..XXXXX..', '.XXXXXXX.', 'XX.XXX.XX', 'XXXXXXXXX', 'X.XXXXX.X', '.XXXXXXX.', '.X.....X.', '.XX...XX.'];
    const x0 = ox + K.x - 4, y0 = oy + K.y - 13;
    if (K.lebt) { g.fillStyle = '#fff'; g.fillRect(x0, y0, 9, 13); g.fillStyle = '#000'; MUSTER.forEach((r, y) => { for (let x = 0; x < 9; x++) if (r[x] === 'X') g.fillRect(x0 + x, y0 + y, 1, 1); }); }
    else { g.fillStyle = '#000'; g.fillRect(ox + K.x, oy + K.y - 9, 1, 9); g.fillRect(ox + K.x - 3, oy + K.y - 7, 7, 1); g.fillRect(ox + K.x - 4, oy + K.y - 1, 9, 1); }
  }
  #kanoneMalen(g, ox, oy, k, p, gewaehlt) {
    const a = (p.winkel * Math.PI) / 180, x = ox + k.x, y = oy + k.y, by = y - 4;
    g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, by); g.lineTo(x + p.dir * Math.cos(a) * 11, by - Math.sin(a) * 11); g.stroke();
    g.fillStyle = '#000'; g.fillRect(x - 4, y - 4, 8, 2); g.fillRect(x - 4, y - 2, 3, 2); g.fillRect(x + 1, y - 2, 3, 2);
    if (gewaehlt) for (let r = 0; r < 5; r++) g.fillRect(x - 4 + r, y - 26 + r, 9 - 2 * r, 1);   // Pfeil über der gewählten Kanone
  }
}

/** Widget für die App-Seite (appseite.js): Feld + Tastenleiste; Tipps → 'seite' (Teilbild ohne Reiter) */
export function burgduellWidget(kopf) {
  return {
    name: 'Burgduell',
    neu() { return new Burgduell(false); },
    anzeige() {},
    seite(g, z, hoch) {
      if (z.hoch !== hoch) z.neu(hoch);   // Lage gewechselt: neues Feld in der passenden Größe
      kopf(g);
      const { feld, tasten } = burgMasse(hoch);
      z.zeichne(g, feld.x, feld.y);
      g.fillStyle = '#000'; g.fillRect(feld.x, feld.y + feld.h, feld.w, 2);
      const proZeile = Math.ceil(TASTEN.length / tasten.zeilen), tw = tasten.w / proZeile, th = tasten.h / tasten.zeilen;
      TASTEN.forEach((t, i) => braunKnopf(g, tasten.x + (i % proZeile) * tw, tasten.y + Math.floor(i / proZeile) * th, tw, th, t.text, t.rolle ?? (t.id === 'neu' ? 'werkzeug' : 'wahl'), { rand: 4, gr: hoch ? 24 : 22 }));
    },
    tipp(z, x, y, hoch, spieler = 0) {
      const { feld, tasten } = burgMasse(hoch);
      if (y >= tasten.y && y < tasten.y + tasten.h && x >= tasten.x && x < tasten.x + tasten.w) {
        const proZeile = Math.ceil(TASTEN.length / tasten.zeilen);
        const i = Math.floor((y - tasten.y) / (tasten.h / tasten.zeilen)) * proZeile + Math.floor((x - tasten.x) / (tasten.w / proZeile));
        return TASTEN[i] && z.taste(TASTEN[i].id, spieler) ? 'seite' : null;
      }
      if (y >= feld.y && y < feld.y + feld.h) return z.feldTipp(x - feld.x, y - feld.y, spieler) ? 'seite' : null;
      return null;
    },
    nachzugBereit(z) { return !z.vorbei && z.cpu && z.zug === 1; },
    nachzug(z) { return z.nachzug(); },
  };
}
