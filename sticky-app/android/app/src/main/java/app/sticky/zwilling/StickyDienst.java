package app.sticky.zwilling;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

// Vordergrund-Dienst, solange der Sticky verbunden ist. Ohne ihn friert Android die App ein, sobald eine andere
// (z. B. Bubble Log mit Wakelock) im Vordergrund ist: Testfahrt 11.11.2026, Bluetooth-Meldungen stauten sich
// 8 Minuten und kamen erst beim Öffnen an. Typ „connectedDevice|location“: BLE-Gerät + GPS-Stempel im Hintergrund.
public class StickyDienst extends Service {
    static final String KANAL = "sticky";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(KANAL) == null) {
            NotificationChannel k = new NotificationChannel(KANAL, "Sticky verbunden", NotificationManager.IMPORTANCE_LOW);
            k.setShowBadge(false);
            nm.createNotificationChannel(k);
        }
        Intent oeffnen = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, oeffnen, PendingIntent.FLAG_IMMUTABLE);
        String text = intent != null && intent.getStringExtra("text") != null ? intent.getStringExtra("text") : "Notizen und Diktate kommen an";
        Notification n = new Notification.Builder(this, KANAL)
                .setContentTitle("Sticky verbunden")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE | ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(1, n);
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
