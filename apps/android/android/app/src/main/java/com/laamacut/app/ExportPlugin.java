package com.laamacut.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.graphics.Bitmap;
import android.Manifest;
import android.content.pm.PackageManager;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.util.Pair;

import androidx.annotation.OptIn;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.media3.common.C;
import androidx.media3.common.Effect;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.ChannelMixingAudioProcessor;
import androidx.media3.common.audio.ChannelMixingMatrix;
import androidx.media3.common.audio.SpeedProvider;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.effect.BitmapOverlay;
import androidx.media3.effect.FrameDropEffect;
import androidx.media3.effect.OverlayEffect;
import androidx.media3.effect.Presentation;
import androidx.media3.effect.TextureOverlay;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.DefaultEncoderFactory;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.EditedMediaItemSequence;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.ProgressHolder;
import androidx.media3.transformer.Transformer;
import androidx.media3.transformer.VideoEncoderSettings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.collect.ImmutableList;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * CapCut-style export: the phone's own decoders, GPU and encoder put the
 * video together (Media3 Transformer), so frames never pass through the web
 * view. The web side sends a plan of the main track, extra audio tracks and
 * pre-drawn text pictures; the result is saved to Movies/Laamacut.
 */
@CapacitorPlugin(name = "LaamacutExport")
public class ExportPlugin extends Plugin {
    private static final String TAG = "LaamacutExport";
    private static final String FOLDER = PrivateAlbum.saveFolder();

    private final Handler main = new Handler(Looper.getMainLooper());
    private Transformer running;
    private Runnable progressPoll;
    private int notifiedPercent = -1;

    /** Start a file in the export's working folder (photos and music the web side holds). */
    @PluginMethod
    public void stageBegin(PluginCall call) {
        File dir = workDir();
        if (dir == null) {
            call.reject("Could not create the export folder");
            return;
        }
        File file = new File(dir, UUID.randomUUID() + "." + call.getString("ext", "bin"));
        JSObject result = new JSObject();
        result.put("uri", Uri.fromFile(file).toString());
        call.resolve(result);
    }

    /** Add a base64 chunk to a staged file. */
    @PluginMethod
    public void stageAppend(PluginCall call) {
        String path = Uri.parse(call.getString("uri", "")).getPath();
        if (path == null) {
            call.reject("Missing uri");
            return;
        }
        try (OutputStream out = new FileOutputStream(path, true)) {
            out.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            call.resolve();
        } catch (IOException e) {
            call.reject(e.getMessage(), e);
        }
    }

    @OptIn(markerClass = UnstableApi.class)
    @PluginMethod
    public void export(PluginCall call) {
        if (running != null) {
            call.reject("An export is already running");
            return;
        }
        File dir = workDir();
        if (dir == null) {
            call.reject("Could not create the export folder");
            return;
        }
        File output = new File(dir, UUID.randomUUID() + ".mp4");
        call.setKeepAlive(true);
        askForNotifications();
        ExportService.start(getContext());
        // Building the plan decodes the text pictures and reads clip sizes; keep that off the UI thread.
        getBridge().execute(() -> prepare(call, output, canPassThrough(call)));
    }

    private void prepare(PluginCall call, File output, boolean passthrough) {
        Composition composition;
        int bitrate = call.getInt("bitrate", 12_000_000);
        try {
            composition = buildComposition(call, passthrough);
        } catch (Exception e) {
            finishCall(call, null, e);
            return;
        }
        main.post(() -> start(call, composition, bitrate, output, passthrough));
    }

    /**
     * One untouched video that already has the project's size and frame rate
     * is copied without re-encoding: faster, and no quality loss.
     */
    private boolean canPassThrough(PluginCall call) {
        String blocker = passThroughBlocker(call);
        Log.i(TAG, blocker == null ? "copying the clip without re-encoding" : "re-encoding: " + blocker);
        return blocker == null;
    }

