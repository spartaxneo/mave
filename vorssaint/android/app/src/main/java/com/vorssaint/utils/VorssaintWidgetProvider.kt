package com.vorssaint.utils

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/**
 * Vorssaint OS — Android Home Screen Widget
 * Surfaces the Pearl Companion Mascot (● ●), active battery health, and quick launcher.
 */
class VorssaintWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            val intent = Intent(context, MainActivity::class.java)
            val pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Dynamic layout mapping
            val views = RemoteViews(context.packageName, android.R.layout.simple_list_item_2)
            views.setTextViewText(android.R.id.text1, "(● ●) Vorssaint Companion")
            
            val battery = VorssaintBatteryReceiver.getInstantStats(context)
            views.setTextViewText(android.R.id.text2, "Battery ${battery.percent}% · ${battery.chargePlug} · ${battery.tempCelsius}°C")
            views.setOnClickPendingIntent(android.R.id.text1, pendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
