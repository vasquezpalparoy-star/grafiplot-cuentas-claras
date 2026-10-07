package com.grafiplot.cuentasclaras;

import android.content.Context;
import android.content.Intent;
import android.app.Activity;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.OutputStream;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "SecureVault")
public class SecureVaultPlugin extends Plugin {
    private static final String ALIAS = "grafiplot.vault.v1";
    private SharedPreferences prefs() {return getContext().getSharedPreferences("grafiplot_vault", Context.MODE_PRIVATE);}
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    private void unlocked(PluginCall call, Runnable action) {
        getActivity().runOnUiThread(() -> ((MainActivity)getActivity()).withUnlock(action, () -> call.reject("Desbloquea el celular con tu PIN para acceder a tus cuentas.")));
    }
    @PluginMethod public void get(PluginCall call) {unlocked(call, () -> {
        try {
            String value = prefs().getString(call.getString("key"), null);
            JSObject result = new JSObject();
            if (value == null) {result.put("value", JSObject.NULL);} else {
                String[] parts = value.split(":");
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                cipher.updateAAD(call.getString("key").getBytes(StandardCharsets.UTF_8));
                result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            }
            call.resolve(result);
        } catch (Exception e) {call.reject("No se pudo abrir la copia cifrada.");}
    });}
    @PluginMethod public void set(PluginCall call) {unlocked(call, () -> {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
            cipher.updateAAD(call.getString("key").getBytes(StandardCharsets.UTF_8));
            byte[] data = cipher.doFinal(call.getString("value").getBytes(StandardCharsets.UTF_8));
            String encoded = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(data, Base64.NO_WRAP);
            if (!prefs().edit().putString(call.getString("key"), encoded).commit()) throw new Exception();
            call.resolve();
        } catch (Exception e) {call.reject("No se pudo guardar en el celular. Libera espacio y reintenta.");}
    });}
    @PluginMethod public void remove(PluginCall call) {unlocked(call, () -> {
        if (prefs().edit().remove(call.getString("key")).commit()) call.resolve(); else call.reject("No se pudo borrar la copia local.");
    });}

    @PluginMethod public void exportFile(PluginCall call) {unlocked(call, () -> {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "grafiplot.json"));
        startActivityForResult(call, intent, "exportResult");
    });}
    @ActivityCallback private void exportResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {call.reject("Exportación cancelada.");return;}
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(result.getData().getData())) {
            if (stream == null) throw new Exception();
            stream.write(Base64.decode(call.getString("base64"), Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) {call.reject("No se pudo guardar el respaldo.");}
    }
}
