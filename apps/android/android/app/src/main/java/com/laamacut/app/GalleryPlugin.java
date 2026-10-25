package com.laamacut.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.graphics.Bitmap;
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
        try (Cursor cursor = resolver.query(collection, projection, null, null, order)) {
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

    /** A preview copy only needs to look right on a phone screen, so it's encoded lighter. */
    private static final int PREVIEW_BITRATE = 3_000_000;

    /**
     * Make a small preview copy of a video with the phone's hardware encoder
     * (H.264, `height` lines tall, default 720) for smooth editing on slower
     * phones. Exports keep using the original. Resolves to the copy's file://
     * path, or to no path when the video is already that small and needs no copy.
     */
    @OptIn(markerClass = UnstableApi.class)
    @PluginMethod
    public void compress(PluginCall call) {
        String uri = call.getString("uri");
        int height = call.getInt("height", 720);
        if (uri == null) {
            call.reject("Missing uri");
            return;
        }
        File dir = new File(getContext().getCacheDir(), "preview-copies");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("Could not create the preview folder");
            return;
        }
        File output = new File(dir, UUID.randomUUID() + ".mp4");
        call.setKeepAlive(true);
        getBridge().execute(() -> {
            if (displayedHeight(uri) <= height) {
                call.resolve(new JSObject());
                call.setKeepAlive(false);
                return;
            }
            getActivity().runOnUiThread(() -> startPreviewCopy(call, uri, height, output));
        });
    }

    /** The video's height as shown (rotation applied), or MAX_VALUE if it can't be read. */
    private int displayedHeight(String uri) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(getContext(), Uri.parse(uri));
            int width = Integer.parseInt(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            int height = Integer.parseInt(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            String rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
            boolean sideways = rotation != null && (rotation.equals("90") || rotation.equals("270"));
            return sideways ? width : height;
        } catch (Exception e) {
            return Integer.MAX_VALUE;
        } finally {
            try {
                retriever.release();
            } catch (Exception ignored) {
            }
        }
    }

    @OptIn(markerClass = UnstableApi.class)
    private void startPreviewCopy(PluginCall call, String uri, int height, File output) {
        Transformer transformer = new Transformer.Builder(getContext())
            .setVideoMimeType(MimeTypes.VIDEO_H264)
            .setEncoderFactory(new DefaultEncoderFactory.Builder(getContext())
                .setRequestedVideoEncoderSettings(new VideoEncoderSettings.Builder().setBitrate(PREVIEW_BITRATE).build())
                .build())
            .addListener(new Transformer.Listener() {
                @Override
                public void onCompleted(Composition composition, ExportResult result) {
                    JSObject out = new JSObject();
                    out.put("path", Uri.fromFile(output).toString());
                    call.resolve(out);
                    call.setKeepAlive(false);
                }

                @Override
                public void onError(Composition composition, ExportResult result, ExportException error) {
                    output.delete();
                    call.reject(error.getMessage(), error);
                    call.setKeepAlive(false);
                }
            })
            .build();
        EditedMediaItem item = new EditedMediaItem.Builder(MediaItem.fromUri(Uri.parse(uri)))
            .setEffects(new Effects(ImmutableList.of(), ImmutableList.of(Presentation.createForHeight(height))))
            .build();
        transformer.start(item, output.getAbsolutePath());
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
