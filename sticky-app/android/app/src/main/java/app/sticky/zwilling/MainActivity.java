package app.sticky.zwilling;

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
    }
}