    /** Why the clip has to be re-encoded, or null when it can be copied as it is. */
    private String passThroughBlocker(PluginCall call) {
        try {
            JSONArray clips = call.getArray("main", new JSArray());
            if (clips.length() != 1) return clips.length() + " clips";
            if (call.getArray("overlays", new JSArray()).length() > 0) return "text or stickers";
            // Media3 re-encodes the video of any composition with more than one sequence.
            if (call.getArray("audio", new JSArray()).length() > 0) return "extra audio tracks";
            JSONObject clip = clips.getJSONObject(0);
            if (!"video".equals(clip.optString("kind"))) return "not a video";
            if (Math.abs(clip.optDouble("speed", 1) - 1) > 0.001) return "speed changed";
            if (Math.abs(clip.optDouble("volume", 1) - 1) > 0.001) return "volume changed";
            float frameRate = call.getFloat("frameRate", 30f);
            if (clip.optDouble("sourceFrameRate", 0) > frameRate + 0.5) return "frame rate above " + frameRate;
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                retriever.setDataSource(getContext(), Uri.parse(clip.getString("uri")));
                int w = Integer.parseInt(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
                int h = Integer.parseInt(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
                String rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
                if ("90".equals(rotation) || "270".equals(rotation)) {
                    int swap = w;
                    w = h;
                    h = swap;
                }
                int width = call.getInt("width", 1080);
                int height = call.getInt("height", 1920);
                if (w != width || h != height) return w + "x" + h + " clip in a " + width + "x" + height + " export";
                return null;
            } finally {
                retriever.release();
            }
        } catch (Exception e) {
            return "could not read the clip (" + e.getMessage() + ")";
        }
    }

    /**
     * Asked while the export screen opens: Android blocks the prompt once the
     * app is in the background, which is exactly when an export notification matters.
     */
    @PluginMethod
    public void requestNotifications(PluginCall call) {
        main.post(this::askForNotifications);
        call.resolve();
    }

    private void askForNotifications() {
        if (Build.VERSION.SDK_INT < 33 || getActivity() == null) return;
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 41);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        main.post(() -> {
            if (running != null) running.cancel();
            stopPolling();
            running = null;
            ExportService.finish(getContext(), null, null);
            call.resolve();
        });
    }

    @OptIn(markerClass = UnstableApi.class)
    private void start(PluginCall call, Composition composition, int bitrate, File output, boolean passthrough) {
        Transformer.Builder builder = new Transformer.Builder(getContext());
        // Asking for H.264 would force a re-encode of an HEVC phone video.
        if (!passthrough) builder.setVideoMimeType(MimeTypes.VIDEO_H264);
        DefaultEncoderFactory.Builder encoders = new DefaultEncoderFactory.Builder(getContext());
        // Media3 re-encodes any video once encoder settings are requested, so copying must leave them unset.
        if (!passthrough) encoders.setRequestedVideoEncoderSettings(new VideoEncoderSettings.Builder().setBitrate(bitrate).build());
        Transformer transformer = builder
            .setAudioMimeType(MimeTypes.AUDIO_AAC)
            .setEncoderFactory(encoders.build())
            .addListener(new Transformer.Listener() {
                @Override
                public void onCompleted(Composition c, ExportResult result) {
                    Log.i(TAG, "video " + (result.videoEncoderName == null ? "copied" : "encoded with " + result.videoEncoderName));
                    stopPolling();
                    running = null;
                    getBridge().execute(() -> {
                        try {
                            finishCall(call, saveToGallery(output, call.getString("filename", "Laamacut.mp4")), null);
                        } catch (Exception e) {
                            finishCall(call, null, e);
                        } finally {
                            output.delete();
                            clearStaged();
                        }
                    });
                }

                @Override
                public void onError(Composition c, ExportResult result, ExportException error) {
                    stopPolling();
                    running = null;
                    output.delete();
                    if (passthrough) {
                        // Copying didn't work for this file; do the normal export instead.
                        Log.w(TAG, "copying failed, re-encoding instead", error);
                        getBridge().execute(() -> prepare(call, output, false));
                        return;
                    }
                    clearStaged();
                    finishCall(call, null, error);
                }
            })
            .build();
        running = transformer;
        notifiedPercent = -1;
        transformer.start(composition, output.getAbsolutePath());
        ProgressHolder holder = new ProgressHolder();
        progressPoll = new Runnable() {
            @Override
            public void run() {
                if (running != transformer) return;
                if (transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
                    JSObject event = new JSObject();
                    event.put("progress", holder.progress / 100.0);
                    notifyListeners("progress", event);
                    if (holder.progress != notifiedPercent) {
                        notifiedPercent = holder.progress;
                        ExportService.progress(getContext(), holder.progress / 100.0);
                    }
                }
                main.postDelayed(this, 250);
            }
        };
        main.post(progressPoll);
    }

