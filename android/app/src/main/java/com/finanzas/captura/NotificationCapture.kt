package com.finanzas.captura

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.IBinder
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import java.util.concurrent.Executors

/**
 * Escucha notificaciones push de las apps bancarias y las envía al webhook.
 *
 * Mapa de package → bank_code (mismo valor que usan los Shortcuts de iOS).
 * Si un banco nuevo envía push, agregar aquí y en el webhook.gs.
 */
private val BANK_PACKAGES = mapOf(
    "com.bancolombia.aplimovil"                    to "bancolombia",
    "com.davivienda.nuevaappmovil"                 to "davivienda",
    "com.nequi.mobileapp"                          to "nequi",
    "com.daviplata"                                to "daviplata",
    "com.bancodebogota.bancamovil"                 to "bogota",
    "com.grupoavaloc1.bancamovil"                  to "occidente",
    "com.grupoavalpo.bancamovil"                   to "popular",
    "com.grupoavalav1.bancamovil"                  to "avvillas",
    "com.avalsolucionesdigitalessa.dale_app_embedded" to "dale",
    "com.co.app.unica.latam"                       to "itau",
    "com.rappi.android"                            to "rappi",
)

private const val FOREGROUND_CHANNEL_ID = "captura_servicio"
private const val FOREGROUND_NOTIF_ID   = 1001

class NotificationCapture : NotificationListenerService() {

    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var prefs: SecurePrefs

    override fun onCreate() {
        super.onCreate()
        prefs = SecurePrefs(applicationContext)
        startForeground(FOREGROUND_NOTIF_ID, buildForegroundNotification())
    }

    override fun onBind(intent: Intent?): IBinder? = super.onBind(intent)

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        val bank = BANK_PACKAGES[sbn.packageName] ?: return

        val extras = sbn.notification?.extras ?: return
        val title  = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val body   = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
            ?: ""

        if (body.isBlank() && title.isBlank()) return

        val config = prefs.load()
        if (config.webhookUrl.isBlank() || config.userId.isBlank()) return

        executor.execute {
            WebhookSender.send(
                context    = applicationContext,
                bank       = bank,
                title      = title,
                body       = body,
                userId     = config.userId,
                webhookUrl = config.webhookUrl,
            )
        }
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }

    private fun buildForegroundNotification(): Notification {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(FOREGROUND_CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(
                    FOREGROUND_CHANNEL_ID,
                    "Captura activa",
                    NotificationManager.IMPORTANCE_MIN,
                ).apply { setShowBadge(false) }
            )
        }

        val tapIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, FOREGROUND_CHANNEL_ID)
            .setContentTitle("Capturando transacciones")
            .setContentText("Las notificaciones bancarias se guardan automáticamente")
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setContentIntent(tapIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
    }
}
