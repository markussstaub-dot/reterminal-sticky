// Hilfe je App-Reiter (SPEC „Hilfe je App-Reiter“, Markus 18.11.2026: „Analog Sticky sollte auch jeder Tab der App eine
// Hilfeseite haben“). „?“ oben rechts öffnet ein Blatt mit kurzen Zeilen für den gerade offenen Reiter bzw. die offene
// Mehr-Unterseite. Aufbau wie die Sticky-Hilfe (hilfe.js): „!“ am Zeilenanfang = fett (Zwischenüberschrift), zweisprachig
// über T() zur Anzeigezeit. Hierher gewandert sind auch die langen Kleingedruckt-Absätze aus den Reitern.
import { T } from './uebersetzen.js';
import { blattOeffnen, el } from './blatt.js';

/** alle Hilfeseiten der App in der App-Sprache: { schluessel: { titel, zeilen } } */
export function appHilfe() {
  return {
    sticky: {
      titel: T('Hilfe · Sticky', 'Help · Sticky'),
      zeilen: T(
        ['!Wofür', 'Verbinden und sehen, was der Sticky gerade zeigt.',
          '!Knöpfe', 'Verbinden: per Bluetooth mit dem aktiven Sticky (welcher, steht unter Mehr → Stickys).',
          'Sticky suchen: er piept 30 s, bis du eine Taste drückst.',
          '!Vorschau', 'Tippen auf das Bild wirkt wie Tippen am Sticky, ▲ ▼ blättern dort.',
          'Die Zeile darüber zeigt die letzte Meldung – Tippen führt zu Mehr → Diagnose.',
          '!Oben', 'Kopfzeile: ● verbunden · ◐ schläft · ○ nicht erreichbar · – läuft nicht mit.',
          '!Am Sticky', '▲+▼ zusammen zeigt dort die Tastenhilfe der Seite.'],
        ['!What for', 'Connect and see what the Sticky is showing right now.',
          '!Buttons', 'Connect: Bluetooth to the active Sticky (which one: More → Stickys).',
          'Find Sticky: it beeps for 30 s until you press a key.',
          '!Preview', 'Tapping the picture works like tapping the Sticky, ▲ ▼ page there.',
          'The line above shows the latest message – tap it for More → Diagnostics.',
          '!Top', 'Header: ● connected · ◐ asleep · ○ not reachable · – doesn\'t run along.',
          '!On the Sticky', '▲+▼ together shows the key help for that page.']),
    },
    notizen: {
      titel: T('Hilfe · Notizen', 'Help · Notes'),
      zeilen: T(
        ['!Wofür', 'Alles, was du am Sticky diktierst oder antippst, landet hier.',
          '!Diktat', 'KI am Sticky halten, sprechen, loslassen. Ohne Handy merkt er es sich, die App holt es später ab.',
          '!Notizen', 'Tippen auf eine Notiz: Text korrigieren – das Wörterbuch lernt mit (Mehr → Diktat und Erkennung).',
          'Das Schild vorne ordnet ein (Erledigung, Erinnerung, Idee …); Tippen ändert es.',
          'Notizen teilen: alle von heute als Text an eine andere App.',
          '!Aufnahmen', 'Die Diktate zum Nachhören, mit erkanntem Text und Knopf zum Kopieren.'],
        ['!What for', 'Everything you dictate or tap on the Sticky ends up here.',
          '!Dictation', 'Hold AI on the Sticky, speak, release. Without the phone it keeps it, the app collects it later.',
          '!Notes', 'Tap a note: fix the text – the dictionary learns along (More → Dictation and recognition).',
          'The tag in front sorts it (errand, reminder, idea …); tap to change it.',
          'Share notes: all of today as text to another app.',
          '!Recordings', 'The dictations to listen to again, with the recognised text and a copy button.']),
    },
    dokumente: {
      titel: T('Hilfe · Dokumente', 'Help · Docs'),
      zeilen: T(
        ['!Wofür', 'Handbücher (PDF) und Spickzettel zum Nachschlagen am Sticky, ohne Handy.',
          '!Handbücher', '+ PDF lädt eins. Schalter = kommt auf den Sticky.',
          'Tippen auf ein Handbuch: Seite suchen (der Sticky springt hin), Inhaltsverzeichnis, umbenennen, löschen.',
          '!Spickzettel', '„## Titel #szene“ beginnt eine Karte, darunter Zeilen, „!“ = fett.',
          'Szene-Knöpfe filtern; was ausgegraut ist, kommt nicht auf den Sticky.',
          'Pflegen am bequemsten am Zenbook (Spickzettel-Konsole), hier ansehen und kleine Korrekturen.',
          '!Aufspielen', '„Auf den Sticky“ schickt nur, was sich geändert hat (braucht die SD-Karte).',
          '!Am Sticky', 'Menü → Nachschlagen → Handbuch bzw. Spickzettel.'],
        ['!What for', 'Manuals (PDF) and cheat sheets to look things up on the Sticky, without the phone.',
          '!Manuals', '+ PDF adds one. Switch = goes to the Sticky.',
          'Tap a manual: find a page (the Sticky jumps there), contents, rename, delete.',
          '!Cheat sheets', '“## Title #scene” starts a card, lines below, “!” = bold.',
          'Scene buttons filter; greyed out cards don\'t go to the Sticky.',
          'Easiest to edit on the laptop (cheat sheet console); look and fix small things here.',
          '!Upload', '“To the Sticky” only sends what changed (needs the SD card).',
          '!On the Sticky', 'Menu → Look up → Manual or Cheat sheets.']),
    },
    bestellen: {
      titel: T('Hilfe · Zettel', 'Help · Cards'),
      zeilen: T(
        ['!Wofür', 'Zettel zum Vorzeigen: Kundenkarte, Strichcode, Einkaufsliste, Bestellung, Gast-WLAN, Link.',
          '!Liste', 'Schalter = kommt auf den Sticky (höchstens 6), beliebig viele bleiben in der App.',
          '⋮⋮ ziehen = Reihenfolge am Sticky. Tippen öffnet die Karte: Titel, Vorschau, Inhalt, löschen.',
          '!+ Zettel', 'fragt zuerst die Art. QR und Strichcode (EAN-13, Code128) abfotografieren – offline, das Foto wird nicht gespeichert.',
          '!Listen abhaken', 'Am Sticky auf eine Zeile tippen hakt ab; die App übernimmt die Häkchen beim nächsten Abgleich.',
          '!Als Text bearbeiten', '„## Titel“ beginnt einen Zettel, darunter Zeilen. Sonderzeilen:',
          'qr: Inhalt · strich: EAN13 4006381333931 · wlan: Name | Passwort · link: https://…',
          '[ ] offen, [x] abgehakt · sticky: aus = nur in der App',
          'Inhalte bleiben in App und Sticky, nichts geht ins Netz.',
          '!Orte', 'Unter Mehr → Verknüpfungen → Orte kann ein Ort auf den Zettel-Namen zeigen: dort holt der Sticky ihn nach vorn.',
          '!Am Sticky', 'Menü → Nachschlagen → Zettel, oder ▲ ▼ durchs Karussell.'],
        ['!What for', 'Cards to show: loyalty card, barcode, shopping list, order, guest Wi-Fi, link.',
          '!List', 'Switch = goes to the Sticky (at most 6), any number stay in the app.',
          'Drag ⋮⋮ = order on the Sticky. Tap opens the card: title, preview, content, delete.',
          '!+ Card', 'asks for the kind first. Photograph QR codes and barcodes (EAN-13, Code128) – offline, the photo isn\'t kept.',
          '!Tick off lists', 'Tap a line on the Sticky to tick it; the app takes the ticks over at the next sync.',
          '!Edit as text', '“## Title” starts a card, lines below. Special lines:',
          'qr: content · strich: EAN13 4006381333931 · wlan: name | password · link: https://…',
          '[ ] open, [x] ticked · sticky: aus = app only',
          'Contents stay in the app and on the Sticky, nothing goes online.',
          '!Places', 'Under More → Connections → Places a place can point to the card name: there the Sticky brings it up.',
          '!On the Sticky', 'Menu → Look up → Cards, or ▲ ▼ through the carousel.']),
    },
    mehr: {
      titel: T('Hilfe · Mehr', 'Help · More'),
      zeilen: T(
        ['!Wofür', 'Einstellungen in fünf Unterseiten; jede hat ihr eigenes „?“.',
          '!Schilder', 'Gerät = nur dieser Sticky · Profil = alle Stickys mit demselben Profil · App = die ganze App.'],
        ['!What for', 'Settings on five sub-pages; each has its own “?”.',
          '!Tags', 'Device = this Sticky only · Profile = all Stickys with the same profile · App = the whole app.']),
    },
    stickys: {
      titel: T('Hilfe · Stickys', 'Help · Stickys'),
      zeilen: T(
        ['!Aktiv', 'Einer ist aktiv: Vorschau, Fernbedienung, Handbuch-Suche gehen an ihn. „Wechseln“ macht einen anderen aktiv.',
          '!Läuft mit', 'Weitere Stickys mit „läuft mit“ bleiben im Hintergrund verbunden und bekommen ihre Seiten.',
          '!Profil', 'Das Profil bestimmt Karussell, Lage, Zettel, Spickzettel und Wörterbuch – Geräte mit demselben Profil teilen sie.',
          '!Leeren', 'Vor dem Weitergeben: alles Persönliche auf dem Sticky löschen.',
          '!Dieser Sticky', 'Auf dem Kopf (180°) und Lineal-Abgleich gelten nur für dieses Gerät.'],
        ['!Active', 'One is active: preview, remote and manual search go to it. “Switch” makes another one active.',
          '!Runs along', 'Further Stickys with “runs along” stay connected in the background and get their pages.',
          '!Profile', 'The profile sets carousel, orientation, cards, cheat sheets and dictionary – devices with the same profile share them.',
          '!Clear', 'Before handing it on: delete everything personal on the Sticky.',
          '!This Sticky', 'Upside down (180°) and ruler calibration only apply to this device.']),
    },
    amsticky: {
      titel: T('Hilfe · Am Sticky', 'Help · On the Sticky'),
      zeilen: T(
        ['!Karussell', 'Häkchen = kommt auf den Sticky, Pfeile = Reihenfolge.',
          'Eine Gruppe ist im Menü eine Kachel (Tippen = zuletzt benutztes Werkzeug) und auf der Seite ein Reiter; ▲ ▼ blättert weiter durch jede Seite einzeln.',
          '!Lage', 'Hochkant oder quer, je Seite. Home bleibt hochkant. Automatisch = nach Lagesensor.',
          '!Sprache', 'Gilt für App und Sticky. Automatisch folgt dem Handy; der Sticky kann es auf seiner Seite „Einstellungen“ überstimmen.'],
        ['!Carousel', 'Tick = goes to the Sticky, arrows = order.',
          'A group is one tile in the menu (tap = last used tool) and tabs on the page; ▲ ▼ still flips through every page.',
          '!Orientation', 'Portrait or landscape, per page. Home stays portrait. Automatic = by the tilt sensor.',
          '!Language', 'For app and Sticky. Automatic follows the phone; the Sticky can override it on its Settings page.']),
    },
    diktat: {
      titel: T('Hilfe · Diktat und Erkennung', 'Help · Dictation and recognition'),
      zeilen: T(
        ['!Modell', 'Welche Spracherkennung auf dem Handy läuft (offline).',
          '!Wortliste', 'Eigennamen, die oft falsch erkannt werden, durch Komma getrennt.',
          '!Wörterbuch', 'Wird nach jeder Erkennung angewandt, je Zeile „falsch → richtig“. Korrigierst du eine Notiz, lernt es von selbst dazu.',
          '!Push-to-Talk', 'KI halten, sprechen, loslassen: der Text liegt danach auch in der Zwischenablage (WhatsApp, Mail, Suche). Die Notiz bleibt trotzdem.'],
        ['!Model', 'Which speech recognition runs on the phone (offline).',
          '!Word list', 'Names that are often misheard, separated by commas.',
          '!Dictionary', 'Applied after every recognition, one “wrong → right” per line. Correct a note and it learns by itself.',
          '!Push-to-talk', 'Hold AI, speak, release: the text is then also on the clipboard (WhatsApp, mail, search). The note is kept too.']),
    },
    verknuepfungen: {
      titel: T('Hilfe · Verknüpfungen', 'Help · Connections'),
      zeilen: T(
        ['!Benachrichtigungen', 'Nur Apps aus der Liste erscheinen kurz unten am Sticky (je Zeile ein Paketname; „paket: Name, Name“ = nur, wenn einer davon im Titel steht).',
          'Die letzten drei bleiben auf der Home-Karte, bis du sie am Handy wegwischst (spätestens 12 h). Den Zugriff gibst du einmal in den Android-Einstellungen frei.',
          '!Orte', 'Je Zeile: Name; Breite, Länge; Ziel[; Umkreis m]. Ziel: Home, Notiz, Handbuch, Spickzettel oder der Name eines Zettels.',
          'Bei Ankunft springt der Sticky einmal dorthin, aber nur aus Home; Home zeigt den Ort. Nach der Fahrt fragt er „Parkplatz merken?“.',
          '„Hier merken“ trägt den Standort ein – Name und Ziel danach anpassen.',
          '!Hauslurch', 'Mit „Lurch“ anfangen: „Lurch, stell einen Timer auf eine Minute“. Nur der Text geht ans Zenbook, es antwortet mit Stimme.',
          'QR-Code: am Zenbook in der Hauslurch-Konsole die 8 wählen, Bildschirm abfotografieren.',
          'Automatisch braucht einen Ort „Zuhause“. Der Ton bleibt bei deinen Geräten (Tailscale).'],
        ['!Notifications', 'Only apps from the list show briefly at the bottom of the Sticky (one package name per line; “package: name, name” = only when one is in the title).',
          'The last three stay on the Home card until you dismiss them on the phone (12 h at most). You grant access once in the Android settings.',
          '!Places', 'One per line: name; latitude, longitude; target[; radius m]. Target: Home, Note, Manual, Cheat sheets or the name of a card.',
          'On arrival the Sticky jumps there once, but only from Home; Home shows the place. After a ride it asks “Remember parking spot?”.',
          '“Remember this place” adds your location – adjust name and target afterwards.',
          '!Hauslurch', 'Start with “Lurch”: “Lurch, set a timer for one minute”. Only the text goes to the Zenbook, it answers aloud.',
          'QR code: choose 8 in the Hauslurch console on the Zenbook, photograph the screen.',
          'Automatic needs a place called “Home”. The audio stays on your devices (Tailscale).']),
    },
    diagnose: {
      titel: T('Hilfe · Diagnose', 'Help · Diagnostics'),
      zeilen: T(
        ['!Ereignisse', 'Was der Sticky meldet und was die App tut, neueste oben. Rot = Fehler.',
          '!Verbindung', 'Firmware, Akku, Funkwerte des aktiven Sticky.',
          '!Fahrtenschreiber', 'Tagesprotokoll vom Sticky (SD-Karte); Abholen holt das Neue.',
          '!Werkstatt', 'Zum Ausprobieren: frei zeichnen und als Bild an den Sticky senden.'],
        ['!Events', 'What the Sticky reports and what the app does, newest on top. Red = error.',
          '!Connection', 'Firmware, battery, radio values of the active Sticky.',
          '!Trip recorder', 'Daily log from the Sticky (SD card); Fetch gets what\'s new.',
          '!Workshop', 'For trying things: draw freely and send it to the Sticky as a picture.']),
    },
  };
}

/** Welche Hilfe gerade passt: offener Reiter, im Mehr-Reiter die offene Unterseite */
export function hilfeSchluessel(doc = document) {
  const tab = doc.querySelector('.tab:not([hidden])')?.dataset.tab ?? 'sticky';
  if (tab !== 'mehr') return tab;
  return doc.querySelector('.mehrseite:not([hidden])')?.dataset.seite ?? 'mehr';
}

export function hilfeAppEinrichten(knopf) {
  knopf.onclick = () => {
    const alle = appHilfe();
    const h = alle[hilfeSchluessel()] ?? alle.sticky;
    blattOeffnen(h.titel, [el('div', { className: 'hilfe' }, ...h.zeilen.map((z) => (z.startsWith('!')
      ? el('p', { className: 'fett', textContent: z.slice(1) })
      : el('p', { textContent: z }))))]);
  };
}
