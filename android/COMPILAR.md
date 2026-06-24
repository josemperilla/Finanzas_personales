# Compilar e instalar la app Android

## Requisitos

- Android Studio Hedgehog (2023.1) o superior
- JDK 17 (viene incluido con Android Studio)
- Android SDK 34

## Pasos para compilar

### 1. Abrir el proyecto

1. Abre Android Studio
2. File → Open → selecciona la carpeta `android/` de este repositorio
3. Espera a que Gradle sincronice (puede tardar 2-3 minutos la primera vez)

### 2. Compilar el APK

**Opción A — desde Android Studio:**
1. Build → Build Bundle(s) / APK(s) → Build APK(s)
2. El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`

**Opción B — desde terminal:**
```bash
cd android
./gradlew assembleRelease    # APK firmado para distribución
# o
./gradlew assembleDebug      # APK de desarrollo (más fácil, sin firma)
```

### 3. Instalar en el teléfono

**Por cable USB:**
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

**Por archivo (sideload):**
1. Copia el APK al teléfono (AirDrop, WhatsApp, email, etc.)
2. En el teléfono: Ajustes → Aplicaciones → Instalar apps desconocidas → activa para el gestor de archivos
3. Abre el APK desde el gestor de archivos

## Configurar en el teléfono

Una vez instalada:

1. Abre la app **"Captura de transacciones"**
2. Ingresa el **Webhook URL** completo con el `_secret`:
   ```
   https://script.google.com/macros/s/.../exec?_secret=TU_SECRET
   ```
3. Ingresa tu **Usuario** (el ID que te asignó el administrador)
4. Toca **Guardar configuración**
5. Toca **Conceder acceso a notificaciones** → busca "Captura de transacciones" → actívala
6. Toca **Eximir de optimización de batería** → confirma

**Samsung (One UI):** también ve a Ajustes → Batería → Optimización de batería → busca la app → "No optimizar"

**Xiaomi (MIUI):** Ajustes → Aplicaciones → Administrar apps → Captura de transacciones → Ahorro de energía → Sin restricciones

## Verificar que funciona

1. Haz una compra con cualquier banco soportado
2. Abre el Google Sheet → busca la pestaña con tu nombre de usuario
3. Debe aparecer una fila nueva con `Fuente = notification`

Si aparece `Tipo = NO RECONOCIDO`: el parser no reconoció el texto de la notificación.
Revisa la columna `SMS_Original` y reporta el texto para mejorar el parser.

## Distribución

El APK se puede compartir directamente por WhatsApp, AirDrop o link de descarga.
No requiere Play Store.

## Estructura del proyecto

```
android/
  app/src/main/java/com/finanzas/captura/
    NotificationCapture.kt  — escucha notificaciones de apps bancarias
    WebhookSender.kt        — envía al GAS webhook con reintentos
    SecurePrefs.kt          — guarda URL y usuario encriptados
    BootReceiver.kt         — reintenta envíos pendientes al encender
    MainActivity.kt         — pantalla de configuración y permisos
```
