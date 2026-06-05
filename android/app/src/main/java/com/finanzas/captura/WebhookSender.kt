package com.finanzas.captura

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

private const val TAG           = "WebhookSender"
private const val TIMEOUT_MS    = 15_000
private const val MAX_RETRIES   = 3
private const val RETRY_FILE    = "retry_queue.jsonl"

object WebhookSender {

    /**
     * Envía una notificación bancaria al webhook GAS.
     * Si falla, guarda en cola local y reintenta hasta MAX_RETRIES veces.
     * La cola también se procesa al arrancar (ver BootReceiver).
     */
    fun send(
        context: Context,
        bank: String,
        title: String,
        body: String,
        userId: String,
        webhookUrl: String,
    ) {
        val payload = buildPayload(bank, title, body, userId)

        // Flush any pending retries first
        flushQueue(context, webhookUrl)

        // Send current notification
        if (!post(webhookUrl, payload)) {
            enqueue(context, payload)
        }
    }

    /** Process all queued requests. Called on send() and on boot. */
    fun flushQueue(context: Context, webhookUrl: String) {
        val file = retryFile(context)
        if (!file.exists() || file.length() == 0L) return

        val lines = file.readLines().filter { it.isNotBlank() }
        val remaining = mutableListOf<String>()

        for (line in lines) {
            if (!post(webhookUrl, line)) {
                remaining.add(line)
            }
        }

        if (remaining.isEmpty()) {
            file.delete()
        } else {
            file.writeText(remaining.joinToString("\n") + "\n")
        }
    }

    private fun post(webhookUrl: String, jsonPayload: String): Boolean {
        repeat(MAX_RETRIES) { attempt ->
            try {
                val url  = URL(webhookUrl)
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod        = "POST"
                    connectTimeout       = TIMEOUT_MS
                    readTimeout          = TIMEOUT_MS
                    doOutput             = true
                    setRequestProperty("Content-Type", "text/plain")
                }
                conn.outputStream.use { it.write(jsonPayload.toByteArray(Charsets.UTF_8)) }

                val code = conn.responseCode
                conn.disconnect()

                if (code in 200..299) return true
                Log.w(TAG, "HTTP $code en intento ${attempt + 1}")

            } catch (e: Exception) {
                Log.w(TAG, "Error en intento ${attempt + 1}: ${e.message}")
                if (attempt < MAX_RETRIES - 1) Thread.sleep((500L * (attempt + 1)))
            }
        }
        return false
    }

    private fun enqueue(context: Context, payload: String) {
        try {
            retryFile(context).appendText(payload + "\n")
            Log.d(TAG, "Guardado en cola de reintentos")
        } catch (e: Exception) {
            Log.e(TAG, "No se pudo guardar en cola: ${e.message}")
        }
    }

    private fun buildPayload(bank: String, title: String, body: String, userId: String): String =
        JSONObject().apply {
            put("type",      "notification")
            put("bank",      bank)
            put("title",     title)
            put("body",      body)
            put("userId",    userId)
            put("timestamp", System.currentTimeMillis())
        }.toString()

    private fun retryFile(context: Context): File =
        File(context.filesDir, RETRY_FILE)
}
