package app.sticky.zwilling;

import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.ShortBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// Spracherkennung Stufe 1 (auf dem Handy, offline) mit whisper.cpp. Modelle liegen nicht in der APK, sondern in
// files/modelle/ (einmalig per adb push, siehe STAND.md). Ein Modell bleibt geladen, bis ein anderes verlangt wird.
@CapacitorPlugin(name = "Spracherkennung")
public class Spracherkennung extends Plugin {
    static { System.loadLibrary("sticky_whisper"); }

    static native long nativeLaden(String pfad);
    static native void nativeFreigeben(long ctx);
    static native String nativeErkennen(long ctx, float[] samples, int threads, String sprache, int audioCtx);
    static native String nativeSystem();

    private final ExecutorService arbeiter = Executors.newSingleThreadExecutor();
    private long ctx = 0;
    private String geladen = null;

    private File modellOrdner() { return new File(getContext().getFilesDir(), "modelle"); }

    /** Welche Modelle liegen auf dem Gerät? { modelle: [{name, bytes}], geladen, system } */
    @PluginMethod
    public void status(PluginCall call) {
        JSArray liste = new JSArray();
        File[] dateien = modellOrdner().listFiles();
        if (dateien != null) for (File f : dateien) {
            if (!f.getName().endsWith(".bin")) continue;
            JSObject m = new JSObject();
            m.put("name", f.getName());
            m.put("bytes", f.length());
            liste.put(m);
        }
        JSObject r = new JSObject();
        r.put("modelle", liste);
        r.put("geladen", geladen);
        r.put("ordner", modellOrdner().getAbsolutePath());
        r.put("system", nativeSystem());
        call.resolve(r);
    }

    /** pcm: Base64 von 16-bit-PCM mono 16 kHz; modell: Dateiname; threads (Standard 6) → { text, ms, ladeMs } */
    @PluginMethod
    public void erkennen(PluginCall call) {
        String pcm = call.getString("pcm");
        String modell = call.getString("modell", "ggml-small-q5_1.bin");
        int threads = call.getInt("threads", 6);
        String sprache = call.getString("sprache", "de");
        boolean kurz = call.getBoolean("kurz", true);   // Encoder-Fenster kürzen (schneller bei kurzen Aufnahmen)
        if (pcm == null) { call.reject("pcm fehlt"); return; }
        arbeiter.execute(() -> {
            try {
                long ladeMs = 0;
                if (ctx == 0 || !modell.equals(geladen)) {
                    File f = new File(modellOrdner(), modell);
                    if (!f.exists()) { call.reject("Modell fehlt: " + f.getAbsolutePath(), "KEIN_MODELL"); return; }
                    if (ctx != 0) nativeFreigeben(ctx);
                    long t = System.currentTimeMillis();
                    ctx = nativeLaden(f.getAbsolutePath());
                    ladeMs = System.currentTimeMillis() - t;
                    geladen = ctx != 0 ? modell : null;
                    if (ctx == 0) { call.reject("Modell nicht ladbar: " + modell); return; }
                }
                byte[] roh = Base64.decode(pcm, Base64.DEFAULT);
                ShortBuffer sb = ByteBuffer.wrap(roh).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer();
                float[] samples = new float[sb.remaining()];
                for (int i = 0; i < samples.length; i++) samples[i] = sb.get(i) / 32768f;
                long t0 = System.currentTimeMillis();
                int audioCtx = kurz ? Math.min(1500, samples.length / 320 + 64) : 0;
                String text = nativeErkennen(ctx, samples, threads, sprache, audioCtx);
                JSObject r = new JSObject();
                r.put("text", text.trim());
                r.put("ms", System.currentTimeMillis() - t0);
                r.put("ladeMs", ladeMs);
                r.put("modell", modell);
                r.put("threads", threads);
                r.put("audioCtx", audioCtx);
                call.resolve(r);
            } catch (Throwable e) {
                call.reject("Erkennung fehlgeschlagen: " + e.getMessage());
            }
        });
    }

    /** Vorab laden (z. B. beim App-Start), damit die erste Erkennung nicht aufs Laden warten muss */
    @PluginMethod
    public void vorladen(PluginCall call) {
        String modell = call.getString("modell", "ggml-small-q5_1.bin");
        arbeiter.execute(() -> {
            if (ctx != 0 && modell.equals(geladen)) { call.resolve(); return; }
            File f = new File(modellOrdner(), modell);
            if (!f.exists()) { call.reject("Modell fehlt", "KEIN_MODELL"); return; }
            if (ctx != 0) nativeFreigeben(ctx);
            long t = System.currentTimeMillis();
            ctx = nativeLaden(f.getAbsolutePath());
            geladen = ctx != 0 ? modell : null;
            JSObject r = new JSObject();
            r.put("ladeMs", System.currentTimeMillis() - t);
            call.resolve(r);
        });
    }
}
