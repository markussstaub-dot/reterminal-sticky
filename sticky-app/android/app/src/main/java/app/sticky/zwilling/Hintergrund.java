package app.sticky.zwilling;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Startet/stoppt den Vordergrund-Dienst (StickyDienst), damit die App im Hintergrund nicht eingefroren wird.
@CapacitorPlugin(name = "Hintergrund")
public class Hintergrund extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), StickyDienst.class);
            i.putExtra("text", call.getString("text", "Notizen und Diktate kommen an"));
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
            else getContext().startService(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Dienst nicht startbar: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), StickyDienst.class));
        call.resolve();
    }
}
