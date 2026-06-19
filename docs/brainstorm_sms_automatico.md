# Brainstorm: Automatización del envío de mensajes a Finanzas Personales

**Fecha:** 2026-06-19  
**Estado:** Investigación / sin implementar

---

## Contexto y restricción fundamental

El sistema recibe transacciones bancarias que el usuario captura de sus propias notificaciones/SMS. El OS (iOS y Android) **no permite que un servidor externo lea los mensajes del dispositivo** — la captura siempre tiene que ocurrir en el dispositivo del usuario y luego enviarse al servidor. Esta es la restricción que da forma a todas las opciones.

El webhook receptor es un Google Apps Script (GAS) que acepta tres formatos de entrada:
- `notification` — push de apps bancarias (iOS/Android)
- `sms` — texto completo de SMS bancario
- `manual` — datos ingresados a mano desde la PWA

Cloudflare Pages actúa como proxy (`/api/sms`) que inyecta el secreto del servidor, de modo que el dispositivo del usuario no necesita conocerlo.

---

## Estado actual de los canales

| Canal | Cómo funciona | Fricción de setup | Mantenimiento |
|-------|--------------|-------------------|---------------|
| **iOS Shortcut (notif push)** | Automatización por banco en app Atajos. Un Shortcut por banco instalada. | Alta — un setup manual por banco | Bajo una vez configurado |
| **iOS Shortcut (SMS universal)** | Una sola automatización "Message" con trigger `$`. Guarda userId en iCloud. Link de iCloud pre-construido. | Baja — 7 pasos una sola vez | Casi nulo |
| **Android APK custom** | `NotificationListenerService` captura cualquier notificación. Cola de reintentos local. | Media — instalar APK + 3 permisos | Medio — APK sin actualización automática |
| **Email forwarding** | GAS lee Gmail cada 5 min (Nequi, Rappi, dale!). | Muy baja si el banco envía correo | Nulo (corre en servidor) |
| **Manual PWA** | Usuario llena formulario en la app. | Nula (no hay setup) | Nulo |

---

## Opciones exploradas

### A. Status quo: iOS Shortcut SMS universal (ya implementado)

**Cómo funciona:**
El archivo `ios_shortcut/SETUP.md` documenta el flujo completo:
1. Usuario abre link de iCloud → instala el Shortcut en un tap.
2. Crea una automatización "Message" con trigger `$` y "Run Immediately" activado.
3. La primera vez que llega un SMS bancario, el Shortcut pide el userId, lo guarda en `iCloud Drive/Shortcuts/finanzas_usuario.txt`.
4. Cada SMS con `$` se postea automáticamente a `https://finanzas-abiertas.pages.dev/api/sms`.
5. El servidor detecta el banco, parsea el monto/comercio y lo graba en el Sheet.

**Ventajas:**
- Un solo Shortcut cubre todos los bancos.
- No hay secreto en el dispositivo (lo inyecta Cloudflare).
- El userId se pregunta una sola vez.
- Apple ha confirmado que los triggers "Message" con "Run Immediately" corren en background sin confirmación (iOS 16+).

**Fricción restante:**
- Configurar la automatización (7 pasos) todavía se hace a mano.
- El userId hay que saberlo de antemano (el admin lo tiene que comunicar).
- iOS 15 muestra un banner de confirmación cada vez.

**Veredicto:** Ya es la práctica estándar para este caso de uso. El link de iCloud pre-construido es la parte más valiosa porque elimina el paso de armar el Shortcut.

---

### B. Reducir la fricción del setup iOS con `shortcut-config.js`

Ya existe `functions/api/shortcut-config.js`: un endpoint autenticado que devuelve la `webhookUrl` y el `secret` al Shortcut. El Shortcut podría leer ese endpoint en el primer run y auto-configurarse.

**Opción B1 — QR o link desde la PWA:**
La app genera un link del tipo `shortcuts://run-shortcut?name=...&input=...` o un deep link que pre-popula el userId directamente en el flujo de instalación. El usuario escanea un QR desde la app y ya llega con su userId configurado.

- Esfuerzo: bajo (solo la pantalla de onboarding en la PWA + un parámetro en el Shortcut).
- Fricción para el usuario: mínima — la app le da todo, solo toca "Agregar".

**Opción B2 — Shortcut que se auto-registra:**
El Shortcut, al primer run, llama a `shortcut-config.js` con el token de sesión del usuario (guardado también en iCloud) y descarga la URL. Sin intervención del admin.

- Esfuerzo: medio (el Shortcut se vuelve más complejo con lógica de token).

**Veredicto B1:** Es la mejora de mayor impacto con menor esfuerzo. Vale la pena como próximo paso.

---

### C. Android: apps open-source de SMS-gateway

El APK actual hace más que reenviar SMS: captura **notificaciones push** de apps bancarias (incluidas Nequi, dale!, Rappi que no envían SMS). Es más potente que un simple SMS forwarder. Las alternativas open-source principales son:

