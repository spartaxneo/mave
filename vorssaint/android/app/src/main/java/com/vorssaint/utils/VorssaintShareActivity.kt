package com.vorssaint.utils

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast

/**
 * Vorssaint OS — Android Share Sheet Target (URL Cleaner & Plain Text Formatter)
 * Receives shared URLs from Chrome, Twitter/X, Instagram, and YouTube, strips surveillance
 * tracking parameters, copies the clean URL to clipboard, and confirms to the user.
 */
class VorssaintShareActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: ""
            handleSharedText(sharedText)
        }
        finish()
    }

    private fun handleSharedText(raw: String) {
        val trimmed = raw.trim()
        val cleaned = cleanUrlTracking(trimmed)

        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("Vorssaint Clean URL", cleaned)
        clipboard.setPrimaryClip(clip)

        val message = if (cleaned != trimmed) {
          "✓ Vorssaint: Tracking params stripped & copied!"
        } else {
          "✓ Vorssaint: Copied to clipboard"
        }
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    companion object {
        fun cleanUrlTracking(rawUrl: String): String {
            try {
                val uri = Uri.parse(rawUrl)
                if (uri.scheme == null || (!uri.scheme.equals("http", true) && !uri.scheme.equals("https", true))) {
                    return rawUrl
                }
                val trackingKeys = setOf(
                    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
                    "fbclid", "gclid", "gclsrc", "dclid", "msclkid", "mc_eid", "yclid", "zanpid",
                    "si", "igshid", "ref", "source", "feature", "trk", "_hsenc", "_hsmi"
                )
                val builder = uri.buildUpon().clearQuery()
                for (paramName in uri.queryParameterNames) {
                    if (!trackingKeys.contains(paramName.lowercase())) {
                        for (value in uri.getQueryParameters(paramName)) {
                            builder.appendQueryParameter(paramName, value)
                        }
                    }
                }
                return builder.build().toString()
            } catch (e: Exception) {
                return rawUrl
            }
        }
    }
}
