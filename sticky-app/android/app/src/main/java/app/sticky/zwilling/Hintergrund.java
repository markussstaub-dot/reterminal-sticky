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

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), StickyDienst.class));
        call.resolve();
    }
}
