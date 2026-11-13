package com.vorssaint.utils

import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import androidx.annotation.RequiresApi

/**
 * Vorssaint OS — Quick Settings Tile
 * Allows 1-tap toggling of Keep Awake and Dynamic Island HUD directly from Android's status bar.
 */
@RequiresApi(Build.VERSION_CODES.N)
class VorssaintQuickSettingsTile : TileService() {

    private var isAwakeActive = false

    override fun onStartListening() {
        super.onStartListening()
        updateTileState()
    }

    override fun onClick() {
        super.onClick()
        isAwakeActive = !isAwakeActive
        updateTileState()

        if (isAwakeActive) {
            // Keep screen awake while tile is active
            VorssaintIslandOverlayService.startOverlay(this)
        }
    }

    private fun updateTileState() {
        val tile = qsTile ?: return
        tile.state = if (isAwakeActive) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.label = if (isAwakeActive) "Vorssaint · Awake" else "Vorssaint"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.subtitle = if (isAwakeActive) "Display Kept On" else "Tap to Keep Awake"
        }
        tile.updateTile()
    }
}
