# Configuración del iPhone — iOS Shortcuts

Solo necesitas **una automatización de SMS** que funciona para todos los bancos. El Shortcut detecta tu banco automáticamente y te pide tu ID de usuario la primera vez (nunca más).

---

## Opción A — Instalar desde link (recomendado)

1. Abre este link en tu iPhone: **https://www.icloud.com/shortcuts/57a54a9b81264b9eb74a676be144f858**
2. Toca **Add Shortcut**
3. Ve a la pestaña **Automation** → toca **+** → **New Automation** → **Message**
4. En "contains" escribe: **`$`** — deja "From" en **Anyone**
5. Activa **"Run Immediately"** → desactiva **"Ask Before Running"**
6. Toca **Next** → busca el Shortcut recién instalado y selecciónalo
7. Toca **Done**

La primera vez que llegue un SMS bancario con `$`, el Shortcut pregunta tu ID de usuario, lo guarda en iCloud Drive, y nunca vuelve a preguntar.

> **¿Cuál es mi ID?** Lo ves en la app → Tutorial → canal SMS, o en Ajustes → perfil.

---

## Opción B — Crear desde ceros (para el admin o si el link no funciona)

### Crear la automatización

1. Abre **Shortcuts** → pestaña **Automation** (ícono de reloj, barra inferior)
2. Toca **+** → **New Automation**
3. Selecciona **Message**
4. En "contains" escribe: **`$`** — deja "From" en **Anyone**
5. Activa **"Run Immediately"** → desactiva **"Ask Before Running"**
6. Toca **Next**

### Acción 1 — Leer el ID guardado (puede no existir aún)

7. Toca **Add Action** → busca **"Get File from Folder"**
8. Folder: **Shortcuts**
9. File Name: `finanzas_usuario.txt`
10. **"Error If Not Found"** → **OFF**

### Acción 2 — Condición: ¿ya tenemos el ID?

11. Toca **Add Action** → busca **"If"**
12. Primer campo: toca → selecciona **Name** (resultado Acción 1)
13. Operador: **does not have any value**

### Acción 3 — (DENTRO del If) Pedir el ID

14. Toca el **+** DENTRO del bloque "If" (entre "If" y "Otherwise")
15. Busca **"Ask For Input"**
16. Pregunta: `¿Cuál es tu user ID de Finanzas Personales?`
17. Type: **Text**

### Acción 4 — (DENTRO del If) Guardar el ID

18. Toca el **+** DENTRO del bloque "If" (debajo de "Ask For Input")
19. Busca **"Save File"**
20. Contenido: **Ask for Input** (automático)
21. Destino: **Shortcuts**
22. Subpath: `finanzas_usuario.txt`
23. **"Overwrite If File Exists"** → **ON**

### Acción 5 — Leer el ID (FUERA del If, siempre existe)

24. Toca el **+** DEBAJO de "End If"
25. Busca **"Get File from Folder"**
26. Folder: **Shortcuts**
27. File Name: `finanzas_usuario.txt`
28. **"Error If Not Found"** → **ON**

### Acción 6 — Enviar al servidor

29. Toca **+** → busca **"Get Contents of URL"**
30. URL: `https://finanzas-abiertas.pages.dev/api/sms`
31. Toca **Show More** → Method: **POST** → Request Body: **JSON**
32. Toca **+** y agrega los campos:

| Key | Value |
|-----|-------|
| `userId` | `{x}` → **File** (resultado Acción 5) |
| `sms` | `{x}` → **Message Content** |
| `timestamp` | `{x}` → **Current Date** → ISO 8601 |

33. Toca **✓** → **Don't Ask** → **Done**

> El servidor inyecta el secreto automáticamente — no necesitas configurarlo en el Shortcut.

---

## Bancos soportados

| Banco | Canal |
|-------|-------|
| Banco Itaú | SMS |
| Bancolombia | SMS |
| Davivienda | SMS |
| Banco de Bogotá | SMS |
| AV Villas | SMS |
| Daviplata | SMS |
| Nequi | Push (por app) |
| dale! | Push (por app) |
| Rappi Pay | Push (por app) |

Para bancos no listados: el servidor usa IA para parsear el SMS automáticamente.

---

## Si la transacción no aparece

- Confirma que la automatización tenga "Run Immediately" activado
- Verifica que la URL sea exactamente `https://finanzas-abiertas.pages.dev/api/sms`
- Revisa que el SMS contenga `$` y sea de un banco (mensajes personales o promocionales se descartan automáticamente)
- Para cambiar tu ID: borra `finanzas_usuario.txt` en iCloud Drive → Shortcuts, y el Shortcut vuelve a preguntar
