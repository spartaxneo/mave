package com.vorssaint.utils

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager

/**
 * Vorssaint OS — Real Android Hardware Battery & Power Sentinel
 * Captures live hardware voltage, temperature (°C), charging source, and battery health.
 */
class VorssaintBatteryReceiver(
    private val onBatteryUpdate: ((BatteryStats) -> Unit)? = null
) : BroadcastReceiver() {

    data class BatteryStats(
        val percent: Int,
        val isCharging: Boolean,
        val chargePlug: String,
        val tempCelsius: Float,
        val voltageMv: Int,
        val health: String
    )

    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BATTERY_CHANGED) {
            val stats = parseBatteryIntent(intent)
            onBatteryUpdate?.invoke(stats)
        }
    }

    companion object {
        fun getInstantStats(context: Context): BatteryStats {
            val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            val intent = context.registerReceiver(null, filter)
            return parseBatteryIntent(intent)
        }

        private fun parseBatteryIntent(intent: Intent?): BatteryStats {
            if (intent == null) {
                return BatteryStats(100, false, "Unknown", 25.0f, 4000, "Good")
            }
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            val percent = if (level >= 0 && scale > 0) Math.round((level / scale.toFloat()) * 100) else 100

            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                             status == BatteryManager.BATTERY_STATUS_FULL

            val chargePlug = when (intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)) {
                BatteryManager.BATTERY_PLUGGED_AC -> "AC Fast Charger"
                BatteryManager.BATTERY_PLUGGED_USB -> "USB Port"
                BatteryManager.BATTERY_PLUGGED_WIRELESS -> "Qi Wireless Charging"
                else -> "On Battery"
            }

            val tempTenths = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0)
            val tempCelsius = tempTenths / 10.0f

            val voltageMv = intent.getIntExtra(BatteryManager.EXTRA_VOLTAGE, 0)

            val health = when (intent.getIntExtra(BatteryManager.EXTRA_HEALTH, -1)) {
                BatteryManager.BATTERY_HEALTH_GOOD -> "Optimal"
                BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Overheated"
                BatteryManager.BATTERY_HEALTH_DEAD -> "Depleted"
                BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Over Voltage"
                else -> "Standard"
            }

            return BatteryStats(percent, isCharging, chargePlug, tempCelsius, voltageMv, health)
        }
    }
}