| Proyecto | Canal | Estado | Pro | Contra |
|----------|-------|--------|-----|--------|
| [sms-gate.app](https://sms-gate.app) | SMS entrantes | Activo, en Play Store | Documentado, webhooks nativos | Solo SMS (no notificaciones push) |
| [bogkonstantin/android_income_sms_gateway_webhook](https://github.com/bogkonstantin/android_income_sms_gateway_webhook) | SMS entrantes | Mantenimiento irregular | Simple, open-source | Solo SMS, APK manual |
| APK custom actual | Notificaciones push | En este repo | Captura push + SMS, reintentos | Sin Play Store, actualización manual |

**Recomendación C:** Mantener el APK custom para Android mientras capture notificaciones push. Si el objetivo se reduce a solo SMS, `sms-gate.app` es más fácil de mantener (está en Play Store). Pero perderíamos captura de Nequi/dale!/Rappi.

---

### D. Apps de terceros "SMS Forwarder" (App Store)

Existen apps como **SMS Forwarder** (App Store) que hacen exactamente esto: escuchan SMS y los envían a un webhook configurable. Sin código de parte nuestra.

**Pro:** Cero mantenimiento, cross-platform, UX pulida.  
**Contra:** Dependencia de un tercero, posibles costos de suscripción, privacidad de datos bancarios delegada a un tercero. En iOS, Apple restringe el acceso a SMS de terceros — las apps del App Store no pueden leer SMS de bancos (solo pueden leer conversaciones donde el usuario está en la app). Esto las hace **inviables en iOS**.

**Veredicto D:** No recomendado. En iOS no funciona por restricciones del OS. En Android hay opciones, pero expone datos bancarios a terceros.

---

### E. Email forwarding (ya parcialmente implementado)

GAS tiene un trigger que corre cada 5 minutos y lee el Gmail del admin buscando correos de bancos específicos (Nequi, Rappi, dale!). Si el banco envía correo transaccional, este canal es **el más automático de todos**: no requiere configuración en el dispositivo, corre 100% del lado servidor.

**Expansión posible:**
- Revisar cuáles bancos colombianos envían correo transaccional (Bancolombia sí, Davivienda sí, Itaú parcialmente).
- Crear parsers de email para cada banco que los envíe.
- El usuario solo necesita asegurarse de que su cuenta de Gmail es la misma que usa el admin de GAS.

**Pro:** Cero fricción para el usuario final. No depende del teléfono.  
**Contra:** Latencia de hasta 5 min. No todos los bancos envían correo. Algunos bancos piden activar correos transaccionales en la app (1 paso).

**Veredicto E:** El canal de menor fricción a largo plazo. Expandir el email forwarding para más bancos es la inversión más rentable.

---

### F. Número SMS en la nube (Twilio, Vonage, Amazon SNS)

Un número de teléfono virtual que recibe SMS y los reenvía a nuestro webhook. El usuario tendría que **activar el reenvío de SMS de su banco** a ese número, algo que los bancos colombianos no ofrecen en sus apps.

**Veredicto F:** No viable. El banco envía SMS al número registrado del usuario, no hay forma fácil de que ese SMS llegue a un número virtual sin intervención del usuario para cada mensaje.

---

## Resumen y recomendaciones

### Prioridad 1 — iOS: mejorar la experiencia de primer uso (Opción B1)

El canal SMS de iOS ya está implementado y funciona. La fricción que queda es la configuración inicial. Añadir a la PWA una pantalla de onboarding que genere un QR/link con el userId pre-cargado reduciría el setup a 2-3 taps.

### Prioridad 2 — Email forwarding: expandir parsers (Opción E)

Para los bancos que envían correo transaccional (Bancolombia, Davivienda), el email forwarding ya en GAS es el canal con menos fricción posible. Invertir en parsers de email para esos bancos elimina completamente la necesidad de configurar el teléfono para esos casos.

### Prioridad 3 — Android: mantener el APK (Opción C)

El APK actual es más potente que cualquier alternativa open-source para Android porque captura notificaciones push (no solo SMS). El único problema es la distribución sin Play Store. A largo plazo, explorar publicarlo en Play Store o en un canal de distribución directa (link de descarga desde la PWA).

### No hacer (por ahora)

- Apps de terceros (privacidad).
- Número SMS en la nube (no viable en Colombia).
- Shortcut por banco (el universal ya existe y es mejor).

---

## Preguntas abiertas

1. ¿Qué bancos actualmente activos en el despliegue envían correo transaccional? (Puede expandirse fácilmente el email forwarding para esos.)
2. ¿Vale la pena la pantalla de onboarding en la PWA para el B1? ¿Cuántos usuarios nuevos se esperan?
3. Para el APK Android: ¿se podría alojar el APK firmado en un link de descarga dentro de la PWA y notificar cuando hay actualización?

---

## Fuentes

- [Communication triggers in Shortcuts — Apple Support](https://support.apple.com/guide/shortcuts/communication-triggers-apdd711f9dff/ios)
- [All Automations Now Run Immediately In Shortcuts — Matthew Cassinelli](https://matthewcassinelli.com/automations-run-immediately-shortcuts-notifications/)
- [Forward SMS to Webhook with iPhone Shortcut Automations — DEV Community](https://dev.to/noha1337/forward-sms-to-webhook-with-iphone-shortcut-automations-4d6)
- [How to forward SMS from Android to webhook — httpSMS](https://httpsms.com/blog/forward-incoming-sms-from-phone-to-webhook/)
- [SMS Gateway for Android — Webhooks docs](https://docs.sms-gate.app/features/webhooks/)
- [android_income_sms_gateway_webhook — GitHub](https://github.com/bogkonstantin/android_income_sms_gateway_webhook)
- [How to Forward SMS to a Webhook — AutoForward Text](https://www.autoforwardtext.com/blog/forward-sms-to-webhook-api/)
