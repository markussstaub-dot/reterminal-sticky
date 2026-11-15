// Eigenes Android-Plugin (Hintergrund.java): Vordergrund-Dienst mit Wecker-GATT und passivem GPS. Im Browser leer.
import { registerPlugin } from '@capacitor/core';

export const Hintergrund = registerPlugin('Hintergrund', { web: { async start() {}, async stop() {}, async letzterOrt() { return {}; }, async klingeln() { console.info('[sticky] Handy würde klingeln'); }, async ruhe() {},
  async meldeZugriff() { return { da: false }; }, async meldeZugriffOeffnen() {}, async testMeldung() {}, async meldeListe() {} } });
