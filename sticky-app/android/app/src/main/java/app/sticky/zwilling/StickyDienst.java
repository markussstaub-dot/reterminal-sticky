package app.sticky.zwilling;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

// Vordergrund-Dienst, solange der Sticky verbunden ist. Ohne ihn friert Android die App ein, sobald eine andere
// (z. B. Bubble Log mit Wakelock) im Vordergrund ist: Testfahrt 11.11.2026, Bluetooth-Meldungen stauten sich
// 8 Minuten und kamen erst beim Öffnen an. Typ „connectedDevice|location“: BLE-Gerät + GPS-Stempel im Hintergrund.
//
// Wecker (12.11.2026, Rückfahrt 11:05–11:20): Im Doze schläft die CPU trotz Vordergrund-Dienst, die Zeitgeber der
// WebView standen 15 min still, die App versuchte gar nicht mehr zu verbinden. Jetzt hält der Dienst eine eigene
// GATT-Verbindung mit autoConnect = true: Der Bluetooth-Stack verbindet von selbst, sobald der Sticky wieder funkt
// (Taste, volle Stunde), und weckt dabei die App. Dann kurz Wakelock und Ereignis an die App, die sich sofort verbindet.
public class StickyDienst extends Service {
    static final String KANAL = "sticky";
    private static final String TAG = "StickyApp";
    private BluetoothGatt wecker;
    private String weckerAdresse;
    private PowerManager.WakeLock wach;

    private void wachHalten(long ms) {
        if (wach == null) {
            wach = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sticky:wecker");
            wach.setReferenceCounted(false);
        }
        wach.acquire(ms);
    }

    private final BluetoothGattCallback weckerRuf = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int neu) {
            boolean da = neu == BluetoothProfile.STATE_CONNECTED;
            Log.i(TAG, "Wecker: Sticky " + (da ? "funkt" : "weg") + " (status " + status + ")");
            wachHalten(da ? 60000 : 20000);   // Zeit, damit die WebView verbindet bzw. die Trennung verarbeitet
            Hintergrund.melde(da);
        }
    };

    private void weckerStellen(String adresse) {
        if (adresse == null || adresse.equals(weckerAdresse) && wecker != null) return;
        weckerAus();
        try {
            BluetoothAdapter a = getSystemService(BluetoothManager.class).getAdapter();
            BluetoothDevice d = a.getRemoteDevice(adresse);
            wecker = d.connectGatt(this, true, weckerRuf, BluetoothDevice.TRANSPORT_LE);
            weckerAdresse = adresse;
            Log.i(TAG, "Wecker gestellt für " + adresse);
        } catch (SecurityException | IllegalArgumentException e) {
            Log.w(TAG, "Wecker nicht möglich: " + e.getMessage());
        }
    }

    private void weckerAus() {
        if (wecker != null) {
            try { wecker.disconnect(); wecker.close(); } catch (SecurityException e) { /* egal */ }
            wecker = null;
        }
        weckerAdresse = null;
    }

    @Override
    public void onDestroy() {
        weckerAus();
        if (wach != null && wach.isHeld()) wach.release();
        super.onDestroy();
    }

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
        if (intent != null) weckerStellen(intent.getStringExtra("adresse"));
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
