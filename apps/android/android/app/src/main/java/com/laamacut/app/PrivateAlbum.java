package com.laamacut.app;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Set;

/**
 * Test builds only see one gallery album, so phone screenshots taken while
 * testing never show the owner's own photos and videos. Set with
 * `-PlaamacutTestAlbum="Laamacut Test"` when building; release builds leave it
 * empty and see the whole gallery.
 */
final class PrivateAlbum {
    /** Same column for videos and photos. */
    private static final String BUCKET = MediaStore.Video.VideoColumns.BUCKET_DISPLAY_NAME;
    private static final Set<String> allowed = Collections.synchronizedSet(new HashSet<>());

    private PrivateAlbum() {}

    static boolean on() {
        return !BuildConfig.TEST_ALBUM.isEmpty();
    }

    /** Where exports and saved files go: the test album in test builds, so they show in the picker. */
    static String saveFolder() {
        return on() ? BuildConfig.TEST_ALBUM : "Laamacut";
    }

    /** MediaStore selection for the album, or null for the whole gallery. */
    static String selection() {
        return on() ? BUCKET + " = ?" : null;
    }

    static String[] selectionArgs() {
        return on() ? new String[] { BuildConfig.TEST_ALBUM } : null;
    }

    /**
     * Capacitor's own content:// bridge (convertFileSrc, used for photos and sounds)
     * would otherwise read any gallery file: refuse ones outside the album.
     */
    static WebResourceResponse blockContent(Context context, WebResourceRequest request) {
        if (!on()) return null;
        String path = request.getUrl().getPath();
        String prefix = "/_capacitor_content_";
        if (path == null || !path.startsWith(prefix)) return null;
        if (allows(context, "content:/" + path.substring(prefix.length()))) return null;
        return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }

    /** Whether a gallery uri may be read. The app's own files (file://) always may. */
    static boolean allows(Context context, String uri) {
        if (!on() || uri == null || !uri.startsWith("content://")) return true;
        if (allowed.contains(uri)) return true;
        try (Cursor cursor = context.getContentResolver()
                .query(Uri.parse(uri), new String[] { BUCKET }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && BuildConfig.TEST_ALBUM.equals(cursor.getString(0))) {
                allowed.add(uri);
                return true;
            }
        } catch (Exception ignored) {
            // Not a media library uri: refuse it.
        }
        return false;
    }
}
