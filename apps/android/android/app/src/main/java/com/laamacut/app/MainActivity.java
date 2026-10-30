package com.laamacut.app;

import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaverPlugin.class);
        registerPlugin(GalleryPlugin.class);
        registerPlugin(ExportPlugin.class);
        registerPlugin(SecretsPlugin.class);
        registerPlugin(PreviewPlayerPlugin.class);
        registerPlugin(WhisperPlugin.class);
        registerPlugin(HapticsPlugin.class);
        super.onCreate(savedInstanceState);

        // Gallery videos are read straight from storage (see MediaServer).
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse media = MediaServer.handle(MainActivity.this, request);
                return media != null ? media : super.shouldInterceptRequest(view, request);
            }
        });

        // Test builds: Android's own file pickers show the whole gallery, so they stay
        // shut and only the in-app picker (the test album, see PrivateAlbum) is used.
        if (PrivateAlbum.on()) {
            getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
                @Override
                public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                    callback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "Test build: only the \"" + BuildConfig.TEST_ALBUM + "\" album", Toast.LENGTH_SHORT).show();
                    return true;
                }
            });
        }

        // Back (the edge swipe or button) closes the app's own sheets and screens
        // one at a time; only when nothing is open does it leave the app.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                getBridge().getWebView().evaluateJavascript(
                    "window.__laamacutBack ? window.__laamacutBack() : false",
                    handled -> {
                        if ("true".equals(handled)) return;
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    });
            }
        });

        // Android 15 draws apps behind the status and navigation bars. Keep the
        // editor below the status bar and above the gesture bar, with dark bars.
        getWindow().getDecorView().setBackgroundColor(Color.parseColor("#0B0B0F"));
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView())
            .setAppearanceLightStatusBars(false);
        View webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) view.getLayoutParams();
            params.setMargins(bars.left, bars.top, bars.right, bars.bottom);
            view.setLayoutParams(params);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
