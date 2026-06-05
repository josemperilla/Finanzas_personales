package com.finanzas.captura

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

data class AppConfig(
    val webhookUrl: String,
    val userId: String,
)

class SecurePrefs(context: Context) {

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "finanzas_secure_prefs",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun save(webhookUrl: String, userId: String) {
        prefs.edit()
            .putString("webhook_url", webhookUrl.trim())
            .putString("user_id",     userId.trim().lowercase())
            .apply()
    }

    fun load(): AppConfig = AppConfig(
        webhookUrl = prefs.getString("webhook_url", "") ?: "",
        userId     = prefs.getString("user_id",     "") ?: "",
    )

    fun isConfigured(): Boolean {
        val c = load()
        return c.webhookUrl.isNotBlank() && c.userId.isNotBlank()
    }
}
