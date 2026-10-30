package com.laamacut.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Saves files the web editor hands over (exports, project files) where people
 * can find them: videos in Movies/Laamacut, everything else in Downloads/Laamacut.
 * The web side streams each file in base64 chunks: begin, append..., finish.
 */
@CapacitorPlugin(name = "LaamacutSaver")
public class SaverPlugin extends Plugin {
    private static final String FOLDER = PrivateAlbum.saveFolder();

    private static class Pending {
        final OutputStream out;
        final Uri uri;
        final String location;

        Pending(OutputStream out, Uri uri, String location) {
            this.out = out;
            this.uri = uri;
            this.location = location;
        }
    }

    private final Map<String, Pending> pending = new HashMap<>();

    @PluginMethod
    public void begin(PluginCall call) {
        String filename = call.getString("filename", "laamacut-export");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        boolean isVideo = mimeType.startsWith("video/");
        String dir = isVideo ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_DOWNLOADS;
        String location = dir + "/" + FOLDER;
        try {
            Pending file;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, location);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri collection = isVideo
                    ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                Uri uri = resolver.insert(collection, values);
                if (uri == null) throw new IOException("Android refused to create " + filename);
                OutputStream out = resolver.openOutputStream(uri);
                if (out == null) throw new IOException("Could not open " + filename);
                file = new Pending(out, uri, location);
            } else {
                // Older Android: the app's own folder needs no storage permission.
                File folder = new File(getContext().getExternalFilesDir(dir), FOLDER);
                if (!folder.exists() && !folder.mkdirs()) throw new IOException("Could not create " + folder);
                File target = new File(folder, filename);
                file = new Pending(new FileOutputStream(target), null, folder.getAbsolutePath());
            }
            String id = UUID.randomUUID().toString();
            synchronized (pending) {
                pending.put(id, file);
            }
            JSObject result = new JSObject();
            result.put("id", id);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void append(PluginCall call) {
        Pending file = get(call);
        if (file == null) return;
        try {
            file.out.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void finish(PluginCall call) {
        Pending file = remove(call);
        if (file == null) return;
        try {
            file.out.close();
            if (file.uri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContext().getContentResolver().update(file.uri, values, null, null);
            }
            JSObject result = new JSObject();
            result.put("location", file.location);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void abort(PluginCall call) {
        Pending file = remove(call);
        if (file == null) return;
        try {
            file.out.close();
        } catch (IOException ignored) {
        }
        if (file.uri != null) getContext().getContentResolver().delete(file.uri, null, null);
        call.resolve();
    }

    private Pending get(PluginCall call) {
        Pending file;
        synchronized (pending) {
            file = pending.get(call.getString("id", ""));
        }
        if (file == null) call.reject("Unknown file");
        return file;
    }

    private Pending remove(PluginCall call) {
        Pending file;
        synchronized (pending) {
            file = pending.remove(call.getString("id", ""));
        }
        if (file == null) call.reject("Unknown file");
        return file;
    }
}
