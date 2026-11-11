package app.sticky.zwilling;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(Spracherkennung.class);
        registerPlugin(Hintergrund.class);   // eigenes Plugin (whisper.cpp), kommt nicht über npm
        super.onCreate(savedInstanceState);
    }
}
