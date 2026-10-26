package com.laamacut.app;

import android.content.Context;
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

/**
 * Keeps API keys (the ElevenLabs key for text to speech) encrypted with an
 * Android Keystore key. That key lives in the phone's secure hardware where
 * available and can never be read out, not even by this app, so the stored
 * text is useless on its own.
 */
@CapacitorPlugin(name = "LaamacutSecrets")
public class SecretsPlugin extends Plugin {
    private static final String KEY_ALIAS = "laamacut-secrets";
    private static final String PREFS = "laamacut-secrets";

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String name = call.getString("name");
        String value = call.getString("value");
        if (name == null || value == null) {
            call.reject("name and value are required");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] data = cipher.doFinal(value.getBytes("UTF-8"));
            String stored = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(data, Base64.NO_WRAP);
            prefs().edit().putString(name, stored).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't store the key securely", e);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String name = call.getString("name");
        String stored = name == null ? null : prefs().getString(name, null);
        JSObject out = new JSObject();
        if (stored == null) {
            call.resolve(out);
            return;
        }
        try {
            String[] parts = stored.split(":");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            out.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), "UTF-8"));
            call.resolve(out);
        } catch (Exception e) {
            // The Keystore key is gone (for example after a restore): treat it as no key saved.
            prefs().edit().remove(name).apply();
            call.resolve(out);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String name = call.getString("name");
        if (name != null) prefs().edit().remove(name).apply();
        call.resolve();
    }
}