    private void stopPolling() {
        if (progressPoll != null) main.removeCallbacks(progressPoll);
        progressPoll = null;
    }

    private void finishCall(PluginCall call, JSObject result, Exception error) {
        String failure = error == null ? null : error.getMessage() != null ? error.getMessage() : "Export failed";
        ExportService.finish(getContext(), result != null ? result.getString("uri") : null, failure);
        if (error != null) call.reject(error.getMessage() != null ? error.getMessage() : "Export failed", error);
        else call.resolve(result);
        call.setKeepAlive(false);
    }

    @OptIn(markerClass = UnstableApi.class)
    private Composition buildComposition(PluginCall call, boolean passthrough) throws Exception {
        int width = call.getInt("width", 1080);
        int height = call.getInt("height", 1920);
        float frameRate = call.getFloat("frameRate", 30f);

        List<EditedMediaItem> mainItems = new ArrayList<>();
        JSONArray mainClips = call.getArray("main", new JSArray());
        for (int i = 0; i < mainClips.length(); i++) {
            JSONObject clip = mainClips.getJSONObject(i);
            mainItems.add(buildItem(clip, width, height, frameRate, false, passthrough));
        }
        if (mainItems.isEmpty()) throw new IllegalArgumentException("Nothing to export");

        List<EditedMediaItemSequence> sequences = new ArrayList<>();
        sequences.add(new EditedMediaItemSequence(mainItems));

        JSONArray audioTracks = call.getArray("audio", new JSArray());
        for (int t = 0; t < audioTracks.length(); t++) {
            JSONArray clips = audioTracks.getJSONArray(t);
            EditedMediaItemSequence.Builder sequence = new EditedMediaItemSequence.Builder();
            int added = 0;
            for (int i = 0; i < clips.length(); i++) {
                JSONObject clip = clips.getJSONObject(i);
                long gapUs = clip.optLong("gapBeforeUs", 0);
                if (gapUs > 0) sequence.addGap(gapUs);
                sequence.addItem(buildItem(clip, width, height, frameRate, true, false));
                added++;
            }
            if (added > 0) sequences.add(sequence.build());
        }

        Composition.Builder composition = new Composition.Builder(sequences)
            // Photos have no sound; keep one continuous audio track anyway.
            .experimentalSetForceAudioTrack(true);
        List<Effect> videoEffects = new ArrayList<>();
        JSONArray overlays = call.getArray("overlays", new JSArray());
        if (overlays.length() > 0) {
            videoEffects.add(new OverlayEffect(ImmutableList.<TextureOverlay>of(new TimedOverlay(overlays, width, height))));
        }
        if (!videoEffects.isEmpty()) composition.setEffects(new Effects(ImmutableList.of(), videoEffects));
        return composition.build();
    }

    @OptIn(markerClass = UnstableApi.class)
    private EditedMediaItem buildItem(JSONObject clip, int width, int height, float frameRate, boolean audioOnly, boolean passthrough) throws Exception {
        Uri uri = Uri.parse(clip.getString("uri"));
        boolean image = "image".equals(clip.optString("kind"));
        long inUs = clip.optLong("inUs", 0);
        long outUs = clip.optLong("outUs", C.TIME_END_OF_SOURCE);
        long durationUs = clip.optLong("durationUs", 0);
        float speed = (float) clip.optDouble("speed", 1);
        float volume = (float) clip.optDouble("volume", 1);

        MediaItem.Builder media = new MediaItem.Builder().setUri(uri);
        if (image) {
            media.setMimeType(clip.optString("mime", MimeTypes.IMAGE_JPEG));
            media.setImageDurationMs(Math.max(1, durationUs / 1000));
        } else {
            media.setClippingConfiguration(new MediaItem.ClippingConfiguration.Builder()
                .setStartPositionUs(inUs)
                .setEndPositionUs(outUs)
                .build());
        }

        List<AudioProcessor> audio = new ArrayList<>();
        List<Effect> video = new ArrayList<>();
        if (!image && Math.abs(speed - 1f) > 0.001f) {
            Pair<AudioProcessor, Effect> change = Effects.createExperimentalSpeedChangingEffect(new ConstantSpeed(speed));
            audio.add(change.first);
            video.add(change.second);
        }
        if (Math.abs(volume - 1f) > 0.001f) {
            ChannelMixingAudioProcessor mixer = new ChannelMixingAudioProcessor();
            mixer.putChannelMixingMatrix(ChannelMixingMatrix.create(1, 2).scaleBy(volume));
            mixer.putChannelMixingMatrix(ChannelMixingMatrix.create(2, 2).scaleBy(volume));
            audio.add(mixer);
        }
        if (!audioOnly && !passthrough) {
            // Fit inside the project's frame with black bars, like the editor's default.
            video.add(Presentation.createForWidthAndHeight(width, height, Presentation.LAYOUT_SCALE_TO_FIT));
            if (!image && clip.optDouble("sourceFrameRate", 0) > frameRate + 0.5) {
                video.add(FrameDropEffect.createDefaultFrameDropEffect(frameRate));
            }
        }

        EditedMediaItem.Builder item = new EditedMediaItem.Builder(media.build())
            .setEffects(new Effects(audio, video))
            .setRemoveVideo(audioOnly);
        if (image) item.setDurationUs(durationUs).setFrameRate(Math.round(frameRate));
        return item.build();
    }

