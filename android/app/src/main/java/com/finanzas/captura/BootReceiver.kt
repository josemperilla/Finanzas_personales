package com.finanzas.captura

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.util.concurrent.Executors

/** Al encender el teléfono, reintenta los envíos que estaban en la cola. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        val config = SecurePrefs(context).load()
        if (config.webhookUrl.isBlank()) return

        Executors.newSingleThreadExecutor().execute {
            WebhookSender.flushQueue(context, config.webhookUrl)
        }
    }
}
