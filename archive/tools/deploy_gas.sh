#!/bin/bash
# deploy_gas.sh — Sube webhook.gs + setup_triggers.gs a GAS y redesplega
#
# Primera vez: te pide el Script ID (lo encuentras en script.google.com →
# el proyecto → Configuración del proyecto → "ID de script")
# Las siguientes veces: corre sin interacción.
#
# Uso:
#   bash tools/deploy_gas.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
GAS_DIR="$ROOT/apps_script"
CLASP_JSON="$GAS_DIR/.clasp.json"
APPSSCRIPT_JSON="$GAS_DIR/appsscript.json"

# ID del deployment existente (extraído de WEBHOOK_URL en .env)
# Cambia esto si alguna vez recreas el deployment desde cero.
DEPLOY_ID="AKfycbzkpaTKKIpIG1a-tugeCM3aSFUZJU6VD3s8qx1RN1svjxVBi2miRtN0M2is_lVTwNm9"

# ── 1. Instalar clasp si no está disponible ─────────────────────────────────
if ! command -v clasp &>/dev/null; then
  echo "► Instalando @google/clasp..."
  npm install -g @google/clasp
fi

# ── 2. Login ─────────────────────────────────────────────────────────────────
if ! clasp login --status 2>/dev/null | grep -q "You are logged in"; then
  echo ""
  echo "► Se necesita autenticación con Google. Se abrirá el navegador..."
  clasp login
fi

# ── 3. .clasp.json (pide Script ID la primera vez) ───────────────────────────
if [ ! -f "$CLASP_JSON" ]; then
  echo ""
  echo "┌─────────────────────────────────────────────────────────────┐"
  echo "│  Primera vez — necesito el ID de tu proyecto GAS            │"
  echo "│                                                              │"
  echo "│  Cómo obtenerlo:                                             │"
  echo "│  1. Abre script.google.com                                   │"
  echo "│  2. Abre el proyecto Finanzas                                │"
  echo "│  3. Clic en ⚙ Configuración del proyecto                    │"
  echo "│  4. Copia el valor de \"ID de script\"                         │"
  echo "│     (empieza con '1...' y tiene ~57 caracteres)              │"
  echo "└─────────────────────────────────────────────────────────────┘"
  echo ""
  read -rp "Script ID: " SCRIPT_ID
  if [ -z "$SCRIPT_ID" ]; then
    echo "Error: Script ID vacío. Saliendo."
    exit 1
  fi
  echo "{\"scriptId\":\"$SCRIPT_ID\",\"rootDir\":\"./\"}" > "$CLASP_JSON"
  echo "✓ .clasp.json creado"
fi

# ── 4. appsscript.json (requerido por clasp push) ────────────────────────────
if [ ! -f "$APPSSCRIPT_JSON" ]; then
  cat > "$APPSSCRIPT_JSON" << 'MANIFEST'
{
  "timeZone": "America/Bogota",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "access": "ANYONE_ANONYMOUS",
    "executeAs": "USER_DEPLOYING"
  }
}
MANIFEST
  echo "✓ appsscript.json creado"
fi

# ── 5. Push ───────────────────────────────────────────────────────────────────
echo ""
echo "► Subiendo archivos a GAS..."
cd "$GAS_DIR"
clasp push --force

# ── 6. Redeploy (mantiene la misma URL del webhook) ───────────────────────────
echo ""
echo "► Creando nueva versión en deployment existente..."
clasp deploy \
  --deploymentId "$DEPLOY_ID" \
  --description "deploy $(date '+%Y-%m-%d %H:%M')" \
  2>/dev/null || {
    echo ""
    echo "⚠ No se pudo actualizar el deployment existente."
    echo "  Puede que necesites re-crear el deployment desde el editor."
    echo "  La URL del webhook cambiaría en ese caso — actualiza .env"
  }

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅  Código subido y redesplegado                            ║"
echo "║                                                              ║"
echo "║  ÚLTIMO PASO — ejecutar el trigger de backup (una sola vez): ║"
echo "║                                                              ║"
echo "║  1. Abre script.google.com → proyecto Finanzas               ║"
echo "║  2. En el menú de funciones, selecciona:                     ║"
echo "║       setupWeeklyBackupTrigger                               ║"
echo "║  3. Clic en ▶ Run                                            ║"
echo "║                                                              ║"
echo "║  Esto programa el backup automático cada domingo a las 3am.  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
