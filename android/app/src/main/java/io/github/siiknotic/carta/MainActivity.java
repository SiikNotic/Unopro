package io.github.siiknotic.carta;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // In-app updates from the project's GitHub Releases (see AppUpdaterPlugin) — only in the direct APK.
        // The Google Play build never registers it: Play apps are updated by Google Play only.
        if (!"play".equals(BuildConfig.FLAVOR)) registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
