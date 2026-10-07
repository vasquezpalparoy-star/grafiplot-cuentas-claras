package com.grafiplot.cuentasclaras;

import android.app.KeyguardManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    private static final int UNLOCK = 701;
    private boolean unlocked = false, asking = false;
    private long backgroundAt = 0;
    private final ArrayList<Runnable> success = new ArrayList<>(), failure = new ArrayList<>();
    @Override public void onCreate(Bundle state) {
        registerPlugin(SecureVaultPlugin.class);
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }
    public void withUnlock(Runnable yes, Runnable no) {
        if (unlocked) {yes.run();return;}
        success.add(yes); failure.add(no);
        if (asking) return;
        KeyguardManager manager = (KeyguardManager)getSystemService(KEYGUARD_SERVICE);
        if (!manager.isDeviceSecure()) {finishUnlock(false);return;}
        asking = true;
        getBridge().getWebView().setVisibility(View.INVISIBLE);
        startActivityForResult(manager.createConfirmDeviceCredentialIntent("Grafiplot", "Desbloquea para abrir tus cuentas"), UNLOCK);
    }
    private void finishUnlock(boolean ok) {
        asking = false; unlocked = ok;
        if (getBridge()!=null) getBridge().getWebView().setVisibility(ok ? View.VISIBLE : View.INVISIBLE);
        ArrayList<Runnable> tasks = new ArrayList<>(ok ? success : failure); success.clear();failure.clear();
        for (Runnable action : tasks) action.run();
        if (!ok) finish();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == UNLOCK) finishUnlock(result == RESULT_OK);
    }
    @Override public void onPause() {super.onPause();if (!asking) backgroundAt = android.os.SystemClock.elapsedRealtime();}
    @Override public void onResume() {
        super.onResume();
        if (!asking && backgroundAt > 0 && android.os.SystemClock.elapsedRealtime()-backgroundAt > 30000) {
            unlocked=false; withUnlock(() -> {}, () -> {});
        }
    }
}
