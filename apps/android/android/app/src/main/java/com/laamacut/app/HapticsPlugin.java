package com.laamacut.app;

import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.view.View;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Touch feedback through the system's own haptic patterns, so it needs no
 * vibrate permission and follows the phone's vibration settings.
 */
@CapacitorPlugin(name = "LaamacutHaptics")
public class HapticsPlugin extends Plugin {
    @PluginMethod
    public void play(PluginCall call) {
        int feedback = feedbackFor(call.getString("kind", "click"));
        getActivity().runOnUiThread(() -> {
            View view = getBridge().getWebView();
            if (view != null) view.performHapticFeedback(feedback);
        });
        call.resolve();
    }

    private static int feedbackFor(String kind) {
        boolean api30 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;
        switch (kind) {
            case "tick":
                return Build.VERSION.SDK_INT >= 34 ? HapticFeedbackConstants.SEGMENT_TICK : HapticFeedbackConstants.CLOCK_TICK;
            case "heavy":
                return api30 ? HapticFeedbackConstants.GESTURE_START : HapticFeedbackConstants.LONG_PRESS;
            case "success":
                return api30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.LONG_PRESS;
            case "error":
                return api30 ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS;
            default:
                return HapticFeedbackConstants.CONTEXT_CLICK;
        }
    }
}
