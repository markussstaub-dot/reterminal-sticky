package app.sticky.zwilling;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Startet/stoppt den Vordergrund-Dienst (StickyDienst), damit die App im Hintergrund nicht eingefroren wird.
@CapacitorPlugin(name = "Hintergrund")
public class Hintergrund extends Plugin {
    private static Hintergrund instanz;

    @Override
    public void load() { instanz = this; }

    /** Vom Wecker im StickyDienst: Sticky funkt wieder (true) oder ist weg (false) */
    static void melde(boolean da, String adresse) {
        Hintergrund h = instanz;
        if (h == null) return;
        JSObject o = new JSObject();
        o.put("da", da);
        o.put("adresse", adresse);
        h.notifyListeners("sticky", o);
    }

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), StickyDienst.class);
            i.putExtra("text", call.getString("text", "Notizen und Diktate kommen an"));
            if (call.getString("adresse") != null) i.putExtra("adresse", call.getString("adresse"));
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
            else getContext().startService(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Dienst nicht startbar: " + e.getMessage());
        }
    }

    /** Notiz an Bubble Log (Konsole im Entwicklermodus, 15.11.2026): expliziter Broadcast, Empfänger dort in Notizen.java.
     *  Ankommen kann er nur mit der Signatur-Berechtigung von Bubble Log (gleicher Schlüssel); fehlt Bubble Log, passiert nichts. */
    @PluginMethod
    public void anBubbleLog(PluginCall call) {
        String json = call.getString("json");
        if (json == null) { call.reject("json fehlt"); return; }
        Intent i = new Intent("app.bubblelog.microlino.NOTIZ");
        i.setPackage("app.bubblelog.microlino");
        i.putExtra("json", json);
        // Ohne receiverPermission: die müsste Bubble Log selbst halten (15.11.2026 deshalb verworfen). Geschützt ist der
        // Empfänger über android:permission, das Ziel ist fest Bubble Log (setPackage)
        getContext().sendBroadcast(i);
        call.resolve();
    }

    /** Letzter Ort, den der Dienst passiv mitbekommen hat (z. B. von Bubble Logs GPS): lat, lon, gen, tempo, alterMs */
    @PluginMethod
    public void letzterOrt(PluginCall call) {
        android.location.Location o = StickyDienst.letzterOrt;
        JSObject r = new JSObject();
        if (o != null) {
            r.put("lat", o.getLatitude());
            r.put("lon", o.getLongitude());
            r.put("gen", Math.round(o.getAccuracy()));
            if (o.hasSpeed()) r.put("tempo", o.getSpeed());
            r.put("alterMs", (android.os.SystemClock.elapsedRealtimeNanos() - o.getElapsedRealtimeNanos()) / 1000000);
        }
        call.resolve(r);
    }

    // ---- Handy suchen (KI 3× am Sticky, 13.11.2026): Weckton über den Weckerkanal, damit es auch lautlos klingelt.
    // Die Lautstärke des Handys wird nicht verstellt; es klingelt so laut, wie der Wecker eingestellt ist.
    private static android.media.Ringtone ton;
    private static final android.os.Handler hand = new android.os.Handler(android.os.Looper.getMainLooper());

    @PluginMethod
    public void klingeln(PluginCall call) {
        int sek = call.getInt("sekunden", 20);
        try {
            ruhe();
            android.net.Uri uri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE);
            ton = android.media.RingtoneManager.getRingtone(getContext(), uri);
            if (ton != null) {
                ton.setAudioAttributes(new android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                if (Build.VERSION.SDK_INT >= 28) ton.setLooping(true);
                ton.play();
            }
            android.os.Vibrator v = (android.os.Vibrator) getContext().getSystemService(android.content.Context.VIBRATOR_SERVICE);
            if (v != null && Build.VERSION.SDK_INT >= 26)
                v.vibrate(android.os.VibrationEffect.createWaveform(new long[] { 0, 600, 400 }, 0));
            hand.postDelayed(Hintergrund::ruheStatisch, sek * 1000L);
            call.resolve();
        } catch (Exception e) {
            call.reject("Klingeln geht nicht: " + e.getMessage());
        }
    }

    @PluginMethod
    public void ruhe(PluginCall call) { ruhe(); call.resolve(); }

    private void ruhe() { ruheStatisch(); }

    private static void ruheStatisch() {
        hand.removeCallbacksAndMessages(null);
        if (ton != null) { try { ton.stop(); } catch (Exception ignored) { } ton = null; }
        Hintergrund h = instanz;
        if (h != null) {
            android.os.Vibrator v = (android.os.Vibrator) h.getContext().getSystemService(android.content.Context.VIBRATOR_SERVICE);
            if (v != null) v.cancel();
        }
    }

    /** Vom Melder: eine Benachrichtigung einer erlaubten App (App-Name, Schlüssel, Titel, Text) */
    static void benachrichtigung(String paket, String app, String key, String titel, String text) {
        Hintergrund h = instanz;
        if (h == null) return;
        JSObject o = new JSObject();
        o.put("paket", paket);
        o.put("app", app);
        o.put("key", key);
        o.put("titel", titel);
        o.put("text", text);
        h.notifyListeners("benachrichtigung", o);
    }

    /** Vom Melder: am Handy weggewischt (oder von der App zurückgezogen) */
    static void benachrichtigungWeg(String key) {
        Hintergrund h = instanz;
        if (h == null) return;
        JSObject o = new JSObject();
        o.put("key", key);
        h.notifyListeners("benachrichtigungWeg", o);
    }

    /** Positivliste aus der App (Mehr → Benachrichtigungen): { pakete: [..] } */
    @PluginMethod
    public void meldeListe(PluginCall call) {
        try {
            com.getcapacitor.JSArray a = call.getArray("pakete");
            java.util.Set<String> s = new java.util.HashSet<>();
            if (a != null) for (int i = 0; i < a.length(); i++) s.add(a.getString(i));
            Melder.setzeErlaubt(getContext(), s);
            call.resolve();
        } catch (Exception e) {
            call.reject("Positivliste: " + e.getMessage());
        }
    }

    /** Hat der Nutzer den Benachrichtigungszugriff für die Sticky-App freigegeben? */
    @PluginMethod
    public void meldeZugriff(PluginCall call) {
        JSObject o = new JSObject();
        o.put("da", androidx.core.app.NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName()));
        call.resolve(o);
    }

    /** Öffnet die Systemseite „Benachrichtigungszugriff“ – freigeben muss der Nutzer selbst */
    @PluginMethod
    public void meldeZugriffOeffnen(PluginCall call) {
        try {
            Intent i = new Intent(android.provider.Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Einstellungen nicht zu öffnen: " + e.getMessage());
        }
    }

    /** Test: eine gewöhnliche Benachrichtigung der Sticky-App selbst (läuft dann durch den Melder) */
    @PluginMethod
    public void testMeldung(PluginCall call) {
        try {
            android.app.NotificationManager nm = getContext().getSystemService(android.app.NotificationManager.class);
            String kanal = "hinweise";
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(kanal) == null)
                nm.createNotificationChannel(new android.app.NotificationChannel(kanal, "Hinweise", android.app.NotificationManager.IMPORTANCE_DEFAULT));
            android.app.Notification n = new android.app.Notification.Builder(getContext(), kanal)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(call.getString("titel", "Sticky"))
                    .setContentText(call.getString("text", "Test-Benachrichtigung"))
                    .setAutoCancel(true)
                    .build();
            nm.notify((int) (System.currentTimeMillis() % 100000), n);
            call.resolve();
        } catch (Exception e) {
            call.reject("Test-Benachrichtigung geht nicht: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), StickyDienst.class));
        call.resolve();
    }
}
