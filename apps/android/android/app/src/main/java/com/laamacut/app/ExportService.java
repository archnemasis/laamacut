package com.laamacut.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps an export running when the user leaves the app, like CapCut: a
 * foreground service with a progress notification, and a "saved" notification
 * that opens the video when the export finishes.
 */
public class ExportService extends Service {
    private static final String CHANNEL = "export";
    private static final int ONGOING_ID = 4101;
    private static final int DONE_ID = 4102;

    private PowerManager.WakeLock wakeLock;

    public static void start(Context context) {
        ContextCompat.startForegroundService(context, new Intent(context, ExportService.class));
    }

    public static void progress(Context context, double progress) {
        if (!canNotify(context)) return;
        NotificationManagerCompat.from(context).notify(ONGOING_ID, ongoing(context, progress));
    }

    /** Stop the service; savedUri is the finished video, or null when the export failed or was cancelled. */
    public static void finish(Context context, String savedUri, String failure) {
        context.stopService(new Intent(context, ExportService.class));
        if (!canNotify(context) || (savedUri == null && failure == null)) return;
        NotificationCompat.Builder done = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setAutoCancel(true);
        if (savedUri != null) {
            Intent view = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(Uri.parse(savedUri), "video/mp4")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            done.setContentTitle("Video saved")
                .setContentText("Saved to Movies/Laamacut")
                .setContentIntent(PendingIntent.getActivity(context, 1, view, PendingIntent.FLAG_IMMUTABLE));
        } else {
            done.setContentTitle("Export failed")
                .setContentText(failure)
                .setSmallIcon(android.R.drawable.stat_notify_error)
                .setContentIntent(openApp(context));
        }
        NotificationManagerCompat.from(context).notify(DONE_ID, done.build());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = ongoing(this, 0);
        if (Build.VERSION.SDK_INT >= 35) {
            startForeground(ONGOING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(ONGOING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(ONGOING_ID, notification);
        }
        if (wakeLock == null) {
            PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Laamacut:export");
            // Upper bound so a stuck export can't drain the battery.
            wakeLock.acquire(2 * 60 * 60 * 1000L);
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static Notification ongoing(Context context, double progress) {
        ensureChannel(context);
        int percent = (int) Math.round(Math.max(0, Math.min(1, progress)) * 100);
        return new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Exporting video")
            .setContentText(percent + "%")
            .setProgress(100, percent, percent == 0)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(openApp(context))
            .build();
    }

    private static PendingIntent openApp(Context context) {
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE);
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Exports", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Progress of video exports");
        manager.createNotificationChannel(channel);
    }

    private static boolean canNotify(Context context) {
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }
}
