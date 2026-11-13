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
    static void melde(boolean da) {
        Hintergrund h = instanz;
        if (h == null) return;
        JSObject o = new JSObject();
        o.put("da", da);
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

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), StickyDienst.class));
        call.resolve();
    }
}
