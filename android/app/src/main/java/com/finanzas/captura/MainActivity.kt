package com.finanzas.captura

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.TextUtils
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import java.util.concurrent.Executors

/**
 * Pantalla única de configuración.
 *
 * Guía al usuario en tres pasos:
 *   1. Ingresar Webhook URL y User ID
 *   2. Conceder permiso de Acceso a notificaciones
 *   3. Eximir la app de la optimización de batería
 */
class MainActivity : AppCompatActivity() {

    private lateinit var prefs: SecurePrefs
    private lateinit var etWebhookUrl: EditText
    private lateinit var etUserId: EditText
    private lateinit var btnSave: Button
    private lateinit var btnNotifPermission: Button
    private lateinit var btnBattery: Button
    private lateinit var tvStatus: TextView
    private lateinit var ivStatus: ImageView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = SecurePrefs(applicationContext)

        etWebhookUrl        = findViewById(R.id.etWebhookUrl)
        etUserId            = findViewById(R.id.etUserId)
        btnSave             = findViewById(R.id.btnSave)
        btnNotifPermission  = findViewById(R.id.btnNotifPermission)
        btnBattery          = findViewById(R.id.btnBattery)
        tvStatus            = findViewById(R.id.tvStatus)
        ivStatus            = findViewById(R.id.ivStatus)

        // Rellenar con config guardada
        val config = prefs.load()
        etWebhookUrl.setText(config.webhookUrl)
        etUserId.setText(config.userId)

        btnSave.setOnClickListener { saveConfig() }
        btnNotifPermission.setOnClickListener { openNotificationSettings() }
        btnBattery.setOnClickListener { requestBatteryExemption() }
    }

    override fun onResume() {
        super.onResume()
        updateStatus()
    }

    // ── Guardar configuración ─────────────────────────────────────

    private fun saveConfig() {
        val url    = etWebhookUrl.text.toString().trim()
        val userId = etUserId.text.toString().trim().lowercase()

        if (url.isBlank()) { toast("Ingresa el Webhook URL"); return }
        if (userId.isBlank()) { toast("Ingresa tu usuario (jose o dani)"); return }
        if (!url.startsWith("https://")) { toast("La URL debe empezar con https://"); return }

        prefs.save(url, userId)
        toast("Configuración guardada")
        updateStatus()

        // Envío de prueba en background
        Executors.newSingleThreadExecutor().execute {
            val ok = runCatching {
                val config = prefs.load()
                WebhookSender.flushQueue(applicationContext, config.webhookUrl)
            }.isSuccess
            runOnUiThread {
                if (ok) toast("Conexión con el webhook OK")
            }
        }
    }

    // ── Permisos ──────────────────────────────────────────────────

    private fun openNotificationSettings() {
        startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    }

    private fun requestBatteryExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                })
            } else {
                toast("Ya está exenta de optimización de batería")
            }
        }
    }

    // ── Estado ────────────────────────────────────────────────────

    private fun updateStatus() {
        val configured    = prefs.isConfigured()
        val notifEnabled  = isNotificationListenerEnabled()
        val batteryOk     = isBatteryExempt()

        btnNotifPermission.text = if (notifEnabled)
            "✓ Acceso a notificaciones concedido"
        else
            "Conceder acceso a notificaciones"

        btnBattery.text = if (batteryOk)
            "✓ Exenta de optimización de batería"
        else
            "Eximir de optimización de batería"

        val allOk = configured && notifEnabled
        ivStatus.visibility = View.VISIBLE
        tvStatus.text = when {
            !configured   -> "Ingresa la URL del webhook y tu usuario para continuar"
            !notifEnabled -> "Falta conceder acceso a notificaciones"
            !batteryOk    -> "Recomendado: eximir de optimización de batería para no perder notificaciones"
            else          -> "Todo configurado. Capturando transacciones en segundo plano."
        }
        ivStatus.setImageResource(
            if (allOk) android.R.drawable.presence_online
            else android.R.drawable.presence_away
        )
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners") ?: return false
        val cn   = ComponentName(this, NotificationCapture::class.java).flattenToString()
        return flat.split(":").any { it == cn }
    }

    private fun isBatteryExempt(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
