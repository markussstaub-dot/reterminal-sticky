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
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Looper;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
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
    // Multiclient Stufe 2 (14.11.2026): ein Wecker je bekanntem Sticky (Adressen kommagetrennt aus der App)
    private final Map<String, Wecker> wecker = new HashMap<>();
    private PowerManager.WakeLock wach;

    private void wachHalten(long ms) {
        if (wach == null) {
            wach = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sticky:wecker");
            wach.setReferenceCounted(false);
        }
        wach.acquire(ms);
    }

    // ---- Während der Fahrt wach halten (Testfahrt 12.11.2026 nachmittags) ----------------------------------------
    // Mit Bubble Log im Vordergrund pausierte die WebView, ihr „wach“-Zeitgeber lief nicht, der Sticky schlummerte nach
    // 2 min ein und jedes Diktat landete offline (ohne Ort). Jetzt macht das der Dienst: liest GPS passiv mit (der Dienst
    // ist vom Typ location, darf also im Hintergrund), bei Tempo > 2 m/s bis 10 min danach höchstens alle 45 s WACH
    // (0x1B) über die eigene GATT-Verbindung des Weckers.
    private static final UUID DIENST = UUID.fromString("b1e50001-7374-6963-6b79-7465726d6e6c");
    private static final UUID BEFEHL = UUID.fromString("b1e50002-7374-6963-6b79-7465726d6e6c");
    private static final byte OP_WACH = 0x1b;
    private long fahrtBis = 0;
    private LocationManager orte;
    static volatile Location letzterOrt;

    private final LocationListener ortRuf = new LocationListener() {
        @Override
        public void onLocationChanged(Location o) {
            letzterOrt = o;   // Rückfall für den Ort an Diktaten (Hintergrund.letzterOrt)
            if (o.hasSpeed() && o.getSpeed() > 2) {
                if (System.currentTimeMillis() >= fahrtBis) Log.i(TAG, "Fahrt erkannt (" + o.getSpeed() + " m/s), halte Sticky wach");
                fahrtBis = System.currentTimeMillis() + 10 * 60 * 1000;
            }
            if (System.currentTimeMillis() < fahrtBis) wachSenden();
        }
        @Override public void onStatusChanged(String p, int s, Bundle b) { }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { }
    };

    private void wachSenden() {
        for (Wecker w : wecker.values()) w.wachSenden();
    }

    private void orteEin() {
        if (orte != null) return;
        try {
            orte = getSystemService(LocationManager.class);
            // passiv: liest nur mit, was andere (Bubble Log während der Fahrt) ohnehin anfordern, kostet keinen Strom extra
            orte.requestLocationUpdates(LocationManager.PASSIVE_PROVIDER, 10000, 0, ortRuf, Looper.getMainLooper());
        } catch (SecurityException | IllegalArgumentException e) {
            Log.w(TAG, "Kein GPS im Dienst: " + e.getMessage());
            orte = null;
        }
    }

    private void orteAus() {
        if (orte != null) { orte.removeUpdates(ortRuf); orte = null; }
    }

    /** Eine GATT-Verbindung mit autoConnect je Sticky: meldet „funkt wieder“ an die App und hält ihn bei Fahrt wach */
    private class Wecker extends BluetoothGattCallback {
        final String adresse;
        BluetoothGatt gatt;
        BluetoothGattCharacteristic befehl;
        boolean verbunden;
        long letztesWach = 0;

        Wecker(String adresse) { this.adresse = adresse; }

        void stellen() {
            try {
                BluetoothAdapter a = getSystemService(BluetoothManager.class).getAdapter();
                BluetoothDevice d = a.getRemoteDevice(adresse);
                gatt = d.connectGatt(StickyDienst.this, true, this, BluetoothDevice.TRANSPORT_LE);
                Log.i(TAG, "Wecker gestellt für " + adresse);
            } catch (SecurityException | IllegalArgumentException e) {
                Log.w(TAG, "Wecker nicht möglich für " + adresse + ": " + e.getMessage());
            }
        }

        void aus() {
            if (gatt != null) {
                try { gatt.disconnect(); gatt.close(); } catch (SecurityException e) { /* egal */ }
                gatt = null;
            }
            verbunden = false;
            befehl = null;
        }

        void wachSenden() {
            long jetzt = System.currentTimeMillis();
            if (!verbunden || befehl == null || gatt == null || jetzt - letztesWach < 45000) return;
            try {
                boolean ok;
                if (Build.VERSION.SDK_INT >= 33) {
                    ok = gatt.writeCharacteristic(befehl, new byte[]{OP_WACH}, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE) == 0;
                } else {
                    befehl.setValue(new byte[]{OP_WACH});
                    befehl.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                    ok = gatt.writeCharacteristic(befehl);
                }
                if (ok) letztesWach = jetzt;
                Log.i(TAG, "Wach an " + adresse + ": " + (ok ? "ok" : "fehlgeschlagen"));
            } catch (SecurityException e) {
                Log.w(TAG, "Wach nicht möglich: " + e.getMessage());
            }
        }

        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int neu) {
            boolean da = neu == BluetoothProfile.STATE_CONNECTED;
            Log.i(TAG, "Wecker: Sticky " + adresse + " " + (da ? "funkt" : "weg") + " (status " + status + ")");
            wachHalten(da ? 60000 : 20000);   // Zeit, damit die WebView verbindet bzw. die Trennung verarbeitet
            verbunden = da;
            befehl = null;
            if (da) {
                try { g.discoverServices(); } catch (SecurityException e) { /* egal */ }
            }
            Hintergrund.melde(da, adresse);
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
            BluetoothGattService s = g.getService(DIENST);
            befehl = s != null ? s.getCharacteristic(BEFEHL) : null;
            if (befehl != null && System.currentTimeMillis() < fahrtBis) wachSenden();
        }
    }

    /** Wecker auf genau diese Adressen stellen (kommagetrennt); bekannte bleiben, fehlende gehen aus */
    private void weckerStellen(String adressen) {
        if (adressen == null) return;
        java.util.Set<String> soll = new java.util.HashSet<>();
        for (String a : adressen.split(",")) if (!a.trim().isEmpty()) soll.add(a.trim());
        for (java.util.Iterator<Map.Entry<String, Wecker>> it = wecker.entrySet().iterator(); it.hasNext(); ) {
            Map.Entry<String, Wecker> e = it.next();
            if (!soll.contains(e.getKey())) { e.getValue().aus(); it.remove(); }
        }
        for (String a : soll) {
            if (wecker.containsKey(a)) continue;
            Wecker w = new Wecker(a);
            wecker.put(a, w);
            w.stellen();
        }
    }

    private void weckerAus() {
        for (Wecker w : wecker.values()) w.aus();
        wecker.clear();
    }

    @Override
    public void onDestroy() {
        orteAus();
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
        orteEin();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
