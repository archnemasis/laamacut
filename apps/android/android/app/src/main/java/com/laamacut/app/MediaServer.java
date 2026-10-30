package com.laamacut.app;

import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Serves gallery videos to the editor straight from storage, like CapCut,
 * instead of copying whole files into the WebView. Only the bytes asked for
 * (HTTP Range) are read, so a clip opens instantly whatever its size and
 * seeking jumps straight to the right place. Capacitor's own content://
 * handler reads content:// files through a stream it can only skip by
 * reading, and reports sizes past 2GB wrongly.
 *
 * URL: /_laamacut_media_/<name>?uri=<content://media/... uri>
 */
final class MediaServer {
    static final String PREFIX = "/_laamacut_media_/";

    private MediaServer() {}

    /** The response for a media request, or null when the request isn't one. */
    static WebResourceResponse handle(Context context, WebResourceRequest request) {
        Uri url = request.getUrl();
        String path = url.getPath();
        if (path == null || !path.startsWith(PREFIX)) return null;
        String source = url.getQueryParameter("uri");
        // Only the phone's media library: never other apps' files or providers.
        if (source == null || !source.startsWith("content://media/")) return status(400, "Bad Request");
        if (!PrivateAlbum.allows(context, source)) return status(403, "Forbidden");

        ParcelFileDescriptor descriptor = null;
        try {
            Uri uri = Uri.parse(source);
            descriptor = context.getContentResolver().openFileDescriptor(uri, "r");
            if (descriptor == null) return status(404, "Not Found");
            long total = descriptor.getStatSize();
            String mime = context.getContentResolver().getType(uri);
            if (mime == null) mime = "video/mp4";

            long start = 0;
            long end = total - 1;
            String range = header(request, "Range");
            boolean partial = range != null && range.startsWith("bytes=") && total > 0;
            if (partial) {
                String spec = range.substring(6).split(",")[0].trim();
                int dash = spec.indexOf('-');
                String from = dash < 0 ? spec : spec.substring(0, dash).trim();
                String to = dash < 0 ? "" : spec.substring(dash + 1).trim();
                if (from.isEmpty()) {
                    // "bytes=-500": the last 500 bytes.
                    start = Math.max(0, total - Long.parseLong(to));
                } else {
                    start = Long.parseLong(from);
                    if (!to.isEmpty()) end = Math.min(end, Long.parseLong(to));
                }
                if (start >= total || start > end) {
                    descriptor.close();
                    Map<String, String> headers = baseHeaders();
                    headers.put("Content-Range", "bytes */" + total);
                    return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", headers, empty());
                }
            }

            // The WebView skips to the range start itself (a seek on the file),
            // so the stream starts at the beginning of the file; it doesn't stop
            // at the range end, so the stream ends there.
            FileInputStream input = new ParcelFileDescriptor.AutoCloseInputStream(descriptor);
            descriptor = null;
            long length = end - start + 1;

            Map<String, String> headers = baseHeaders();
            headers.put("Content-Length", Long.toString(length));
            if (partial) headers.put("Content-Range", "bytes " + start + "-" + end + "/" + total);
            return new WebResourceResponse(
                mime,
                null,
                partial ? 206 : 200,
                partial ? "Partial Content" : "OK",
                headers,
                new UpTo(input, end + 1)
            );
        } catch (NumberFormatException e) {
            return status(416, "Range Not Satisfiable");
        } catch (Exception e) {
            return status(404, "Not Found");
        } finally {
            if (descriptor != null) {
                try {
                    descriptor.close();
                } catch (IOException ignored) {
                }
            }
        }
    }

    private static String header(WebResourceRequest request, String name) {
        for (Map.Entry<String, String> entry : request.getRequestHeaders().entrySet()) {
            if (entry.getKey().equalsIgnoreCase(name)) return entry.getValue();
        }
        return null;
    }

    private static Map<String, String> baseHeaders() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Accept-Ranges", "bytes");
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
        headers.put("Cache-Control", "no-store");
        return headers;
    }

    private static InputStream empty() {
        return new ByteArrayInputStream(new byte[0]);
    }

    private static WebResourceResponse status(int code, String reason) {
        return new WebResourceResponse("text/plain", "utf-8", code, reason, baseHeaders(), empty());
    }

    /** The file up to (not including) byte `limit`; skips seek on the file. */
    private static final class UpTo extends InputStream {
        private final FileInputStream input;
        private long remaining;

        UpTo(FileInputStream input, long limit) {
            this.input = input;
            this.remaining = limit;
        }

        @Override
        public int read() throws IOException {
            if (remaining <= 0) return -1;
            int value = input.read();
            if (value >= 0) remaining--;
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int count) throws IOException {
            if (remaining <= 0) return -1;
            int read = input.read(buffer, offset, (int) Math.min(count, remaining));
            if (read > 0) remaining -= read;
            return read;
        }

        @Override
        public long skip(long count) throws IOException {
            long skipped = input.skip(Math.min(count, Math.max(0, remaining)));
            remaining -= skipped;
            return skipped;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(Integer.MAX_VALUE, Math.min(remaining, input.available()));
        }

        @Override
        public void close() throws IOException {
            input.close();
        }
    }
}