    /** Copy the finished file into Movies/Laamacut, where the gallery shows it. */
    private JSObject saveToGallery(File file, String filename) throws IOException {
        String location = Environment.DIRECTORY_MOVIES + "/" + FOLDER;
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, location);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values);
            if (uri == null) throw new IOException("Android refused to create " + filename);
            try (InputStream in = new FileInputStream(file); OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("Could not open " + filename);
                copy(in, out);
            }
            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            result.put("uri", uri.toString());
        } else {
            File folder = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_MOVIES), FOLDER);
            if (!folder.exists() && !folder.mkdirs()) throw new IOException("Could not create " + folder);
            File target = new File(folder, filename);
            try (InputStream in = new FileInputStream(file); OutputStream out = new FileOutputStream(target)) {
                copy(in, out);
            }
            location = folder.getAbsolutePath();
            result.put("uri", Uri.fromFile(target).toString());
        }
        result.put("location", location);
        return result;
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[1 << 16];
        int read;
        while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
    }

    private File workDir() {
        File dir = new File(getContext().getCacheDir(), "native-export");
        return dir.exists() || dir.mkdirs() ? dir : null;
    }

    private void clearStaged() {
        File dir = workDir();
        File[] files = dir == null ? null : dir.listFiles();
        if (files != null) for (File f : files) f.delete();
    }

    @OptIn(markerClass = UnstableApi.class)
    private static final class ConstantSpeed implements SpeedProvider {
        private final float speed;

        ConstantSpeed(float speed) {
            this.speed = speed;
        }

        @Override
        public float getSpeed(long timeUs) {
            return speed;
        }

        @Override
        public long getNextSpeedChangeTimeUs(long timeUs) {
            return C.TIME_UNSET;
        }
    }

    /** The text drawn by the web side: one full-frame picture per stretch of time. */
    @OptIn(markerClass = UnstableApi.class)
    private static final class TimedOverlay extends BitmapOverlay {
        private final long[] starts;
        private final long[] ends;
        private final Bitmap[] pictures;
        private final Bitmap empty;

        TimedOverlay(JSONArray overlays, int width, int height) throws Exception {
            int n = overlays.length();
            starts = new long[n];
            ends = new long[n];
            pictures = new Bitmap[n];
            for (int i = 0; i < n; i++) {
                JSONObject overlay = overlays.getJSONObject(i);
                starts[i] = overlay.getLong("startUs");
                ends[i] = overlay.getLong("endUs");
                byte[] png = Base64.decode(overlay.getString("png"), Base64.DEFAULT);
                pictures[i] = BitmapFactory.decodeByteArray(png, 0, png.length);
            }
            empty = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        }

        @Override
        public Bitmap getBitmap(long presentationTimeUs) {
            for (int i = 0; i < pictures.length; i++) {
                if (presentationTimeUs >= starts[i] && presentationTimeUs < ends[i] && pictures[i] != null) return pictures[i];
            }
            return empty;
        }
    }
}
