package app.sticky.zwilling;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

// Benachrichtigungen ans Sticky (Markus, 14.11.2026, Test): Android reicht Benachrichtigungen nur an einen
// NotificationListenerService weiter, den der Nutzer selbst freigibt (Einstellungen → Benachrichtigungszugriff).
// Sparsam: nur Apps aus der Positivliste, keine dauerhaften (Dienst-)Meldungen, nichts wird gespeichert – Titel und
// Text gehen nur an die App (Hintergrund-Plugin), die sie auf den verbundenen Sticky schickt.
public class Melder extends NotificationListenerService {
    private static final String TAG = "StickyApp";
    /** Positivliste: zum Testen die Sticky-App selbst, Bubble Log später */
    static final Set<String> ERLAUBT = new HashSet<>(Arrays.asList("app.sticky.zwilling"));

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !ERLAUBT.contains(sbn.getPackageName()) || sbn.isOngoing()) return;
        Notification n = sbn.getNotification();
        if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle x = n.extras;
        CharSequence titel = x != null ? x.getCharSequence(Notification.EXTRA_TITLE) : null;
        CharSequence text = x != null ? x.getCharSequence(Notification.EXTRA_TEXT) : null;
        if (titel == null && text == null) return;
        Log.i(TAG, "Benachrichtigung von " + sbn.getPackageName());
        Hintergrund.benachrichtigung(sbn.getPackageName(), titel != null ? titel.toString() : "", text != null ? text.toString() : "");
    }
}
