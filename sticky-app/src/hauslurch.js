// Brücke zum Hauslurch (Sprachassistent am Zenbook, ../hauslurch): das Fold schickt nur den erkannten TEXT,
// nie den Ton. Der Hauslurch führt den Befehl aus (Timer, Wetter, Qwen …), spricht die Antwort und gibt sie zurück.
// Schnittstelle: POST <adresse>/befehl {"text": …} mit Kopf „X-Hauslurch-Schluessel“ → {"antwort", "grantelt", "timer"}

export const STANDARD_PORT = 8765;

/** „192.168.2.61“ → „http://192.168.2.61:8765“; Schema und Port bleiben, wenn angegeben */
export function adresseNormal(roh) {
  let a = String(roh || '').trim().replace(/\/+$/, '');
  if (!a) return '';
  if (!/^https?:\/\//i.test(a)) a = `http://${a}`;
  const u = new URL(a);
  if (!u.port && u.protocol === 'http:') u.port = String(STANDARD_PORT);
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
}

/** Für die Rückmeldung am Sticky: eine Zeile, notfalls mit „…“ gekürzt */
export function kurzAntwort(text, max = 44) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/[\s,.;:!?-]+\S*$/, '') || t.slice(0, max - 1)}…`;
}

const FEHLER = {
  401: ['falscher Schlüssel', 'wrong key'],
  403: ['nur aus dem Heimnetz', 'home network only'],
  404: ['falsche Adresse', 'wrong address'],
};

/**
 * Text an den Hauslurch. `post(url, kopf, daten)` liefert {status, data} (native: CapacitorHttp, Browser: fetch).
 * Wirft Error mit kurzer Meldung (de/en über `T`).
 */
export async function anHauslurch(text, { adresse, schluessel, stimme = 'zenbook', lage = '' }, post, T = (de) => de) {
  const basis = adresseNormal(adresse);
  if (!basis) throw new Error(T('keine Adresse', 'no address'));
  if (!schluessel) throw new Error(T('kein Schlüssel', 'no key'));
  let r;
  try {
    r = await post(`${basis}/befehl`, { 'Content-Type': 'application/json', 'X-Hauslurch-Schluessel': schluessel }, { text, ...(stimme && stimme !== 'zenbook' ? { stimme } : {}), ...(lage ? { lage } : {}) });
  } catch (e) {
    throw new Error(T(`nicht erreichbar (${e.message})`, `not reachable (${e.message})`));
  }
  if (r.status !== 200) {
    const [de, en] = FEHLER[r.status] || [`Fehler ${r.status}`, `error ${r.status}`];
    throw new Error(T(de, en));
  }
  const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  return { antwort: String(d?.antwort ?? ''), grantelt: !!d?.grantelt, timer: Array.isArray(d?.timer) ? d.timer : [], ...(d?.ton ? { ton: String(d.ton) } : {}), ...(d?.weiter ? { weiter: String(d.weiter) } : {}) };
}

/**
 * Folgesätze abholen (der Lurch schickt den ersten Satz sofort, der Rest kommt, sobald Qwen ihn hat).
 * Ruft `jeSatz({ satz, ton })` für jeden weiteren Satz; endet bei „fertig“ oder Fehler (dann still).
 */
export async function weitereSaetze(weiter, { adresse, schluessel }, get, jeSatz) {
  const basis = adresseNormal(adresse);
  for (let runde = 0; weiter && runde < 30; runde++) {
    let r;
    try { r = await get(`${basis}/weiter?id=${encodeURIComponent(weiter)}`, { 'X-Hauslurch-Schluessel': schluessel }); } catch { return; }
    const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    if (r.status !== 200 || !d || d.fertig) return;
    jeSatz({ satz: String(d.satz ?? ''), ...(d.ton ? { ton: String(d.ton) } : {}) });
    weiter = d.weiter;
  }
}

/** Unterwegs = es gibt einen Ort „Zuhause“, und da bin ich gerade nicht (sonst weiß die App es nicht) */
export function istUnterwegs({ orte = [], aktuellerOrt = null } = {}) {
  const daheim = orte.find((o) => ZUHAUSE_RE.test(o.name));
  return !!daheim && aktuellerOrt !== daheim.name;
}

/** Name des eigenen Zuhauses in der Ortsliste („Zuhause“, „Daheim“, „Home“) */
export const ZUHAUSE_RE = /^(zuhause|zu hause|daheim|home)$/i;

/**
 * Wo spricht der Lurch? Wahl „auto“ (Standard): zu Hause das Zenbook, unterwegs das Fold. Ohne Ort „Zuhause“ in der
 * Ortsliste weiß die App nicht, wo zu Hause ist → dann wie bisher das Zenbook.
 */
export function stimmeZiel(wahl, { orte = [], aktuellerOrt = null } = {}) {
  if (wahl === 'zenbook' || wahl === 'fold' || wahl === 'beide') return wahl;
  const daheim = orte.find((o) => ZUHAUSE_RE.test(o.name));
  if (!daheim) return 'zenbook';
  return aktuellerOrt === daheim.name ? 'zenbook' : 'fold';
}

/** Lebenszeichen für „Verbindung testen“: GET /status */
export async function hauslurchStatus({ adresse, schluessel }, get, T = (de) => de) {
  const basis = adresseNormal(adresse);
  if (!basis) throw new Error(T('keine Adresse', 'no address'));
  let r;
  try { r = await get(`${basis}/status`, { 'X-Hauslurch-Schluessel': schluessel || '' }); } catch (e) {
    throw new Error(T(`nicht erreichbar (${e.message})`, `not reachable (${e.message})`));
  }
  if (r.status !== 200) {
    const [de, en] = FEHLER[r.status] || [`Fehler ${r.status}`, `error ${r.status}`];
    throw new Error(T(de, en));
  }
  return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
}
