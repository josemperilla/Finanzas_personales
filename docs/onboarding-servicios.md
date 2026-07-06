# Onboarding: arriendo + servicios públicos

Guía rápida para registrar tus pagos recurrentes en el tab **Facturas** de la app y que la
extensión los mantenga al día con el valor y la fecha real de cada factura.

> Estos datos son **tuyos** y se registran desde la UI (Facturas → + Agregar). Los números
> de cuenta NO van en el código del repo; viven cifrados en el backend (Script Properties
> del Apps Script).

## 1. Registrar cada pago (2 minutos)

En la app: **Facturas → + Agregar**, elige el proveedor y completa:

| Servicio      | Proveedor (catálogo)  | Número de cuenta/contrato | Categoría sugerida | Día de vencimiento (1-28) |
|---------------|-----------------------|---------------------------|--------------------|---------------------------|
| Internet      | ETB                   | 12055099277               | Suscripciones      | el de tu factura          |
| Electricidad  | Enel Codensa          | 40068587                  | Hogar              | el de tu factura          |
| Gas           | Vanti                 | 62227033                  | Hogar              | el de tu factura          |
| Agua          | Acueducto de Bogotá   | 12084368                  | Hogar              | el de tu factura          |
| Arriendo      | Arriendo              | _(sin número de cuenta)_  | Hogar              | día del mes que se paga   |

Notas:
- El **día de vencimiento** es el que usa la app para los recordatorios y el calendario
  mensual. Si no lo sabes aún, pon uno aproximado; la extensión lo corregirá la primera
  vez que consultes la factura real.
- El **monto** es opcional al crear (es un aproximado). La extensión lo reemplaza por el
  valor real cuando lo lee del portal.
- Para **Arriendo** no hay consulta automática (no es un servicio público): lo registras
  una vez con monto y día fijos, y la app te lo recuerda cada mes.

## 2. Conectar la extensión (para consultar valor + fecha reales)

La consulta automática del valor y la fecha límite de pago funciona con una **extensión de
navegador** que lee tu factura cuando abres el portal del proveedor (con tu sesión). El
scraper del servidor no puede contra estos portales porque son SPAs con captcha.

Pasos:
1. **Genera el token** en la app: **Facturas → 🧩 Extensión → Copiar**.
2. Instala la extensión: Chrome → `chrome://extensions` → activa **Modo desarrollador**
   → **Cargar descomprimida** → selecciona la carpeta `extension/` del proyecto.
3. Clic derecho en la extensión → **Opciones** → pega el token → **Guardar**.
4. Cada vez que quieras actualizar una factura: abre el portal del proveedor, inicia
   sesión, ve a la página de tu factura, abre la extensión y dale **Enviar a Finanzas**.

La extensión reconoce ETB, Enel, Vanti y Acueducto de Bogotá por el dominio, y ya trae
intentos de extracción específicos para cada uno. Si no acierta el monto/fecha, los
escribes a mano en el popup y envías. Ver `extension/README.md` para afinar la extracción.

## 3. Activar recordatorios de vencimiento

Para que no se te olviden los pagos:
- **Destacado en Home**: al abrir la app, verás una banda arriba si algo está vencido,
  vence hoy o vence mañana (rojo = vencido, ámbar = hoy, verde = mañana).
- **Notificaciones del navegador**: en **Ajustes → Alertas → Recordatorios de
  vencimiento**, activa el toggle y concede el permiso. La app te avisará al abrirla.

> ⚠️ **Limitación honesta**: las notificaciones se disparan **al abrir la app**, no en
> segundo plano. Para avisos que te lleguen sin abrir la app (email), se puede activar el
> sistema de alertas por correo que ya existe en el backend — queda como mejora futura.

## 4. Mantenimiento

- La extensión **no** consulta en segundo plano: tú la abres cuando quieres actualizar el
  valor de una factura. Como recordatorio, conviene hacerlo una vez por semana al recibir
  la factura (p. ej. el fin de semana).
- Cuando pagues una factura, la app la marca como **Pagada** automáticamente si detecta una
  transacción del mismo monto (±15%) y categoría en los días cercanos (±5 días). No tienes
  que hacer nada manual.
