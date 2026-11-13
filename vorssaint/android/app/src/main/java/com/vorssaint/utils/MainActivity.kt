package com.vorssaint.utils

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/**
 * Vorssaint Android Main Activity
 * Manages system overlay permission, background service lifecycle,
 * and launches the full macOS-parity UI.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val OVERLAY_PERMISSION_REQ_CODE = 1204
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Check and prompt for system overlay permission (required for Dynamic Island notch)
        checkOverlayPermissionAndStart()
    }

    private fun checkOverlayPermissionAndStart() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(this)) {
                Toast.makeText(
                    this,
                    "Vorssaint requires 'Display over other apps' to draw the Dynamic Island notch.",
                    Toast.LENGTH_LONG
                ).show()

                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName")
                )
                startActivityForResult(intent, OVERLAY_PERMISSION_REQ_CODE)
            } else {
                startVorssaintIslandService()
            }
        } else {
            startVorssaintIslandService()
        }
    }

    private fun startVorssaintIslandService() {
        val serviceIntent = Intent(this, VorssaintIslandOverlayService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
        Toast.makeText(this, "Vorssaint Dynamic Island is active at the top of your screen.", Toast.LENGTH_SHORT).show()
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == OVERLAY_PERMISSION_REQ_CODE) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.canDrawOverlays(this)) {
                startVorssaintIslandService()
            } else {
                Toast.makeText(
                    this,
                    "Overlay permission not granted. Dynamic Island cannot be drawn above apps.",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }
}
