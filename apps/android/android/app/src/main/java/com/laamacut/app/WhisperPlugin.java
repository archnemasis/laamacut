package com.laamacut.app;

import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;

/**
 * Auto captions with whisper.cpp running natively (see app/src/main/cpp),
 * much faster than the web view's WebAssembly copy. The web side sends the
 * clip's sound as 16 kHz mono 16-bit samples in chunks (begin, append), then
 * asks for the transcript; segments come back in the same shape the web
 * worker gives.
 */
@CapacitorPlugin(name = "LaamacutWhisper")
public class WhisperPlugin extends Plugin {
    private static final String TAG = "LaamacutWhisper";
    private static final String MODEL_ASSET = "whisper/ggml-tiny-q5_1.bin";

    private static boolean loaded;
    private static String loadError;

    static {
        try {
            System.loadLibrary(supportsFp16() ? "laamacut_whisper_fp16" : "laamacut_whisper");
            loaded = true;
        } catch (UnsatisfiedLinkError e) {
            loadError = e.getMessage();
            Log.w(TAG, "Native captions unavailable", e);
        }
    }

    private static native long nativeInit(String modelPath);
    private static native void nativeFree(long context);
    private native byte[] nativeTranscribe(long context, float[] samples, String language, boolean translate);

    private long context;
    private boolean busy;

    /** The faster library needs the half-precision and dot-product instructions newer phones have. */
    private static boolean supportsFp16() {
        try (BufferedReader reader = new BufferedReader(new FileReader("/proc/cpuinfo"))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("Features") && line.contains("fphp") && line.contains("asimddp")) return true;
            }
        } catch (IOException ignored) {
            // Fall back to the baseline library.
        }
        return false;
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", loaded);
        if (loadError != null) result.put("reason", loadError);
        call.resolve(result);
    }

    /** Start a new recording of samples to transcribe. */
    @PluginMethod
    public void begin(PluginCall call) {
        File file = audioFile();
        if (file.exists() && !file.delete()) {
            call.reject("Could not clear the previous audio");
            return;
        }
        call.resolve();
    }

    /** Add base64 16-bit little-endian samples. */
    @PluginMethod
    public void append(PluginCall call) {
        try (OutputStream out = new FileOutputStream(audioFile(), true)) {
            out.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            call.resolve();
        } catch (IOException e) {
            call.reject(e.getMessage(), e);
        }
    }

    /** { language?: whisper code, task?: "transcribe" | "translate" } → { text, chunks: [{ text, timestamp: [start, end] }] } */
    @PluginMethod
    public void transcribe(PluginCall call) {
        if (!loaded) {
            call.reject("Native captions are not available on this phone");
            return;
        }
        if (busy) {
            call.reject("Captions are already being made");
            return;
        }
        busy = true;
        String language = call.getString("language", "");
        boolean translate = "translate".equals(call.getString("task", "transcribe"));
        getBridge().execute(() -> {
            try {
                if (context == 0) {
                    context = nativeInit(modelFile().getAbsolutePath());
                    if (context == 0) throw new IOException("The caption model could not be loaded");
                }
                float[] samples = readSamples(audioFile());
                if (samples.length == 0) throw new IOException("The clip has no sound");
                long started = System.currentTimeMillis();
                byte[] json = nativeTranscribe(context, samples, language == null ? "" : language, translate);
                if (json == null) throw new IOException("Whisper could not transcribe this clip");
                Log.i(TAG, String.format("%.1f s of audio in %.1f s",
                    samples.length / 16000.0, (System.currentTimeMillis() - started) / 1000.0));
                call.resolve(toResult(new JSONObject(new String(json, StandardCharsets.UTF_8))));
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Captions failed", e);
            } finally {
                busy = false;
                audioFile().delete();
            }
        });
    }

    /** Called from native code as whisper works through the audio (0-100). */
    @SuppressWarnings("unused")
    private void onNativeProgress(int percent) {
        JSObject event = new JSObject();
        event.put("progress", percent / 100.0);
        notifyListeners("progress", event);
    }

    private static JSObject toResult(JSONObject raw) throws Exception {
        JSArray chunks = new JSArray();
        JSONArray segments = raw.getJSONArray("chunks");
        for (int i = 0; i < segments.length(); i++) {
            JSONObject segment = segments.getJSONObject(i);
            JSArray timestamp = new JSArray();
            timestamp.put(segment.getDouble("start"));
            timestamp.put(segment.getDouble("end"));
            JSObject chunk = new JSObject();
            chunk.put("text", segment.getString("text"));
            chunk.put("timestamp", timestamp);
            chunks.put(chunk);
        }
        JSObject result = new JSObject();
        result.put("text", raw.getString("text"));
        result.put("chunks", chunks);
        return result;
    }

    private static float[] readSamples(File file) throws IOException {
        byte[] bytes = new byte[(int) file.length()];
        try (InputStream in = new FileInputStream(file)) {
            int offset = 0;
            while (offset < bytes.length) {
                int read = in.read(bytes, offset, bytes.length - offset);
                if (read < 0) break;
                offset += read;
            }
        }
        ByteBuffer buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        float[] samples = new float[bytes.length / 2];
        for (int i = 0; i < samples.length; i++) samples[i] = buffer.getShort() / 32768f;
        return samples;
    }

    private File audioFile() {
        return new File(getContext().getCacheDir(), "whisper-audio.pcm");
    }

    /** whisper.cpp reads its model from a file, so copy it out of the APK once. */
    private File modelFile() throws IOException {
        File file = new File(getContext().getFilesDir(), "ggml-tiny-q5_1.bin");
        AssetManager assets = getContext().getAssets();
        long expected;
        // Stored uncompressed (noCompress in build.gradle), so its size is known.
        try (AssetFileDescriptor fd = assets.openFd(MODEL_ASSET)) {
            expected = fd.getLength();
        }
        if (file.exists() && file.length() == expected) return file;
        File partial = new File(file.getPath() + ".part");
        try (InputStream in = assets.open(MODEL_ASSET); OutputStream out = new FileOutputStream(partial)) {
            byte[] chunk = new byte[1 << 16];
            int read;
            while ((read = in.read(chunk)) != -1) out.write(chunk, 0, read);
        }
        if (!partial.renameTo(file)) throw new IOException("Could not install the caption model");
        return file;
    }

    @Override
    protected void handleOnDestroy() {
        if (context != 0) nativeFree(context);
        context = 0;
    }
}
