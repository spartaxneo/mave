package com.vorssaint.utils

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.media.AudioManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.SeekBar
import android.widget.TextView

/**
 * Vorssaint Dynamic Island & Notch Overlay Service for Android
 * Replicating Vorssaint's macOS Dynamic Island on Android front camera hole-punch
 */
class VorssaintIslandOverlayService : Service() {

    private lateinit var windowManager: WindowManager
    private lateinit var overlayView: View
    private lateinit var layoutParams: WindowManager.LayoutParams
    private lateinit var audioManager: AudioManager
    private var wakeLock: PowerManager.WakeLock? = null

    private var isExpanded = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager

        startForegroundServiceNotification()
        setupFloatingIslandView()
    }

    private fun startForegroundServiceNotification() {
        val channelId = "vorssaint_island_channel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Vorssaint Dynamic Island",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }

        val notification: Notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, channelId)
                .setContentTitle("Vorssaint")
                .setContentText("Dynamic Island Notch Active")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("Vorssaint")
                .setContentText("Dynamic Island Notch Active")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .build()
        }

        startForeground(1001, notification)
    }

    private fun setupFloatingIslandView() {
        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        layoutParams = WindowManager.LayoutParams(
            dpToPx(240),
            dpToPx(38),
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = 0
        }

        overlayView = LayoutInflater.from(this).inflate(R.layout.vorssaint_island_notch, null)
        windowManager.addView(overlayView, layoutParams)

        setupInteractions()
    }

    private fun setupInteractions() {
        val compactNotch = overlayView.findViewById<View>(R.id.compact_notch)
        val expandedControls = overlayView.findViewById<View>(R.id.expanded_controls)
        val mascotFace = overlayView.findViewById<View>(R.id.mascot_face)
        val volSeekBar = overlayView.findViewById<SeekBar>(R.id.vol_seek_bar)
        val brightSeekBar = overlayView.findViewById<SeekBar>(R.id.bright_seek_bar)
        val btnKeepAwake = overlayView.findViewById<View>(R.id.btn_keep_awake)

        // Expand on touch
        compactNotch.setOnClickListener {
            expandIsland()
        }

        // Mascot pet / hop reaction
        mascotFace.setOnClickListener {
            mascotFace.animate().translationY(-12f).scaleX(1.15f).scaleY(1.15f)
                .setDuration(180)
                .withEndAction {
                    mascotFace.animate().translationY(0f).scaleX(1f).scaleY(1f).setDuration(180).start()
                }.start()
        }

        // Volume Seekbar
        val maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val curVol = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
        volSeekBar?.max = maxVol
        volSeekBar?.progress = curVol
        volSeekBar?.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                if (fromUser) audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, progress, 0)
            }
            override fun onStartTrackingTouch(sb: SeekBar?) {}
            override fun onStopTrackingTouch(sb: SeekBar?) {}
        })

        // Keep Awake Insomnia toggle
        var isAwake = false
        btnKeepAwake?.setOnClickListener {
            isAwake = !isAwake
            btnKeepAwake.isSelected = isAwake
            toggleKeepAwake(isAwake)
        }
    }

    private fun expandIsland() {
        if (isExpanded) return
        isExpanded = true
        layoutParams.width = dpToPx(380)
        layoutParams.height = dpToPx(280)
        layoutParams.flags = layoutParams.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
        windowManager.updateViewLayout(overlayView, layoutParams)

        overlayView.findViewById<View>(R.id.compact_notch).visibility = View.GONE
        overlayView.findViewById<View>(R.id.expanded_controls).visibility = View.VISIBLE
    }

    private fun collapseIsland() {
        if (!isExpanded) return
        isExpanded = false
        layoutParams.width = dpToPx(240)
        layoutParams.height = dpToPx(38)
        layoutParams.flags = layoutParams.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        windowManager.updateViewLayout(overlayView, layoutParams)

        overlayView.findViewById<View>(R.id.expanded_controls).visibility = View.GONE
        overlayView.findViewById<View>(R.id.compact_notch).visibility = View.VISIBLE
    }

    private fun toggleKeepAwake(enable: Boolean) {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (enable) {
            wakeLock = powerManager.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ON_AFTER_RELEASE,
                "Vorssaint::KeepAwakeLock"
            )
            wakeLock?.acquire(24 * 60 * 60 * 1000L)
        } else {
            wakeLock?.let { if (it.isHeld) it.release() }
            wakeLock = null
        }
    }

    private fun dpToPx(dp: Int): Int {
        val density = resources.displayMetrics.density
        return (dp * density).toInt()
    }

    override fun onDestroy() {
        super.onDestroy()
        toggleKeepAwake(false)
        if (::overlayView.isInitialized) {
            windowManager.removeView(overlayView)
        }
    }
}
