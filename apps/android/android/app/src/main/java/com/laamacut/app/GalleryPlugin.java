package com.laamacut.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import androidx.annotation.OptIn;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.common.Effect;
import androidx.media3.effect.FrameDropEffect;
import androidx.media3.effect.Presentation;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.DefaultEncoderFactory;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.Transformer;
import androidx.media3.transformer.VideoEncoderSettings;

import com.google.common.collect.ImmutableList;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.UUID;

/**
 * Lists the phone's videos and photos for the in-app picker, like CapCut.
 * Asks for gallery permission first; the web side loads the files through
 * Capacitor's content:// bridge and asks here only for small thumbnails.
 */
@CapacitorPlugin(
    name = "LaamacutGallery",
    permissions = {
        @Permission(
            alias = "media",
            strings = {
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_MEDIA_IMAGES,
                "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
            }
        ),
        @Permission(alias = "legacyMedia", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class GalleryPlugin extends Plugin {

    private String alias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "media" : "legacyMedia";
    }

    /** granted, limited (Android 14 "selected photos"), or denied. */
    private String currentAccess() {
        if (getPermissionState(alias()) == PermissionState.GRANTED) return "granted";
        if (Build.VERSION.SDK_INT >= 34
            && getContext().checkSelfPermission("android.permission.READ_MEDIA_VISUAL_USER_SELECTED")
                == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return "limited";
        }
        return "denied";
    }

    @PluginMethod
    public void access(PluginCall call) {
        JSObject result = new JSObject();
        result.put("access", currentAccess());
        call.resolve(result);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (!"denied".equals(currentAccess())) {
            access(call);
            return;
        }
        requestPermissionForAlias(alias(), call, "accessResult");
    }

    @PermissionCallback
    private void accessResult(PluginCall call) {
        access(call);
    }

    @PluginMethod
    public void list(PluginCall call) {
        boolean video = "video".equals(call.getString("kind", "video"));
        int offset = call.getInt("offset", 0);
        int limit = call.getInt("limit", 60);
        Uri collection = video
            ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        String[] projection = video
            ? new String[] {
                MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.MIME_TYPE, MediaStore.MediaColumns.SIZE,
                MediaStore.Video.VideoColumns.DURATION
            }
            : new String[] {
                MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.MIME_TYPE, MediaStore.MediaColumns.SIZE
            };
        JSArray items = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();
        String order = MediaStore.MediaColumns.DATE_ADDED + " DESC";
        try (Cursor cursor = resolver.query(
                collection, projection, PrivateAlbum.selection(), PrivateAlbum.selectionArgs(), order)) {
            if (cursor != null && cursor.moveToPosition(offset)) {
                int count = 0;
                do {
                    long id = cursor.getLong(0);
                    JSObject item = new JSObject();
                    item.put("uri", ContentUris.withAppendedId(collection, id).toString());
                    item.put("name", cursor.getString(1));
                    item.put("mime", cursor.getString(2));
                    item.put("size", cursor.getLong(3));
                    if (video) item.put("duration", cursor.getLong(4) / 1000.0);
                    items.put(item);
                } while (++count < limit && cursor.moveToNext());
            }
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
            return;
        }
        JSObject result = new JSObject();
        result.put("items", items);
        call.resolve(result);
    }

    @PluginMethod
    public void thumbnail(PluginCall call) {
        String uri = call.getString("uri");
        int size = call.getInt("size", 256);
        if (uri == null) {
            call.reject("Missing uri");
            return;
        }
        if (!PrivateAlbum.allows(getContext(), uri)) {
            call.reject("Not in the test album");
            return;
        }
        getBridge().execute(() -> {
            try {
                Bitmap bitmap;
                Uri contentUri = Uri.parse(uri);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    bitmap = getContext().getContentResolver().loadThumbnail(contentUri, new Size(size, size), null);
                } else {
                    long id = ContentUris.parseId(contentUri);
                    bitmap = uri.contains("/video/")
                        ? MediaStore.Video.Thumbnails.getThumbnail(getContext().getContentResolver(), id, MediaStore.Video.Thumbnails.MINI_KIND, null)
                        : MediaStore.Images.Thumbnails.getThumbnail(getContext().getContentResolver(), id, MediaStore.Images.Thumbnails.MINI_KIND, null);
                }
                if (bitmap == null) throw new IllegalStateException("No thumbnail");
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.JPEG, 72, out);
                JSObject result = new JSObject();
                result.put("data", "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                call.resolve(result);
            } catch (Exception e) {
                call.reject(e.getMessage(), e);
            }
        });
    }

    /**
     * What a video is like before anything heavy is done with it: its size as
     * shown (rotation applied) and frame rate, so the editor can decide whether
     * it needs a preview copy at all.
     */
    @PluginMethod
    public void probe(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("Missing uri");
            return;
        }
        if (!PrivateAlbum.allows(getContext(), uri)) {
            call.reject("Not in the test album");
            return;
        }
        getBridge().execute(() -> {
            VideoInfo info = videoInfo(uri);
            if (info == null) {
                call.reject("Could not read the video");
                return;
            }
            JSObject result = new JSObject();
            result.put("width", info.width);
            result.put("height", info.height);
            result.put("fps", info.fps);
            result.put("duration", info.durationMs / 1000.0);
            result.put("videoCodec", info.videoCodec);
            result.put("audioTracks", info.audioTracks);
            result.put("sampleRate", info.sampleRate);
            result.put("channels", info.channels);
            call.resolve(result);
        });
    }

    private static final class VideoInfo {
        final int width;
        final int height;
        float fps;
        long durationMs;
        String videoCodec = "";
        int audioTracks;
        int sampleRate;
        int channels;

        VideoInfo(int width, int height) {
            this.width = width;
            this.height = height;
        }
    }

    /** Size as shown and frame rate (0 when unknown), or null if the video can't be read. */
    private VideoInfo videoInfo(String uri) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        VideoInfo info;
        try {
            retriever.setDataSource(getContext(), Uri.parse(uri));
            int rawWidth = Integer.parseInt(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            int rawHeight = Integer.parseInt(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            String rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
            boolean sideways = rotation != null && (rotation.equals("90") || rotation.equals("270"));
            info = new VideoInfo(sideways ? rawHeight : rawWidth, sideways ? rawWidth : rawHeight);
            String duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            info.durationMs = duration == null ? 0 : Long.parseLong(duration);
            // Frame count over duration catches phones whose files don't say their frame rate.
            String frames = Build.VERSION.SDK_INT >= 28 ? retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT) : null;
            if (frames != null && info.durationMs > 0) {
                info.fps = Long.parseLong(frames) * 1000f / info.durationMs;
            }
        } catch (Exception e) {
            return null;
        } finally {
            try {
                retriever.release();
            } catch (Exception ignored) {
            }
        }
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(getContext(), Uri.parse(uri), null);
            boolean sawVideo = false;
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime == null) continue;
                if (mime.startsWith("video/") && !sawVideo) {
                    sawVideo = true;
                    info.videoCodec = mime.substring(6);
                    if (format.containsKey(MediaFormat.KEY_FRAME_RATE)) {
                        info.fps = Math.max(info.fps, format.getNumber(MediaFormat.KEY_FRAME_RATE).floatValue());
                    }
                } else if (mime.startsWith("audio/")) {
                    if (info.audioTracks == 0) {
                        if (format.containsKey(MediaFormat.KEY_SAMPLE_RATE)) info.sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                        if (format.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) info.channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                    }
                    info.audioTracks++;
                }
            }
        } catch (Exception ignored) {
            // The frame count estimate above is good enough.
        } finally {
            extractor.release();
        }
        return info;
    }

    /** A preview copy only needs to look right on a phone screen, so it's encoded lighter. */
    private static final int PREVIEW_BITRATE = 3_000_000;
    /** Preview copies play at no more than this, which also makes them quicker to encode. */
    private static final float PREVIEW_FPS = 30f;
    /** Preview copies kept on the phone (newest first), so reopening a project is instant. */
    private static final int KEPT_PREVIEW_COPIES = 40;

    /**
     * Make a small preview copy of a video with the phone's hardware encoder
     * (H.264, its short side `height` pixels, default 720, at most 30fps) for
     * smooth editing on slower phones. Exports keep using the original.
     * Resolves to the copy's file:// path, or to no path when the video is
     * already that small and needs no copy. Copies are kept, like CapCut's
     * proxies, so asking again for the same video answers straight away.
     */
    @OptIn(markerClass = UnstableApi.class)
    @PluginMethod
    public void compress(PluginCall call) {
        String uri = call.getString("uri");
        int shortSide = call.getInt("height", 720);
        if (uri == null) {
            call.reject("Missing uri");
            return;
        }
        if (!PrivateAlbum.allows(getContext(), uri)) {
            call.reject("Not in the test album");
            return;
        }
        File dir = new File(getContext().getCacheDir(), "preview-copies");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("Could not create the preview folder");
            return;
        }
        call.setKeepAlive(true);
        getBridge().execute(() -> {
            VideoInfo info = videoInfo(uri);
            if (info != null && Math.min(info.width, info.height) <= shortSide && info.fps <= PREVIEW_FPS + 2) {
                call.resolve(new JSObject());
                call.setKeepAlive(false);
                return;
            }
            String key = Integer.toHexString(uri.hashCode()) + "-" + (info == null ? 0 : info.durationMs) + "-" + shortSide;
            File output = new File(dir, key + ".mp4");
            if (output.exists() && output.length() > 0) {
                output.setLastModified(System.currentTimeMillis());
                JSObject out = new JSObject();
                out.put("path", Uri.fromFile(output).toString());
                call.resolve(out);
                call.setKeepAlive(false);
                return;
            }
            pruneCopies(dir);
            File partial = new File(dir, key + "." + UUID.randomUUID() + ".part.mp4");
            getActivity().runOnUiThread(() -> startPreviewCopy(call, uri, info, shortSide, partial, output));
        });
    }

    @OptIn(markerClass = UnstableApi.class)
    /** Drop the least recently used copies (and any half-made ones) beyond what's kept. */
    private static void pruneCopies(File dir) {
        File[] files = dir.listFiles();
        if (files == null) return;
        java.util.Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        int kept = 0;
        for (File file : files) {
            boolean partial = file.getName().endsWith(".part.mp4");
            if (partial && System.currentTimeMillis() - file.lastModified() < 60 * 60 * 1000) continue;
            if (partial || ++kept > KEPT_PREVIEW_COPIES) file.delete();
        }
    }

    private void startPreviewCopy(PluginCall call, String uri, VideoInfo info, int shortSide, File partial, File output) {
        ImmutableList.Builder<Effect> effects = ImmutableList.builder();
        if (info == null) {
            effects.add(Presentation.createForHeight(shortSide));
        } else {
            // Scale the short side down so tall phone videos stay sharp enough to see.
            float scale = Math.min(1f, shortSide / (float) Math.min(info.width, info.height));
            int width = Math.round(info.width * scale / 2) * 2;
            int height = Math.round(info.height * scale / 2) * 2;
            effects.add(Presentation.createForWidthAndHeight(width, height, Presentation.LAYOUT_SCALE_TO_FIT));
        }
        if (info == null || info.fps > PREVIEW_FPS + 2) {
            effects.add(FrameDropEffect.createDefaultFrameDropEffect(PREVIEW_FPS));
        }
        Transformer transformer = new Transformer.Builder(getContext())
            .setVideoMimeType(MimeTypes.VIDEO_H264)
            .setEncoderFactory(new DefaultEncoderFactory.Builder(getContext())
                .setRequestedVideoEncoderSettings(new VideoEncoderSettings.Builder().setBitrate(PREVIEW_BITRATE).build())
                .build())
            .addListener(new Transformer.Listener() {
                @Override
                public void onCompleted(Composition composition, ExportResult result) {
                    JSObject out = new JSObject();
                    File done = partial.renameTo(output) ? output : partial;
                    out.put("path", Uri.fromFile(done).toString());
                    call.resolve(out);
                    call.setKeepAlive(false);
                }

                @Override
                public void onError(Composition composition, ExportResult result, ExportException error) {
                    partial.delete();
                    call.reject(error.getMessage(), error);
                    call.setKeepAlive(false);
                }
            })
            .build();
        EditedMediaItem item = new EditedMediaItem.Builder(MediaItem.fromUri(Uri.parse(uri)))
            .setEffects(new Effects(ImmutableList.of(), effects.build()))
            .build();
        transformer.start(item, partial.getAbsolutePath());
    }

    /**
     * The video's sound on its own, for the editor's audio: the audio track is
     * copied out as it is (no re-encoding), which takes a moment even for long
     * videos, instead of the editor reading the whole video file. Kept in the
     * cache, so a clip's sound is only pulled out once. Resolves to the file://
     * path of an .m4a, or to no path when the video has no sound.
     */
    @OptIn(markerClass = UnstableApi.class)
    @PluginMethod
    public void extractAudio(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("Missing uri");
            return;
        }
        if (!PrivateAlbum.allows(getContext(), uri)) {
            call.reject("Not in the test album");
            return;
        }
        File dir = new File(getContext().getCacheDir(), "audio-tracks");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("Could not create the audio folder");
            return;
        }
        call.setKeepAlive(true);
        getBridge().execute(() -> {
            VideoInfo info = videoInfo(uri);
            if (info != null && info.audioTracks == 0) {
                call.resolve(new JSObject());
                call.setKeepAlive(false);
                return;
            }
            String key = Integer.toHexString(uri.hashCode()) + "-" + (info == null ? 0 : info.durationMs);
            File output = new File(dir, key + ".m4a");
            if (output.exists() && output.length() > 0) {
                JSObject out = new JSObject();
                out.put("path", Uri.fromFile(output).toString());
                call.resolve(out);
                call.setKeepAlive(false);
                return;
            }
            File partial = new File(dir, key + "." + UUID.randomUUID() + ".part.m4a");
            getActivity().runOnUiThread(() -> {
                Transformer transformer = new Transformer.Builder(getContext())
                    .addListener(new Transformer.Listener() {
                        @Override
                        public void onCompleted(Composition composition, ExportResult result) {
                            JSObject out = new JSObject();
                            File done = partial.renameTo(output) ? output : partial;
                            out.put("path", Uri.fromFile(done).toString());
                            call.resolve(out);
                            call.setKeepAlive(false);
                        }

                        @Override
                        public void onError(Composition composition, ExportResult result, ExportException error) {
                            partial.delete();
                            call.reject(error.getMessage(), error);
                            call.setKeepAlive(false);
                        }
                    })
                    .build();
                EditedMediaItem item = new EditedMediaItem.Builder(MediaItem.fromUri(Uri.parse(uri)))
                    .setRemoveVideo(true)
                    .build();
                transformer.start(item, partial.getAbsolutePath());
            });
        });
    }

    /** Delete a preview copy once the editor has loaded it. */
    @PluginMethod
    public void discard(PluginCall call) {
        String path = call.getString("path");
        if (path != null) {
            String file = Uri.parse(path).getPath();
            File dir = new File(getContext().getCacheDir(), "preview-copies");
            if (file != null && new File(file).getParentFile() != null
                && new File(file).getParentFile().getAbsolutePath().equals(dir.getAbsolutePath())) {
                new File(file).delete();
            }
        }
        call.resolve();
    }

    /**
     * Filmstrip frames for the timeline, decoded by the phone: `count` frames
     * spread across the video, `height` pixels tall, as JPEG data URLs.
     */
    @PluginMethod
    public void frames(PluginCall call) {
        String uri = call.getString("uri");
        int count = Math.max(1, Math.min(30, call.getInt("count", 10)));
        int height = call.getInt("height", 160);
        if (uri == null) {
            call.reject("Missing uri");
            return;
        }
        if (!PrivateAlbum.allows(getContext(), uri)) {
            call.reject("Not in the test album");
            return;
        }
        getBridge().execute(() -> {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                retriever.setDataSource(getContext(), Uri.parse(uri));
                String durationText = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                long durationMs = durationText == null ? 0 : Long.parseLong(durationText);
                JSArray frames = new JSArray();
                for (int i = 0; i < count; i++) {
                    long timeMs = count == 1 ? 0 : (long) (durationMs * (i + 0.5) / count);
                    Bitmap frame = retriever.getFrameAtTime(timeMs * 1000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                    if (frame == null) continue;
                    int width = Math.max(1, Math.round(frame.getWidth() * (height / (float) frame.getHeight())));
                    Bitmap scaled = Bitmap.createScaledBitmap(frame, width, height, true);
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    scaled.compress(Bitmap.CompressFormat.JPEG, 70, out);
                    JSObject item = new JSObject();
                    item.put("timestamp", timeMs / 1000.0);
                    item.put("data", "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                    frames.put(item);
                    if (scaled != frame) scaled.recycle();
                    frame.recycle();
                }
                JSObject result = new JSObject();
                result.put("frames", frames);
                call.resolve(result);
            } catch (Exception e) {
                call.reject(e.getMessage(), e);
            } finally {
                try {
                    retriever.release();
                } catch (Exception ignored) {
                }
            }
        });
    }
}
