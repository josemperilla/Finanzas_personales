# SOP: Agregar un Nuevo Banco

## Cuándo usar este workflow

Cuando necesites soportar extractos de un banco que no sea Banco de Bogotá, Itaú o AV Villas.

## Pasos

### 1. Obtener muestras del extracto
Consigue al menos 2-3 extractos del banco en el formato que quieras soportar (PDF/XLSX/CSV).

### 2. Inspeccionar la estructura
```python
import pdfplumber
with pdfplumber.open('extracto.pdf') as pdf:
    for i, page in enumerate(pdf.pages[:2]):
        print(f'=== PÁGINA {i+1} ===')
        tables = page.extract_tables()
        print(f'Tablas: {len(tables)}')
        for j, table in enumerate(tables):
            print(f'Tabla {j+1}: {table[:5]}')
        if not tables:
            print(page.extract_text()[:500])
```

### 3. Crear el parser

Crea `tools/ingest/parsers/[banco]_parser.py` heredando de `BaseParser`:

```python
from tools.ingest.parsers.base_parser import BaseParser, RawTransaction

class NuevoBancoParser(BaseParser):
    def get_bank_name(self) -> str:
        return "nuevo_banco"

    def extract(self, filepath: str) -> list[RawTransaction]:
        # Implementar extracción específica
        ...
```

### 4. Registrar en detector.py

En `tools/ingest/detector.py`, agrega patrones en el diccionario `patterns`:
```python
"nuevo_banco": [r"nuevo.?banco", r"nb_extracto"],
```

### 5. Registrar en loader.py

En `tools/ingest/loader.py`, agrega en `_get_parser()`:
```python
if bank == "nuevo_banco":
    from tools.ingest.parsers.nuevo_banco_parser import NuevoBancoParser
    return NuevoBancoParser()
```

### 6. Probar
```python
from tools.db.schema import init_db
from tools.ingest.loader import load_file
init_db()
result = load_file('ruta/al/extracto.pdf')
print(result)
```

### 7. Documentar gotchas

Agrega una sección en este workflow con los quirks específicos del banco
(formato de fechas, formato de montos, columnas especiales, etc.).

## Gotchas por banco

### Banco de Bogotá
- Transacciones comprimidas en celdas multi-línea
- Montos en formato US con coma como miles: `89,262` = 89.262 COP
- Transacciones en moneda extranjera: segunda línea en descripción con `EUR 84,20`

### Itaú
- Tablas limpias con bordes — pdfplumber `extract_tables()` funciona bien
- Prefijo "COMPRA EN " en descripciones — se limpia con merchant_cleaner

### AV Villas
- Algunos extractos son imágenes — tabula con lattice mode puede ayudar
- Nombres de meses en español: "15 ene 2024"
