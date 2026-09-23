package com.brainwires.t3code;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import dev.denext.ota.DenextOta;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // denext over-the-air UI: registers the DenextOta plugin and picks the UI to start
        // from. It must run before super.onCreate, which builds the bridge.
        DenextOta.prepare(this, bridgeBuilder);
        super.onCreate(savedInstanceState);
    }
}
