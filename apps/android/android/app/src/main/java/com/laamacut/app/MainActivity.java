package com.laamacut.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaverPlugin.class);
        super.onCreate(savedInstanceState);

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
