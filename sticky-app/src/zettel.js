// Zettel zum Vorzeigen (Markus, 13.11.2026: „Ordnung in die Zettel mit QR“): ein Textfeld für alles, „## Titel“ je
// Zettel, Reihenfolge am Sticky = Reihenfolge im Text, bis zu 6. Ein Zettel mit QR-Zeile wird eine QR-Karte
// (karten.js), sonst ein Bestellzettel (bestellung.js). Kurzformen für den QR-Inhalt:
//   qr: Inhalt               wörtlich (z. B. Kundenkarte; echte Nummern nur in der App, nie im Repo)
//   wlan: Name | Passwort    Gast-WLAN zum Scannen (WPA), Name und Passwort stehen zusätzlich als Text daneben
//   link: https://…          Link
export const MAX_ZETTEL = 6;

/** WLAN-QR nach dem üblichen Format WIFI:T:WPA;S:…;P:…;; (\ ; , : " werden maskiert) */
export function wlanQr(name, passwort) {
  const m = (t) => t.replace(/([\\;,:"])/g, '\\$1');
  return passwort ? `WIFI:T:WPA;S:${m(name)};P:${m(passwort)};;` : `WIFI:T:nopass;S:${m(name)};;`;
}

/** Text → [{ titel, qr, zeilen }] (qr leer = Bestellzettel) */
export function zettelListe(text) {
  return text.split(/^## /m).map((b) => b.trim()).filter(Boolean).map((b) => {
    const [titel, ...rest] = b.split('\n').map((z) => z.trim());
    let qr = '';
    const zeilen = [];
    for (const z of rest) {
      if (!z) continue;
      const qrZeile = z.match(/^qr:\s*(.+)$/i), wlan = z.match(/^wlan:\s*(.+)$/i), link = z.match(/^link:\s*(.+)$/i);
      if (qrZeile && !qr) qr = qrZeile[1].trim();
      else if (wlan && !qr) {
        const [name, pw = ''] = wlan[1].split('|').map((t) => t.trim());
        qr = wlanQr(name, pw);
        zeilen.push(`WLAN: ${name}`);
        if (pw) zeilen.push(`Passwort: ${pw}`);
      } else if (link && !qr) {
        qr = link[1].trim();
        zeilen.push(qr.replace(/^https?:\/\//, ''));
      } else zeilen.push(z);
    }
    return { titel: titel.trim(), qr, zeilen };
  }).filter((z) => z.titel && (z.qr || z.zeilen.length)).slice(0, MAX_ZETTEL);
}

/** Umzug aus den alten zwei Feldern (Bestellzettel, Karten); der Platzhalter der Karten fällt weg */
export function zettelUmzug(bestell, karten, kartenPlatzhalter) {
  const k = (karten ?? '').trim();
  return [(bestell ?? '').trim(), k && k !== kartenPlatzhalter.trim() ? k : ''].filter(Boolean).join('\n\n') + '\n';
}
