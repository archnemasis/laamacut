package com.laamacut.app;

import android.graphics.Color;
import android.net.Uri;
import android.util.Log;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.exoplayer.ExoPlayer;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Plays the editor preview with the phone's own video player, like CapCut.
 * ExoPlayer decodes the original gallery videos in hardware onto a
 * TextureView that sits behind the (transparent) WebView, so 4K and HEVC
 * clips play smoothly with no preview copies. The web layer keeps drawing
 * text, stickers and captions on top, and keeps the clock: sound comes from
 * Web Audio and this player is muted and nudged to follow it.
 */
@CapacitorPlugin(name = "LaamacutPreviewPlayer")
public class PreviewPlayerPlugin extends Plugin {
    private ExoPlayer player;
    private FrameLayout layer;
    private TextureView surface;
    private PluginCall pendingLoad;
    private int boxX, boxY, boxWidth = 1, boxHeight = 1;

    private void ensureViews() {
        if (layer != null) return;
        WebView webView = getBridge().getWebView();
        ViewGroup parent = (ViewGroup) webView.getParent();
        layer = new FrameLayout(getContext());
        layer.setVisibility(View.GONE);
        surface = new TextureView(getContext());
        layer.addView(surface, new FrameLayout.LayoutParams(1, 1));
        // Behind the WebView, covering the same area.
        parent.addView(layer, 0, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void releasePlayer() {
        if (pendingLoad != null) {
            pendingLoad.reject("Replaced by another preview");
            pendingLoad = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
    }

    /**
     * clips: [{ uri, inMs, outMs }] played back to back; index and positionMs
     * say where to start. Resolves once the first picture is ready.
     */
    @PluginMethod
    public void load(PluginCall call) {
        JSArray clips = call.getArray("clips");
        int index = call.getInt("index", 0);
        long positionMs = call.getData().optLong("positionMs", 0L);
        if (clips == null || clips.length() == 0) {
            call.reject("clips are required");
            return;
        }
        List<MediaItem> items = new ArrayList<>();
        try {
            for (int i = 0; i < clips.length(); i++) {
                JSONObject clip = clips.getJSONObject(i);
                items.add(new MediaItem.Builder()
                    .setUri(Uri.parse(clip.getString("uri")))
                    .setClippingConfiguration(new MediaItem.ClippingConfiguration.Builder()
                        .setStartPositionMs(clip.getLong("inMs"))
                        .setEndPositionMs(clip.getLong("outMs"))
                        .build())
                    .build());
            }
        } catch (Exception e) {
            call.reject("Bad clip list", e);
            return;
        }

        getActivity().runOnUiThread(() -> {
            ensureViews();
            releasePlayer();
            player = new ExoPlayer.Builder(getContext()).build();
            player.setVolume(0f);
            player.setVideoTextureView(surface);
            player.setMediaItems(items, index, positionMs);
            pendingLoad = call;
            player.addListener(new Player.Listener() {
                @Override
                public void onRenderedFirstFrame() {
                    if (pendingLoad == null) return;
                    pendingLoad.resolve();
                    pendingLoad = null;
                }

                @Override
                public void onVideoSizeChanged(VideoSize videoSize) {
                    layoutSurface();
                }

                @Override
                public void onPlayerError(PlaybackException error) {
                    if (pendingLoad != null) {
                        pendingLoad.reject("The phone's player couldn't open this video", error);
                        pendingLoad = null;
                    }
                    notifyListeners("error", new JSObject().put("message", error.getMessage()));
                }
            });
            player.prepare();
        });
    }

    /** Fit the video inside the preview box, centred, like the web preview's "contain". */
    private void layoutSurface() {
        if (surface == null) return;
        int width = boxWidth;
        int height = boxHeight;
        if (player != null) {
            VideoSize size = player.getVideoSize();
            float aspect = size.height > 0 ? size.width * size.pixelWidthHeightRatio / size.height : 0f;
            if (aspect > 0f) {
                if (aspect > (float) boxWidth / boxHeight) height = Math.round(boxWidth / aspect);
                else width = Math.round(boxHeight * aspect);
            }
        }
        WebView webView = getBridge().getWebView();
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(Math.max(1, width), Math.max(1, height));
        params.leftMargin = webView.getLeft() + boxX + (boxWidth - width) / 2;
        params.topMargin = webView.getTop() + boxY + (boxHeight - height) / 2;
        surface.setLayoutParams(params);
    }

    /** The preview box, in device pixels from the WebView's top left, and the colour around it. */
    @PluginMethod
    public void show(PluginCall call) {
        boxX = call.getInt("x", 0);
        boxY = call.getInt("y", 0);
        boxWidth = Math.max(1, call.getInt("width", 1));
        boxHeight = Math.max(1, call.getInt("height", 1));
        String background = call.getString("background", "#000000");
        getActivity().runOnUiThread(() -> {
            ensureViews();
            WebView webView = getBridge().getWebView();
            layoutSurface();
            try {
                layer.setBackgroundColor(Color.parseColor(background));
            } catch (IllegalArgumentException ignored) {
                layer.setBackgroundColor(Color.BLACK);
            }
            layer.setVisibility(View.VISIBLE);
            webView.setBackgroundColor(Color.TRANSPARENT);
            call.resolve();
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (player != null) player.play();
            call.resolve();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (player != null) player.pause();
            call.resolve();
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        int index = call.getInt("index", 0);
        long positionMs = call.getData().optLong("positionMs", 0L);
        getActivity().runOnUiThread(() -> {
            if (player != null) player.seekTo(index, positionMs);
            call.resolve();
        });
    }

    @PluginMethod
    public void setSpeed(PluginCall call) {
        float speed = (float) call.getData().optDouble("speed", 1.0);
        getActivity().runOnUiThread(() -> {
            if (player != null) player.setPlaybackParameters(new PlaybackParameters(speed));
            call.resolve();
        });
    }

    /** The clip playing and how far into it (from its in point), for keeping in step with the web clock. */
    @PluginMethod
    public void position(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject out = new JSObject();
            if (player != null) {
                out.put("index", player.getCurrentMediaItemIndex());
                out.put("positionMs", player.getCurrentPosition());
                out.put("playing", player.isPlaying());
            }
            call.resolve(out);
        });
    }

    @PluginMethod
    public void debug(PluginCall call) {
        Log.i("LaamacutPreview", call.getString("message", ""));
        call.resolve();
    }

    /** Stop, free the decoder and hand the screen back to the web preview. */
    @PluginMethod
    public void release(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            releasePlayer();
            if (layer != null) layer.setVisibility(View.GONE);
            call.resolve();
        });
    }

    @Override
    protected void handleOnPause() {
        if (player != null) player.pause();
    }

    @Override
    protected void handleOnDestroy() {
        releasePlayer();
    }
}
