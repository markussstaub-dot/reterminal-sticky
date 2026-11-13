package app.sticky.zwilling;

import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static long letzterNeustart = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(Spracherkennung.class);
        registerPlugin(Hintergrund.class);   // eigenes Plugin (whisper.cpp), kommt nicht über npm
        super.onCreate(savedInstanceState);
        // 12.11.2026: Android beendete auf der Testfahrt den WebView-Renderer (Speicher knapp, Bubble Log vorne).
        // Ohne Renderer stand die App still, bis man sie öffnete. Jetzt: Activity neu aufbauen, die App verbindet
        // sich beim Start selbst wieder (höchstens einmal pro Minute, damit es keine Schleife wird).
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                Log.w("StickyApp", "WebView-Renderer weg (Absturz: " + detail.didCrash() + "), baue neu auf");
                long jetzt = SystemClock.elapsedRealtime();
                if (jetzt - letzterNeustart > 60000) {
                    letzterNeustart = jetzt;
                    runOnUiThread(MainActivity.this::recreate);
                }
                return true;   // App nicht abstürzen lassen
            }
        });
        // 13.11.2026: Mit Bubble Log im Vordergrund lief die Sticky-App nicht weiter (Fahrt 08:20–08:36): kein Zuhören nach
        // dem Wiederverbinden, Diktate erst beim Öffnen verarbeitet, ohne Ort. Renderer bleibt wichtig, auch unsichtbar.
        if (Build.VERSION.SDK_INT >= 26) bridge.getWebView().setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
    }

    /** Nach dem Pausieren durch Activity/Capacitor die WebView gleich wieder laufen lassen (der StickyDienst hält den Prozess) */
    private void wachHalten() {
        WebView w = bridge != null ? bridge.getWebView() : null;
        if (w == null) return;
        w.onResume();
        w.resumeTimers();
    }

    @Override
    public void onPause() {
        super.onPause();
        wachHalten();
    }

    @Override
    public void onStop() {
        super.onStop();
        wachHalten();
    }
}
