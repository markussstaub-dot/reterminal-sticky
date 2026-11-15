package app.sticky.zwilling;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

// Benachrichtigungen ans Sticky (Markus, 14.11.2026): Android reicht Benachrichtigungen nur an einen
// NotificationListenerService weiter, den der Nutzer selbst freigibt (Einstellungen → Benachrichtigungszugriff).
// Sparsam: nur Apps aus der Positivliste, keine dauerhaften (Dienst-)Meldungen. Titel, App-Name und Schlüssel gehen nur
// an die App (Hintergrund-Plugin), die sie auf den verbundenen Sticky schickt. Seit 15.11.2026 (SPEC „Die drei
// naheliegenden“, A) stellt die App die Positivliste ein, und Wegwischen am Handy wird gemeldet (dann verschwindet die
// Meldung auch von der Home-Karte des Sticky).
public class Melder extends NotificationListenerService {
    private static final String TAG = "StickyApp";
    static final String PREFS = "sticky.melder", SCHLUESSEL = "pakete";
    /** Vorgabe, bis die App eine Liste schickt */
    static final Set<String> STANDARD = new HashSet<>(Arrays.asList("app.sticky.zwilling", "app.bubblelog.microlino"));
    private static volatile Set<String> erlaubt = null;

    static void setzeErlaubt(Context c, Set<String> pakete) {
        erlaubt = new HashSet<>(pakete);
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet(SCHLUESSEL, erlaubt).apply();
    }

    private Set<String> erlaubt() {
        Set<String> e = erlaubt;
        if (e == null) {
            SharedPreferences p = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            e = erlaubt = new HashSet<>(p.getStringSet(SCHLUESSEL, STANDARD));
        }
        return e;
    }

    private String appName(String paket) {
        try {
            PackageManager pm = getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(paket, 0)).toString();
        } catch (Exception ex) {
            return paket;
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !erlaubt().contains(sbn.getPackageName()) || sbn.isOngoing()) return;
        Notification n = sbn.getNotification();
        if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle x = n.extras;
        CharSequence titel = x != null ? x.getCharSequence(Notification.EXTRA_TITLE) : null;
        CharSequence text = x != null ? x.getCharSequence(Notification.EXTRA_TEXT) : null;
        if (titel == null && text == null) return;
        Log.i(TAG, "Benachrichtigung von " + sbn.getPackageName());
        Hintergrund.benachrichtigung(sbn.getPackageName(), appName(sbn.getPackageName()), sbn.getKey(),
                titel != null ? titel.toString() : "", text != null ? text.toString() : "");
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (sbn == null || !erlaubt().contains(sbn.getPackageName())) return;
        Hintergrund.benachrichtigungWeg(sbn.getKey());
    }
}
