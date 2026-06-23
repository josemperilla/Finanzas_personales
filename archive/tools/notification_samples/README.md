# Muestras de notificaciones push

Antes de usar los parsers, valida que el texto de la notificación push de cada banco
sea legible. Algunos bancos envían solo un teaser ("Tienes una nueva notificación") —
esos bancos usan SMS como canal principal.

## Cómo capturar el texto exacto

1. Instala **"Notification History Log"** del App Store (iPhone) o Play Store (Android).
2. Haz una transacción real en cada banco (compra pequeña, o pide a alguien que te transfiera).
3. Abre la app y copia el texto exacto del título y cuerpo de la notificación.
4. Guárdalo aquí como `{BANK_CODE}.txt` (un archivo por banco).

## Formato esperado por banco

| Banco               | bank_code | ¿Push rico o teaser? | Acción            |
|---------------------|-----------|----------------------|-------------------|
| Bancolombia         | BCO       | Por confirmar        | Llenar BCO.txt    |
| Davivienda          | DAV       | Por confirmar        | Llenar DAV.txt    |
| Nequi               | NEQ       | Por confirmar        | Llenar NEQ.txt    |
| Banco de Bogotá     | BDB       | Por confirmar        | Llenar BDB.txt    |
| Banco de Occidente  | OCC       | Por confirmar        | Llenar OCC.txt    |
| Banco Popular       | POP       | Por confirmar        | Llenar POP.txt    |
| AV Villas           | AVV       | Por confirmar        | Llenar AVV.txt    |
| dale! (Aval)        | DAL       | Por confirmar        | Llenar DAL.txt    |
| Banco Itaú          | ITA       | Por confirmar        | Llenar ITA.txt    |
| Rappi Pay           | RAP       | Por confirmar        | Llenar RAP.txt    |

## Estructura de cada archivo .txt

```
TITLE: [texto exacto del título de la notificación]
BODY:  [texto exacto del cuerpo de la notificación]
DATE:  [fecha de la transacción]
TYPE:  rich | teaser   ← "rich" si incluye monto+comercio, "teaser" si no
```

## Ejemplo — Bancolombia (hipotético)

```
TITLE: Bancolombia
BODY:  Compra $45,900 Éxito Chapinero • *4521
DATE:  2026-06-04
TYPE:  rich
```

## Regla de clasificación

- **rich** → monto + comercio presentes → parser push activo
- **teaser** → solo aviso → canal principal = SMS (ya funcionando)
- **sin notificación** → canal principal = email (Nequi, Rappi, dale!)
