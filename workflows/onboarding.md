# Onboarding: Personal Finance Manager

## Requisitos previos

- Python 3.9+
- Java 8+ (solo si se necesita tabula-py como fallback para AV Villas)

### Instalar Java en macOS
```bash
brew install openjdk
```

## Setup inicial

```bash
# 1. Instalar dependencias
python3 -m pip install -r requirements.txt

# 2. Crear archivo .env con tus credenciales
cp .env.example .env
# Edita .env y agrega:
#   ANTHROPIC_API_KEY=sk-ant-...

# 3. Inicializar la base de datos
python3 -c "from tools.db.schema import init_db; init_db()"

# 4. Lanzar la aplicación
streamlit run ui/app.py
```

La app abrirá en `http://localhost:8501`.

## Cargar tus primeros extractos

1. Ve a **Cargar Extractos** en el menú lateral.
2. Sube los PDFs de tus tarjetas (Banco de Bogotá, Itaú, AV Villas).
3. El sistema detecta el banco automáticamente y parsea las transacciones.
4. Ve al **Dashboard** para ver tus gastos.

## Configurar API key de Claude

La API key es necesaria para:
- Categorizar comercios que no están en las reglas predefinidas
- El chat de lenguaje natural

Consigue tu API key en: https://console.anthropic.com

## Agregar bancos nuevos

Ver `workflows/add_new_bank.md`.

## Estructura de archivos

```
tools/         # Scripts Python de ejecución determinística
workflows/     # SOPs en Markdown (este directorio)
ui/            # Interfaz Streamlit
data/          # Base de datos SQLite (creada automáticamente)
.tmp/          # Archivos temporales (ignorados en git)
.env           # Credenciales (NUNCA commitear)
```
